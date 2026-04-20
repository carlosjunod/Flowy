import Link from 'next/link';

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-neutral-950/70 backdrop-blur-xl">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-medium tracking-tight text-neutral-50 transition-colors duration-200 hover:text-white"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-400 text-[11px] font-semibold text-neutral-950"
          >
            t
          </span>
          <span className="text-base">Tryflowy</span>
        </Link>

        <div className="flex items-center gap-5 text-sm">
          <Link
            href="#how-it-works"
            className="hidden text-neutral-400 transition-colors duration-200 hover:text-neutral-50 sm:inline-flex"
          >
            How it works
          </Link>
          <Link
            href="#faq"
            className="hidden text-neutral-400 transition-colors duration-200 hover:text-neutral-50 sm:inline-flex"
          >
            FAQ
          </Link>
          <Link
            href="/login"
            data-placeholder="web-signup"
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 font-medium text-neutral-50 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Sign in
          </Link>
        </div>
      </nav>
    </header>
  );
}
