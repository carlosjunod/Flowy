import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import type { Digest } from '@/lib/digest/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const list = await auth.pb.collection('digests').getList<Digest>(1, 30, {
      filter: `user = "${auth.userId}"`,
      sort: '-generated_at',
    });
    return NextResponse.json({ data: list.items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LIST_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
