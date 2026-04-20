import Link from 'next/link';
import { ArrowIcon } from './Icons';

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden px-6 pb-20 pt-20 sm:px-8 sm:pt-28 md:pt-32"
    >
      {/* Ambient halo behind the serif word */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[18%] -z-10 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl sm:h-[640px] sm:w-[640px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[60%] -z-10 h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl"
      />

      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs tracking-wide text-neutral-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          Now in private beta
        </span>

        <h1
          id="hero-heading"
          className="text-balance font-sans text-5xl font-semibold leading-[1.02] tracking-tight text-neutral-50 sm:text-6xl md:text-7xl lg:text-8xl"
        >
          Save <span className="font-serif font-normal italic text-amber-300">everything.</span>
          <br />
          Find <span className="font-serif font-normal italic text-amber-300">anything.</span>
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-neutral-400 sm:mt-8 sm:text-lg">
          Share anything from your phone or Mac. Tryflowy&rsquo;s AI organizes it instantly. Just ask
          when you need it back.
        </p>

        <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
          <Link
            href="#get-started"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-neutral-950 transition-colors duration-200 hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
          >
            Get started free
            <ArrowIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-6 py-3 text-sm font-medium text-neutral-100 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
          >
            See a demo
          </Link>
        </div>

        <div
          aria-hidden="true"
          className="mt-14 flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-neutral-500 sm:mt-20"
        >
          <span className="hidden h-px w-12 bg-neutral-800 sm:inline-flex" />
          <span>share</span>
          <span className="text-neutral-700">&rarr;</span>
          <span>organize</span>
          <span className="text-neutral-700">&rarr;</span>
          <span>ask</span>
          <span className="hidden h-px w-12 bg-neutral-800 sm:inline-flex" />
        </div>
      </div>
    </section>
  );
}
