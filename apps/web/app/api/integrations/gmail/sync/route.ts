import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { findIntegration, getAdminPb } from '@/lib/integrations';
import { getGmailSyncQueue } from '@/lib/queue';

export const runtime = 'nodejs';

interface SyncBody {
  maxMessages?: number;
}

// POST /api/integrations/gmail/sync
// Enqueues a background Gmail pull for the signed-in user.
// Returns 409 if no active Gmail integration exists.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: SyncBody = {};
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as SyncBody) : {};
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  let integration;
  try {
    const pb = await getAdminPb();
    integration = await findIntegration(pb, auth.userId, 'google');
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'LOOKUP_FAILED';
    return NextResponse.json({ error: 'LOOKUP_FAILED', detail }, { status: 500 });
  }

  if (!integration || integration.status !== 'active') {
    return NextResponse.json({ error: 'NOT_CONNECTED' }, { status: 409 });
  }

  const maxMessages =
    typeof body.maxMessages === 'number' && Number.isFinite(body.maxMessages) && body.maxMessages > 0
      ? Math.min(Math.floor(body.maxMessages), 100)
      : 25;

  try {
    const queue = getGmailSyncQueue();
    const job = await queue.add(
      'sync',
      { userId: auth.userId, integrationId: integration.id, maxMessages },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400 },
      },
    );
    return NextResponse.json({ data: { jobId: job.id, maxMessages } }, { status: 202 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'ENQUEUE_FAILED';
    return NextResponse.json({ error: 'ENQUEUE_FAILED', detail }, { status: 500 });
  }
}
