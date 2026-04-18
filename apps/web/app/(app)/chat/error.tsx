'use client';

import { useEffect } from 'react';

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[chat-error]', error.message, error.digest);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-white/70">
      <div className="text-5xl" aria-hidden>⚠️</div>
      <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
      <p className="text-sm">Refresh to try again.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-white/30"
      >
        Try again
      </button>
    </div>
  );
}
