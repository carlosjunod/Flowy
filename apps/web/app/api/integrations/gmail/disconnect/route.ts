import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { deleteIntegration, findIntegration, getAdminPb } from '@/lib/integrations';
import { revokeToken } from '@/lib/google-oauth';

export const runtime = 'nodejs';

// POST /api/integrations/gmail/disconnect
// Revokes the refresh token with Google (best-effort) and removes the local record.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const pb = await getAdminPb();
    const existing = await findIntegration(pb, auth.userId, 'google');
    if (!existing) {
      return NextResponse.json({ data: { disconnected: true, alreadyDisconnected: true } }, { status: 200 });
    }

    // Revoke the refresh token when we have one — safer than the access token
    // because it invalidates the whole grant at Google's end.
    const tokenToRevoke = existing.refresh_token || existing.access_token;
    if (tokenToRevoke) {
      try {
        await revokeToken(tokenToRevoke);
      } catch (err) {
        // Surface the revocation failure but still delete locally — leaving a
        // stale record would trap the user in a half-connected state.
        const msg = err instanceof Error ? err.message : 'revoke failed';
        console.warn(`[gmail] revoke failed for user ${auth.userId}: ${msg}`);
      }
    }

    await deleteIntegration(pb, existing.id);
    return NextResponse.json({ data: { disconnected: true } }, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'DISCONNECT_FAILED';
    return NextResponse.json({ error: 'DISCONNECT_FAILED', detail }, { status: 500 });
  }
}
