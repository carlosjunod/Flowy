import { NextResponse, type NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { verifyGoogleIdentityToken, GoogleAuthError } from '@/lib/google-auth';

export const runtime = 'nodejs';

interface RequestBody {
  id_token?: string;
  // Older GIS clients sometimes send `credential` instead. Accept both.
  credential?: string;
  email?: string;
}

function pbServer(): PocketBase {
  return new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
}

function derivePassword(sub: string): string {
  const secret = process.env.GOOGLE_PASSWORD_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('GOOGLE_PASSWORD_SECRET must be set to a 32+ char value');
  }
  return createHmac('sha256', secret).update(sub).digest('hex');
}

async function authAdmin(pb: PocketBase): Promise<void> {
  const email = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required');
  await pb.collection('_superusers').authWithPassword(email, password);
}

async function findUserByGoogleSub(
  pb: PocketBase,
  sub: string,
): Promise<{ id: string; email: string } | null> {
  try {
    const record = await pb
      .collection('users')
      .getFirstListItem(`google_sub = "${sub.replace(/"/g, '')}"`);
    return { id: record.id, email: (record as unknown as { email: string }).email };
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const idToken = body.id_token ?? body.credential;
  if (!idToken || typeof idToken !== 'string') {
    return NextResponse.json({ error: 'MISSING_IDENTITY_TOKEN' }, { status: 400 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdentityToken(idToken);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth/google] token verify failed:', detail);
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: err.code }, { status: 401 });
    }
    return NextResponse.json({ error: 'INVALID_GOOGLE_TOKEN' }, { status: 401 });
  }

  let password: string;
  try {
    password = derivePassword(identity.sub);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth/google] derivePassword failed:', detail);
    return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
  }

  const adminPb = pbServer();
  try {
    await authAdmin(adminPb);
  } catch (err) {
    if (err instanceof ClientResponseError) {
      console.error(
        `[auth/google] admin auth failed: status=${err.status} url=${err.url} message=${err.message}`,
      );
    } else {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[auth/google] admin auth failed:', detail);
    }
    return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
  }

  let userRecord: { id: string; email: string };
  try {
    const existing = await findUserByGoogleSub(adminPb, identity.sub);
    if (existing) {
      // Rotate password to current HMAC — keeps secret rotation transparent,
      // same pattern as the Apple route.
      await adminPb.collection('users').update(existing.id, {
        password,
        passwordConfirm: password,
      });
      userRecord = existing;
    } else {
      const providedEmail = identity.email ?? body.email;
      if (!providedEmail) {
        return NextResponse.json({ error: 'EMAIL_REQUIRED_FIRST_LOGIN' }, { status: 400 });
      }
      const created = await adminPb.collection('users').create({
        email: providedEmail,
        password,
        passwordConfirm: password,
        emailVisibility: false,
        // Google has already verified the email if email_verified is true.
        verified: identity.emailVerified ?? true,
        google_sub: identity.sub,
      });
      userRecord = { id: created.id, email: (created as unknown as { email: string }).email };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'user_op_failed';
    return NextResponse.json({ error: 'USER_CREATE_FAILED', detail }, { status: 500 });
  }

  // Auth as the user on a fresh client so the admin authStore isn't clobbered.
  const userPb = pbServer();
  try {
    const authed = await userPb.collection('users').authWithPassword(userRecord.email, password);
    return NextResponse.json(
      { data: { token: authed.token, userId: authed.record.id, email: userRecord.email } },
      { status: 200 },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'auth_failed';
    return NextResponse.json({ error: 'AUTH_FAILED', detail }, { status: 500 });
  }
}
