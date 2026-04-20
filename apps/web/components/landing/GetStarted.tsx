import Link from 'next/link';
import { Reveal } from './Reveal';
import { AppleIcon, GlobeIcon, BoltIcon, ArrowIcon } from './Icons';
import type { ComponentType, SVGProps } from 'react';

type Path = {
  label: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  placeholder: 'ios-app' | 'web-signup' | 'shortcut';
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  featured?: boolean;
};

const paths: Path[] = [
  {
    label: 'iOS App',
    title: 'For people who live on their phone.',
    description: 'Download from the App Store, sign in, start sharing. Works offline too.',
    cta: 'Download on the App Store',
    href: '#',
    placeholder: 'ios-app',
    icon: AppleIcon,
    featured: true,
  },
  {
    label: 'Web Account',
    title: 'For people who think at their desk.',
    description: 'Create an account at tryflowy.app and access everything from any browser.',
    cta: 'Create free account',
    href: '/login',
    placeholder: 'web-signup',
    icon: GlobeIcon,
  },
  {
    label: 'iOS Shortcut',
    title: 'For power users.',
    description: 'Add Tryflowy to your Shortcuts. One tap saves to your inbox from anywhere.',
    cta: 'Install the Shortcut',
    href: '#',
    placeholder: 'shortcut',
    icon: BoltIcon,
  },
];

export function GetStarted() {
  return (
    <section
      id="get-started"
      aria-labelledby="get-started-heading"
      className="relative border-t border-white/5 px-6 py-20 sm:px-8 sm:py-28 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal as="header" className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-400">Get started</p>
          <h2
            id="get-started-heading"
            className="mt-4 text-balance font-sans text-3xl font-semibold leading-tight tracking-tight text-neutral-50 sm:text-4xl md:text-5xl"
          >
            Three ways in. <span className="font-serif font-normal italic text-amber-300">Pick yours</span>.
          </h2>
        </Reveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {paths.map((path, index) => {
            const Icon = path.icon;
            const featured = path.featured;
            return (
              <Reveal
                as="li"
                key={path.label}
                delayMs={index * 80}
                className={
                  featured
                    ? 'group relative flex flex-col overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-400/10 via-amber-400/[0.03] to-transparent p-7 sm:p-8'
                    : 'group relative flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.04] sm:p-8'
                }
              >
                <span
                  className={
                    featured
                      ? 'flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-neutral-950'
                      : 'flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-200'
                  }
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>

                <p className="mt-6 text-xs uppercase tracking-[0.18em] text-neutral-500">
                  {path.label}
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-neutral-50 sm:text-xl">
                  {path.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-400 sm:text-base">
                  {path.description}
                </p>

                <Link
                  href={path.href}
                  data-placeholder={path.placeholder}
                  className={
                    featured
                      ? 'mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition-colors duration-200 hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950'
                      : 'mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-neutral-50 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950'
                  }
                >
                  {path.cta}
                  <ArrowIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
