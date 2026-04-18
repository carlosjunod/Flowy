'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ fontSize: 48 }} aria-hidden>⚠️</div>
          <h1 style={{ fontSize: 20 }}>Something went wrong — refresh to try again</h1>
          <button
            onClick={() => reset()}
            style={{ padding: '8px 16px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, color: '#fff', background: 'transparent' }}
          >
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
