import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import type { JWK } from 'jose';

import {
  verifyGoogleIdentityToken,
  GoogleAuthError,
  GOOGLE_ISSUERS,
  __setJwksFactoryForTest,
} from '../../apps/web/lib/google-auth.js';

const AUD = '1234567890-abcdef.apps.googleusercontent.com';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function buildKey(): Promise<{ privateKey: PrivateKey; publicJwk: JWK; kid: string }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = 'test-kid-google';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { privateKey, publicJwk, kid };
}

async function sign(params: {
  privateKey: PrivateKey;
  kid: string;
  sub?: string;
  aud?: string | string[];
  iss?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  expSecondsFromNow?: number;
}): Promise<string> {
  const {
    privateKey,
    kid,
    sub = 'google-user-001',
    aud = AUD,
    iss = GOOGLE_ISSUERS[0],
    email,
    emailVerified,
    name,
    picture,
    expSecondsFromNow = 300,
  } = params;
  const claims: Record<string, unknown> = {};
  if (email !== undefined) claims.email = email;
  if (emailVerified !== undefined) claims.email_verified = emailVerified;
  if (name !== undefined) claims.name = name;
  if (picture !== undefined) claims.picture = picture;
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expSecondsFromNow);
  return jwt.sign(privateKey);
}

function installJwksStub(jwk: JWK): void {
  const key = { ...jwk };
  __setJwksFactoryForTest(() => {
    const getKey = async ({ kid }: { kid?: string }) => {
      if (kid && kid !== key.kid) throw new Error('no matching key');
      const { importJWK } = await import('jose');
      return importJWK(key, 'RS256');
    };
    return getKey as unknown as ReturnType<typeof import('jose').createRemoteJWKSet>;
  });
}

describe('verifyGoogleIdentityToken', () => {
  let privateKey: PrivateKey;
  let publicJwk: JWK;
  let kid: string;

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = AUD;
    const key = await buildKey();
    privateKey = key.privateKey;
    publicJwk = key.publicJwk;
    kid = key.kid;
    installJwksStub(publicJwk);
  });

  afterEach(() => {
    __setJwksFactoryForTest(null);
    vi.useRealTimers();
  });

  it('valid token → returns sub + email + emailVerified', async () => {
    const token = await sign({
      privateKey,
      kid,
      sub: 'g-1',
      email: 'alice@example.com',
      emailVerified: true,
      name: 'Alice',
      picture: 'https://lh3.googleusercontent.com/a/test',
    });
    const result = await verifyGoogleIdentityToken(token);
    expect(result.sub).toBe('g-1');
    expect(result.email).toBe('alice@example.com');
    expect(result.emailVerified).toBe(true);
    expect(result.name).toBe('Alice');
    expect(result.picture).toContain('googleusercontent.com');
  });

  it('accepts alternate issuer (accounts.google.com without scheme)', async () => {
    const token = await sign({ privateKey, kid, sub: 'g-2', iss: 'accounts.google.com' });
    const result = await verifyGoogleIdentityToken(token);
    expect(result.sub).toBe('g-2');
  });

  it('token without email → returns sub, no email', async () => {
    const token = await sign({ privateKey, kid, sub: 'g-3' });
    const result = await verifyGoogleIdentityToken(token);
    expect(result.sub).toBe('g-3');
    expect(result.email).toBeUndefined();
    expect(result.emailVerified).toBeUndefined();
  });

  it('email_verified as string "true" → coerced to boolean', async () => {
    const token = await sign({
      privateKey,
      kid,
      sub: 'g-4',
      email: 'bob@example.com',
      // SignJWT serializes claim values as-is; passing the string forces the
      // coercion path in the verifier.
      emailVerified: 'true' as unknown as boolean,
    });
    const result = await verifyGoogleIdentityToken(token);
    expect(result.emailVerified).toBe(true);
  });

  it('empty token → throws INVALID_GOOGLE_TOKEN', async () => {
    await expect(verifyGoogleIdentityToken('')).rejects.toThrow(GoogleAuthError);
  });

  it('wrong audience → throws INVALID_GOOGLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, aud: 'some.other.app' });
    await expect(verifyGoogleIdentityToken(token)).rejects.toThrow(GoogleAuthError);
  });

  it('wrong issuer → throws INVALID_GOOGLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, iss: 'https://evil.example.com' });
    await expect(verifyGoogleIdentityToken(token)).rejects.toThrow(GoogleAuthError);
  });

  it('expired token → throws INVALID_GOOGLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, expSecondsFromNow: -60 });
    await expect(verifyGoogleIdentityToken(token)).rejects.toThrow(GoogleAuthError);
  });

  it('tampered signature → throws INVALID_GOOGLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, sub: 'g-1' });
    const parts = token.split('.');
    const sig = parts[2] ?? '';
    const tampered = `${parts[0]}.${parts[1]}.AAAA${sig.slice(4)}`;
    await expect(verifyGoogleIdentityToken(tampered)).rejects.toThrow(GoogleAuthError);
  });

  it('signed by unknown key → throws INVALID_GOOGLE_TOKEN', async () => {
    const otherKeys = await buildKey();
    const token = await sign({ privateKey: otherKeys.privateKey, kid: otherKeys.kid });
    await expect(verifyGoogleIdentityToken(token)).rejects.toThrow(GoogleAuthError);
  });

  it('non-string token → throws INVALID_GOOGLE_TOKEN', async () => {
    await expect(verifyGoogleIdentityToken(undefined as unknown as string)).rejects.toThrow(GoogleAuthError);
  });

  it('missing GOOGLE_CLIENT_ID → throws INVALID_GOOGLE_TOKEN', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const token = await sign({ privateKey, kid });
    await expect(verifyGoogleIdentityToken(token)).rejects.toThrow(GoogleAuthError);
  });
});
