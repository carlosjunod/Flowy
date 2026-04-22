import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// Google publishes two valid issuer strings for identity tokens. Both must be
// accepted per https://developers.google.com/identity/sign-in/web/backend-auth.
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
export const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

export interface GoogleIdentity {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

export class GoogleAuthError extends Error {
  readonly code: 'INVALID_GOOGLE_TOKEN';
  constructor(detail: string) {
    super(detail);
    this.name = 'GoogleAuthError';
    this.code = 'INVALID_GOOGLE_TOKEN';
  }
}

type JwksFactory = () => ReturnType<typeof createRemoteJWKSet>;

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function defaultJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks) cachedJwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  return cachedJwks;
}

// Injectable for tests — the test suite swaps in a stub that serves a
// locally-generated JWK so we never hit Google's real JWKS endpoint.
let jwksFactory: JwksFactory = defaultJwks;

export function __setJwksFactoryForTest(factory: JwksFactory | null): void {
  jwksFactory = factory ?? defaultJwks;
  if (factory === null) cachedJwks = null;
}

function getAudience(): string {
  const aud = process.env.GOOGLE_CLIENT_ID ?? '';
  if (!aud) {
    throw new GoogleAuthError('GOOGLE_CLIENT_ID not set');
  }
  return aud;
}

export async function verifyGoogleIdentityToken(token: string): Promise<GoogleIdentity> {
  if (!token || typeof token !== 'string') {
    throw new GoogleAuthError('empty_token');
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, jwksFactory(), {
      issuer: [...GOOGLE_ISSUERS],
      audience: getAudience(),
    });
    payload = result.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'verify_failed';
    throw new GoogleAuthError(message);
  }

  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') throw new GoogleAuthError('missing_sub');

  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const emailVerified = coerceBool(payload.email_verified);
  const name = typeof payload.name === 'string' ? payload.name : undefined;
  const picture = typeof payload.picture === 'string' ? payload.picture : undefined;

  return { sub, email, emailVerified, name, picture };
}

function coerceBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
