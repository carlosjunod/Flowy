import { NextResponse, type NextRequest } from 'next/server';
import PocketBase, { ClientResponseError } from 'pocketbase';

export const runtime = 'nodejs';

interface RequestBody {
  email?: string;
  password?: string;
  name?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

function pbServer(): PocketBase {
  return new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
}

async function authAdmin(pb: PocketBase): Promise<void> {
  const email = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required');
  await pb.admins.authWithPassword(email, password);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'INVALID_EMAIL' }, { status: 400 });
  }
  if (!password || password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json({ error: 'WEAK_PASSWORD' }, { status: 400 });
  }

  const adminPb = pbServer();
  try {
    await authAdmin(adminPb);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth/register] admin auth failed:', detail);
    return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
  }

  try {
    const created: Record<string, unknown> = {
      email,
      password,
      passwordConfirm: password,
      emailVisibility: false,
      verified: false,
    };
    if (name) created.name = name;
    await adminPb.collection('users').create(created);
  } catch (err) {
    if (err instanceof ClientResponseError) {
      // PocketBase returns 400 with a data.email validation error on duplicates.
      const fields = (err.response as { data?: Record<string, { code?: string }> } | undefined)?.data;
      if (err.status === 400 && fields?.email) {
        return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 });
      }
      console.error(`[auth/register] create failed: status=${err.status} message=${err.message}`);
      return NextResponse.json({ error: 'REGISTRATION_FAILED' }, { status: 500 });
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth/register] create failed:', detail);
    return NextResponse.json({ error: 'REGISTRATION_FAILED' }, { status: 500 });
  }

  // Authenticate the newly-created user on a fresh client (don't clobber admin authStore).
  const userPb = pbServer();
  try {
    const authed = await userPb.collection('users').authWithPassword(email, password);
    return NextResponse.json(
      { data: { token: authed.token, userId: authed.record.id, email } },
      { status: 201 },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'auth_failed';
    console.error('[auth/register] post-create auth failed:', detail);
    return NextResponse.json({ error: 'AUTH_FAILED' }, { status: 500 });
  }
}
