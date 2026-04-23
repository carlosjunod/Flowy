'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPb } from '@/lib/pocketbase';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const MIN_PASSWORD_LEN = 8;

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Please enter a valid email address.',
  WEAK_PASSWORD: `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
  EMAIL_TAKEN: 'An account with that email already exists.',
  REGISTRATION_FAILED: 'Could not create your account. Please try again.',
  SERVER_MISCONFIGURED: 'Sign-up is temporarily unavailable.',
  AUTH_FAILED: 'Account created but sign-in failed. Try signing in.',
  INVALID_BODY: 'Invalid request.',
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function storeTokenAndRedirect(token: string): void {
    document.cookie = `pb_auth=${encodeURIComponent(token)}; path=/; max-age=604800; samesite=lax`;
    router.push('/chat');
    router.refresh();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LEN) {
      setError(ERROR_MESSAGES.WEAK_PASSWORD ?? null);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = (await r.json().catch(() => ({}))) as {
        data?: { token?: string };
        error?: string;
      };
      if (!r.ok || !json.data?.token) {
        const code = json.error ?? '';
        setError(ERROR_MESSAGES[code] ?? `Sign-up failed (${r.status})`);
        setSubmitting(false);
        return;
      }
      const pb = getPb();
      pb.authStore.save(json.data.token, null);
      storeTokenAndRedirect(json.data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[440px] animate-fade-up">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Brand size="lg" />
        <h1 className="font-display text-4xl leading-[1.05] text-foreground sm:text-5xl">
          Create your <span className="italic text-accent">account</span>
        </h1>
        <p className="max-w-sm text-sm text-muted">
          Start your universal inbox in seconds.
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
            minLength={MIN_PASSWORD_LEN}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm" className="text-xs font-medium uppercase tracking-wide text-muted">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={MIN_PASSWORD_LEN}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300 animate-fade-in" data-testid="signup-error">
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
              <span>Creating account…</span>
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
