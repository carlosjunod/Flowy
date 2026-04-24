import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { deleteItemWithCascade } from '@/lib/items-delete';

export const runtime = 'nodejs';

const MAX_IDS = 100;

export async function POST(req: NextRequest | Request): Promise<Response> {
  const auth = await authenticate(req as NextRequest);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const body = raw as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const ids = body.ids as string[];
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: 'TOO_MANY_IDS' }, { status: 413 });
  }

  const succeeded: string[] = [];
  const failed: Array<{ id: string; code: string; message?: string }> = [];

  for (const id of ids) {
    const result = await deleteItemWithCascade(auth.pb, id, auth.userId);
    if (result.ok) succeeded.push(id);
    else failed.push({ id, code: result.code, message: result.message });
  }

  return NextResponse.json({ data: { succeeded, failed } });
}
