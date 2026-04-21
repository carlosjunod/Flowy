import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  GoogleOAuthError,
  loadGoogleConfig,
  verifyState,
} from '@/lib/google-oauth';
import { getAdminPb, upsertIntegration } from '@/lib/integrations';

export const runtime = 'nodejs';

function redirectToSettings(req: NextRequest, params: Record<string, string>): NextResponse {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const url = new URL('/settings', base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 302 });
}

// GET /api/integrations/gmail/callback?code=...&state=...
//
// Invoked by Google after the user consents. We validate the signed state
// (must match the authenticated session's userId), exchange the code for
// tokens, fetch the Google profile, and upsert the record into `integrations`.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const errorParam = req.nextUrl.searchParams.get('error');
  if (errorParam) {
    return redirectToSettings(req, { gmail: 'error', reason: errorParam });
  }
  const code = req.nextUrl.searchParams.get('code');
  const stateToken = req.nextUrl.searchParams.get('state');
  if (!code || !stateToken) {
    return redirectToSettings(req, { gmail: 'error', reason: 'MISSING_PARAMS' });
  }

  const auth = await authenticate(req);
  if (!auth.ok) {
    return redirectToSettings(req, { gmail: 'error', reason: 'UNAUTHORIZED' });
  }

  let statePayload;
  try {
    statePayload = verifyState(stateToken);
  } catch (err) {
    const reason = err instanceof GoogleOAuthError ? err.code : 'INVALID_STATE';
    return redirectToSettings(req, { gmail: 'error', reason });
  }

  if (statePayload.userId !== auth.userId) {
    return redirectToSettings(req, { gmail: 'error', reason: 'STATE_USER_MISMATCH' });
  }

  let config;
  try {
    config = loadGoogleConfig();
  } catch (err) {
    const reason = err instanceof GoogleOAuthError ? err.code : 'CONFIG_FAILED';
    return redirectToSettings(req, { gmail: 'error', reason });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, config);
  } catch (err) {
    const reason = err instanceof GoogleOAuthError ? err.code : 'CODE_EXCHANGE_FAILED';
    return redirectToSettings(req, { gmail: 'error', reason });
  }

  let userInfo;
  try {
    userInfo = await fetchUserInfo(tokens.accessToken);
  } catch (err) {
    const reason = err instanceof GoogleOAuthError ? err.code : 'USERINFO_FAILED';
    return redirectToSettings(req, { gmail: 'error', reason });
  }

  try {
    const pb = await getAdminPb();
    await upsertIntegration(pb, {
      userId: auth.userId,
      provider: 'google',
      providerSub: userInfo.sub,
      providerEmail: userInfo.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scope,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'UPSERT_FAILED';
    return redirectToSettings(req, { gmail: 'error', reason });
  }

  return redirectToSettings(req, { gmail: 'connected' });
}
