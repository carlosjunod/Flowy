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

declare global {
  interface Window {
    google?: { accounts?: GoogleAccounts };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);
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
        // Hydrate the PB client auth store so components that read it directly
        // (not just cookie) see the authenticated state on next render.
        const pb = getPb();
        pb.authStore.save(body.data.token, null);
        storeTokenAndRedirect(body.data.token);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google sign-in failed');
      }
    },
    [router],
  );

  // Wire up the GIS button once both the script is loaded AND the container
  // div is mounted. We render on both state flips to handle either order.
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

  const googleConfigured = GOOGLE_CLIENT_ID.length > 0;

  return (
    <>
      {googleConfigured ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGsiReady(true)}
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
        {googleConfigured ? (
          <>
            <div className="flex items-center gap-3 text-xs text-white/50">
              <span className="h-px flex-1 bg-white/10" />
              <span>or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div ref={googleBtnRef} className="flex justify-center" data-testid="google-signin" />
          </>
        ) : null}
      </form>
    </>
  );
}
