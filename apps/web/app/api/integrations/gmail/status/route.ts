import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { findIntegration, getAdminPb } from '@/lib/integrations';

export const runtime = 'nodejs';

// GET /api/integrations/gmail/status
// Returns whether the current user has a connected Gmail integration.
// Tokens themselves are never exposed — we only return safe metadata.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const pb = await getAdminPb();
    const record = await findIntegration(pb, auth.userId, 'google');
    if (!record) {
      return NextResponse.json({ data: { connected: false } }, { status: 200 });
    }
    return NextResponse.json(
      {
        data: {
          connected: record.status === 'active',
          status: record.status,
          email: record.provider_email ?? null,
          scopes: record.scopes ?? [],
          last_sync_at: record.last_sync_at ?? null,
          error_msg: record.error_msg || null,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'STATUS_FAILED';
    return NextResponse.json({ error: 'STATUS_FAILED', detail }, { status: 500 });
  }
}
