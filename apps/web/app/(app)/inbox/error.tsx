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
    <div className="flex flex-col items-center gap-4 rounded-xl border border-red-300 bg-red-50 py-16 text-center text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
      <div className="text-5xl" aria-hidden>⚠️</div>
      <h2 className="text-base font-semibold text-red-800 dark:text-red-200">Something went wrong — refresh to try again</h2>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full border border-red-300 px-4 py-2 text-sm transition-colors hover:border-red-400 hover:bg-red-100/60 dark:border-red-900/60 dark:hover:border-red-800 dark:hover:bg-red-900/30"
      >
        Retry
      </button>
    </div>
  );
}
