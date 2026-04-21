import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import {
  buildAuthUrl,
  createState,
  loadGoogleConfig,
  GoogleOAuthError,
} from '@/lib/google-oauth';

export const runtime = 'nodejs';

// GET /api/integrations/gmail/connect
//
// Produces the Google consent URL for the signed-in user. Returns JSON when
// the client prefers it (`Accept: application/json` or `?mode=json`), otherwise
// issues a 302 redirect — letting us support both a `<a href>`-style connect
// button and a `fetch`-then-redirect flow.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let config;
  try {
    config = loadGoogleConfig();
  } catch (err) {
    if (err instanceof GoogleOAuthError) {
      return NextResponse.json({ error: err.code }, { status: 500 });
    }
    throw err;
  }

  let state: string;
  try {
    state = createState(auth.userId);
  } catch (err) {
    if (err instanceof GoogleOAuthError) {
      return NextResponse.json({ error: err.code }, { status: 500 });
    }
    throw err;
  }

  const authUrl = buildAuthUrl({ config, state });

  const wantsJson =
    req.nextUrl.searchParams.get('mode') === 'json' ||
    (req.headers.get('accept') ?? '').includes('application/json');
  if (wantsJson) {
    return NextResponse.json({ data: { url: authUrl } }, { status: 200 });
  }
  return NextResponse.redirect(authUrl, { status: 302 });
}
