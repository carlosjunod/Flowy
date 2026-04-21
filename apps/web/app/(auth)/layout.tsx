export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4">
      {/* Ambient accent halo — drifts gently, disabled under prefers-reduced-motion globally. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[40%] -z-0 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-halo-accent blur-2xl animate-halo-drift"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] bottom-[-10%] -z-0 h-[480px] w-[480px] rounded-full bg-halo-primary blur-3xl"
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        {children}
      </div>
    </main>
  );
}
