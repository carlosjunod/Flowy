import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import type { Digest } from '@/lib/digest/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  try {
    const digest = await auth.pb.collection('digests').getOne<Digest>(id);
    if (digest.user !== auth.userId) {
      return NextResponse.json({ error: 'DIGEST_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ data: digest });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return NextResponse.json({ error: 'DIGEST_NOT_FOUND' }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : 'LOAD_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
