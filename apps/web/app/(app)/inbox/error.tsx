'use client';

import { useEffect } from 'react';

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[inbox-error]', error.message, error.digest);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-red-500/30 bg-red-500/5 py-16 text-center text-white/80">
      <div className="text-5xl" aria-hidden>⚠️</div>
      <h2 className="text-base font-semibold text-white">Something went wrong — refresh to try again</h2>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-white/30"
      >
        Retry
      </button>
    </div>
  );
}
