import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

export interface AppleIdentity {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  isPrivateEmail?: boolean;
}

export class AppleAuthError extends Error {
  readonly code: 'INVALID_APPLE_TOKEN';
  constructor(detail: string) {
    super(detail);
    this.name = 'AppleAuthError';
    this.code = 'INVALID_APPLE_TOKEN';
  }
}

type JwksFactory = () => ReturnType<typeof createRemoteJWKSet>;

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function defaultJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks) cachedJwks = createRemoteJWKSet(APPLE_JWKS_URL);
  return cachedJwks;
}

// Injectable for tests — pass a stub that returns a fixed key set.
let jwksFactory: JwksFactory = defaultJwks;

export function __setJwksFactoryForTest(factory: JwksFactory | null): void {
  jwksFactory = factory ?? defaultJwks;
  if (factory === null) cachedJwks = null;
}

function getAudience(): string | string[] {
  const native = process.env.APPLE_CLIENT_ID ?? 'app.tryflowy.app';
  const web = process.env.APPLE_WEB_CLIENT_ID ?? '';
  // Apple issues `aud` = the bundle ID for native Sign in with Apple
  // (iOS/macOS) and = the Services ID for web Sign in with Apple. Accept
  // either when a Services ID is configured; otherwise keep the original
  // single-audience check to avoid broadening the surface unnecessarily.
  if (web && web !== native) return [native, web];
  return native;
}

export async function verifyAppleIdentityToken(token: string): Promise<AppleIdentity> {
  if (!token || typeof token !== 'string') {
    throw new AppleAuthError('empty_token');
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, jwksFactory(), {
      issuer: APPLE_ISSUER,
      audience: getAudience(),
    });
    payload = result.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'verify_failed';
    throw new AppleAuthError(message);
  }

  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') throw new AppleAuthError('missing_sub');

  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const emailVerified = coerceBool(payload.email_verified);
  const isPrivateEmail = coerceBool(payload.is_private_email);

  return { sub, email, emailVerified, isPrivateEmail };
}

function coerceBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
