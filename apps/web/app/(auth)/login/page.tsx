'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getPb } from '@/lib/pocketbase';

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
      document.cookie = `pb_auth=${encodeURIComponent(
        pb.authStore.exportToCookie({ httpOnly: false }),
      )}; path=/; max-age=604800; samesite=lax`;
      router.push('/chat');
      router.refresh();
    } catch {
      setError('Invalid email or password');
      setSubmitting(false);
    }
  }

  return (
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
    </form>
  );
}
