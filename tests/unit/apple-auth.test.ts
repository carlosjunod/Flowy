import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import type { JWK } from 'jose';

import {
  verifyAppleIdentityToken,
  AppleAuthError,
  APPLE_ISSUER,
  __setJwksFactoryForTest,
} from '../../apps/web/lib/apple-auth.js';

const AUD = 'app.tryflowy.app';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function buildKey(): Promise<{ privateKey: PrivateKey; publicJwk: JWK; kid: string }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = 'test-kid-1';
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
  expSecondsFromNow?: number;
}): Promise<string> {
  const {
    privateKey,
    kid,
    sub = 'apple-user-001',
    aud = AUD,
    iss = APPLE_ISSUER,
    email,
    expSecondsFromNow = 300,
  } = params;
  const jwt = new SignJWT({ email })
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

describe('verifyAppleIdentityToken', () => {
  let privateKey: PrivateKey;
  let publicJwk: JWK;
  let kid: string;

  beforeEach(async () => {
    process.env.APPLE_CLIENT_ID = AUD;
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

  it('valid token → returns sub + email', async () => {
    const token = await sign({ privateKey, kid, sub: 'u-1', email: 'user@example.com' });
    const result = await verifyAppleIdentityToken(token);
    expect(result.sub).toBe('u-1');
    expect(result.email).toBe('user@example.com');
  });

  it('valid token without email → returns sub, no email', async () => {
    const token = await sign({ privateKey, kid, sub: 'u-2' });
    const result = await verifyAppleIdentityToken(token);
    expect(result.sub).toBe('u-2');
    expect(result.email).toBeUndefined();
  });

  it('empty token → throws INVALID_APPLE_TOKEN', async () => {
    await expect(verifyAppleIdentityToken('')).rejects.toThrow(AppleAuthError);
  });

  it('wrong audience → throws INVALID_APPLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, aud: 'some.other.app' });
    await expect(verifyAppleIdentityToken(token)).rejects.toThrow(AppleAuthError);
  });

  it('wrong issuer → throws INVALID_APPLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, iss: 'https://evil.example.com' });
    await expect(verifyAppleIdentityToken(token)).rejects.toThrow(AppleAuthError);
  });

  it('expired token → throws INVALID_APPLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, expSecondsFromNow: -60 });
    await expect(verifyAppleIdentityToken(token)).rejects.toThrow(AppleAuthError);
  });

  it('tampered signature → throws INVALID_APPLE_TOKEN', async () => {
    const token = await sign({ privateKey, kid, sub: 'u-1' });
    const parts = token.split('.');
    const sig = parts[2] ?? '';
    const tampered = `${parts[0]}.${parts[1]}.AAAA${sig.slice(4)}`;
    await expect(verifyAppleIdentityToken(tampered)).rejects.toThrow(AppleAuthError);
  });

  it('signed by unknown key → throws INVALID_APPLE_TOKEN', async () => {
    const otherKeys = await buildKey();
    const token = await sign({ privateKey: otherKeys.privateKey, kid: otherKeys.kid });
    await expect(verifyAppleIdentityToken(token)).rejects.toThrow(AppleAuthError);
  });

  it('non-string token → throws INVALID_APPLE_TOKEN', async () => {
    await expect(verifyAppleIdentityToken(undefined as unknown as string)).rejects.toThrow(AppleAuthError);
  });

  describe('APPLE_WEB_CLIENT_ID (web Sign in with Apple)', () => {
    const WEB_AUD = 'app.tryflowy.app.services';

    afterEach(() => {
      delete process.env.APPLE_WEB_CLIENT_ID;
    });

    it('web aud is accepted when APPLE_WEB_CLIENT_ID is set', async () => {
      process.env.APPLE_WEB_CLIENT_ID = WEB_AUD;
      const token = await sign({ privateKey, kid, sub: 'u-web', aud: WEB_AUD });
      const result = await verifyAppleIdentityToken(token);
      expect(result.sub).toBe('u-web');
    });

    it('native aud still accepted when APPLE_WEB_CLIENT_ID is set', async () => {
      process.env.APPLE_WEB_CLIENT_ID = WEB_AUD;
      const token = await sign({ privateKey, kid, sub: 'u-native', aud: AUD });
      const result = await verifyAppleIdentityToken(token);
      expect(result.sub).toBe('u-native');
    });

    it('unrelated aud still rejected when APPLE_WEB_CLIENT_ID is set', async () => {
      process.env.APPLE_WEB_CLIENT_ID = WEB_AUD;
      const token = await sign({ privateKey, kid, sub: 'u-bad', aud: 'some.other.app' });
      await expect(verifyAppleIdentityToken(token)).rejects.toThrow(AppleAuthError);
    });

    it('web aud rejected when APPLE_WEB_CLIENT_ID is NOT set', async () => {
      // Sanity: no web client id configured → only native aud is acceptable.
      const token = await sign({ privateKey, kid, sub: 'u-web-disabled', aud: WEB_AUD });
      await expect(verifyAppleIdentityToken(token)).rejects.toThrow(AppleAuthError);
    });
  });
});
