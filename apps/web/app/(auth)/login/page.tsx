'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getPb } from '@/lib/pocketbase';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const pb = getPb();
    try {
      await pb.collection('users').authWithPassword(email, password);
      // Store just the raw PocketBase JWT. Middleware checks for cookie presence;
      // API routes parse the value as a Bearer token.
      document.cookie = `pb_auth=${encodeURIComponent(
        pb.authStore.token,
      )}; path=/; max-age=604800; samesite=lax`;
      router.push('/chat');
      router.refresh();
    } catch {
      setError('Invalid email or password');
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[440px] animate-fade-up">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Brand size="lg" />
        <h1 className="font-display text-4xl leading-[1.05] text-foreground sm:text-5xl">
          Your universal <span className="italic text-accent">inbox</span>
          <br /> for everything.
        </h1>
        <p className="max-w-sm text-sm text-muted">
          Share from any app, and chat to find it later.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full space-y-4 rounded-2xl border border-border bg-surface-elevated/90 p-6 shadow-elev backdrop-blur-xl"
      >
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-muted">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-muted">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700 animate-fade-in" data-testid="login-error">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={submitting}
          fullWidth
          size="lg"
          variant="primary"
          className="mt-2"
        >
          {submitting ? (
            <>
              <Spinner size={14} tone="background" />
              <span>Signing in…</span>
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        No account? Use the iOS share sheet on any shared item to provision one.
      </p>
    </div>
  );
}
