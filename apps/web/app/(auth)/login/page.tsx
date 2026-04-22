'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { getPb } from '@/lib/pocketbase';

// Minimal GIS shape — Google's own types aren't available without an extra dep.
interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccounts {
  id: {
    initialize: (config: {
      client_id: string;
      callback: (res: GoogleCredentialResponse) => void;
      ux_mode?: 'popup' | 'redirect';
    }) => void;
    renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
  };
}

// Minimal shape for Apple Sign in JS (appleid.auth.js). Apple's types aren't
// shipped in a package so we declare only what we use.
interface AppleAuthResponse {
  authorization: { id_token: string; code?: string; state?: string };
  user?: { email?: string; name?: { firstName?: string; lastName?: string } };
}

interface AppleAuthAPI {
  init: (config: {
    clientId: string;
    scope: string;
    redirectURI: string;
    usePopup: boolean;
    state?: string;
  }) => void;
  signIn: () => Promise<AppleAuthResponse>;
}

declare global {
  interface Window {
    google?: { accounts?: GoogleAccounts };
    AppleID?: { auth: AppleAuthAPI };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const APPLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_WEB_CLIENT_ID ?? '';
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? '';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  function storeTokenAndRedirect(token: string): void {
    document.cookie = `pb_auth=${encodeURIComponent(token)}; path=/; max-age=604800; samesite=lax`;
    router.push('/chat');
    router.refresh();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const pb = getPb();
    try {
      await pb.collection('users').authWithPassword(email, password);
      storeTokenAndRedirect(pb.authStore.token);
    } catch {
      setError('Invalid email or password');
      setSubmitting(false);
    }
  }

  const handleGoogleCredential = useCallback(
    async (res: GoogleCredentialResponse): Promise<void> => {
      setError(null);
      try {
        const r = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id_token: res.credential }),
        });
        const body = (await r.json().catch(() => ({}))) as {
          data?: { token?: string };
          error?: string;
        };
        if (!r.ok || !body.data?.token) {
          setError(body.error ?? `Google sign-in failed (${r.status})`);
          return;
        }
        const pb = getPb();
        pb.authStore.save(body.data.token, null);
        storeTokenAndRedirect(body.data.token);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google sign-in failed');
      }
    },
    [router],
  );

  useEffect(() => {
    if (!gsiReady || !GOOGLE_CLIENT_ID) return;
    const gis = window.google?.accounts?.id;
    const parent = googleBtnRef.current;
    if (!gis || !parent) return;
    gis.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
    gis.renderButton(parent, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 320,
    });
  }, [gsiReady, handleGoogleCredential]);

  // Init the Apple widget once its script is ready.
  useEffect(() => {
    if (!appleReady || !APPLE_WEB_CLIENT_ID || !APPLE_REDIRECT_URI) return;
    const api = window.AppleID?.auth;
    if (!api) return;
    api.init({
      clientId: APPLE_WEB_CLIENT_ID,
      scope: 'name email',
      redirectURI: APPLE_REDIRECT_URI,
      usePopup: true,
    });
  }, [appleReady]);

  async function handleAppleClick(): Promise<void> {
    if (!window.AppleID?.auth) {
      setError('Apple Sign In unavailable');
      return;
    }
    setError(null);
    setAppleBusy(true);
    try {
      const res = await window.AppleID.auth.signIn();
      const idToken = res.authorization?.id_token;
      if (!idToken) {
        setError('Apple returned no id_token');
        return;
      }
      // Apple includes `user` (with email) on first sign-in only. Forward it
      // so the server can create the PB user on first login.
      const body: Record<string, unknown> = { identity_token: idToken };
      if (res.user?.email) body.email = res.user.email;

      const r = await fetch('/api/auth/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await r.json().catch(() => ({}))) as {
        data?: { token?: string };
        error?: string;
      };
      if (!r.ok || !json.data?.token) {
        setError(json.error ?? `Apple sign-in failed (${r.status})`);
        return;
      }
      const pb = getPb();
      pb.authStore.save(json.data.token, null);
      storeTokenAndRedirect(json.data.token);
    } catch (err) {
      // Apple's popup throws on user-initiated cancel — ignore silently there.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/popup.*closed|cancel/i.test(msg)) setError(msg || 'Apple sign-in failed');
    } finally {
      setAppleBusy(false);
    }
  }

  const googleConfigured = GOOGLE_CLIENT_ID.length > 0;
  const appleConfigured = APPLE_WEB_CLIENT_ID.length > 0 && APPLE_REDIRECT_URI.length > 0;
  const anySocial = googleConfigured || appleConfigured;

  return (
    <>
      {googleConfigured ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGsiReady(true)}
        />
      ) : null}
      {appleConfigured ? (
        <Script
          src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
          strategy="afterInteractive"
          onLoad={() => setAppleReady(true)}
        />
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-white/10 bg-black/40 p-8 shadow-xl"
      >
        <h1 className="text-2xl font-semibold">Sign in to Tryflowy</h1>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm text-white/70">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm focus:border-white/40 focus:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm text-white/70">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm focus:border-white/40 focus:outline-none"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-400" data-testid="login-error">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-white py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {anySocial ? (
          <>
            <div className="flex items-center gap-3 text-xs text-white/50">
              <span className="h-px flex-1 bg-white/10" />
              <span>or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            {appleConfigured ? (
              <button
                type="button"
                onClick={handleAppleClick}
                disabled={appleBusy || !appleReady}
                data-testid="apple-signin"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-black py-2.5 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/5 disabled:opacity-50"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
                  <path d="M11.182 8.568c-.017-1.716 1.403-2.54 1.466-2.58-.798-1.166-2.042-1.326-2.485-1.345-1.058-.107-2.067.623-2.606.623-.54 0-1.366-.607-2.247-.59-1.155.017-2.221.672-2.816 1.706-1.2 2.08-.307 5.155.865 6.845.572.827 1.254 1.757 2.148 1.724.863-.034 1.19-.558 2.234-.558 1.044 0 1.336.558 2.247.54.927-.017 1.513-.844 2.078-1.674.655-.96.924-1.89.94-1.938-.02-.008-1.804-.692-1.824-2.753zM9.65 3.37c.477-.578.8-1.381.712-2.184-.688.028-1.523.459-2.017 1.036-.443.51-.83 1.329-.726 2.118.766.059 1.553-.39 2.03-.97z"/>
                </svg>
                {appleBusy ? 'Signing in…' : 'Continue with Apple'}
              </button>
            ) : null}
            {googleConfigured ? (
              <div ref={googleBtnRef} className="flex justify-center" data-testid="google-signin" />
            ) : null}
          </>
        ) : null}
      </form>
    </>
  );
}
