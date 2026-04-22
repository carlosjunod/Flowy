import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { isValidDigestTime, type DigestSettings } from '@/lib/digest/types';

export const runtime = 'nodejs';

interface SettingsBody {
  digest_enabled?: unknown;
  digest_time?: unknown;
}

function sanitize(raw: unknown): Partial<DigestSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as SettingsBody;
  const out: Partial<DigestSettings> = {};
  if (typeof input.digest_enabled === 'boolean') {
    out.digest_enabled = input.digest_enabled;
  }
  if (isValidDigestTime(input.digest_time)) {
    out.digest_time = input.digest_time;
  }
  return out;
}

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const user = await auth.pb.collection('users').getOne<{
      digest_enabled?: boolean;
      digest_time?: string;
    }>(auth.userId, { fields: 'digest_enabled,digest_time' });
    return NextResponse.json({
      data: {
        digest_enabled: Boolean(user.digest_enabled),
        digest_time: typeof user.digest_time === 'string' && user.digest_time.length > 0
          ? user.digest_time
          : '08:00',
      } satisfies DigestSettings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LOAD_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const patch = sanitize(raw);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'NO_VALID_FIELDS' }, { status: 400 });
  }

  try {
    const updated = await auth.pb.collection('users').update<{
      digest_enabled?: boolean;
      digest_time?: string;
    }>(auth.userId, patch);
    return NextResponse.json({
      data: {
        digest_enabled: Boolean(updated.digest_enabled),
        digest_time: updated.digest_time ?? '08:00',
      } satisfies DigestSettings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UPDATE_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
