import { Reveal } from './Reveal';
import { ClassifyIcon, ExtractIcon, RememberIcon, RetrieveIcon } from './Icons';
import type { ComponentType, SVGProps } from 'react';

type Capability = {
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const capabilities: Capability[] = [
  {
    title: 'Classify',
    description:
      'Understands what kind of thing you saved \u2014 article, image, video, receipt \u2014 without you saying a word.',
    icon: ClassifyIcon,
  },
  {
    title: 'Extract',
    description:
      'Pulls out the meaningful parts: prices from receipts, transcripts from videos, quotes from articles, automatically.',
    icon: ExtractIcon,
  },
  {
    title: 'Remember',
    description:
      'Connects related items across everything you\u2019ve ever saved. One thought leads to another, like your mind does.',
    icon: RememberIcon,
  },
  {
    title: 'Retrieve via chat',
    description:
      'Ask \u201cshow me coffee shops I saved\u201d or \u201cwhat was that article about AI pricing?\u201d Natural language, natural results.',
    icon: RetrieveIcon,
  },
];

export function AICapabilities() {
  return (
    <section
      aria-labelledby="ai-heading"
      className="relative border-t border-white/5 bg-gradient-to-b from-transparent via-white/[0.015] to-transparent px-6 py-20 sm:px-8 sm:py-28 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal as="header" className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-400">What the AI does</p>
          <h2
            id="ai-heading"
            className="mt-4 text-balance font-sans text-3xl font-semibold leading-tight tracking-tight text-neutral-50 sm:text-4xl md:text-5xl"
          >
            A quiet model that <span className="font-serif font-normal italic text-amber-300">notices things</span>.
          </h2>
          <p className="mt-5 text-pretty text-base leading-relaxed text-neutral-400">
            Four jobs happen the moment you share. You don&rsquo;t see them. You just feel the
            difference later, when you ask.
          </p>
        </Reveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
          {capabilities.map((capability, index) => {
            const Icon = capability.icon;
            return (
              <Reveal
                as="li"
                key={capability.title}
                delayMs={index * 70}
                className="group relative flex gap-5 rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.04] sm:p-7"
              >
                <span
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight text-neutral-50 sm:text-lg">
                    {capability.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                    {capability.description}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
