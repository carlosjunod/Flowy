import { Reveal } from './Reveal';

const pillars = [
  {
    title: 'Capture without friction',
    description:
      'Share links, tweets, videos, images, receipts — anything — directly from your phone or Mac. No apps to learn, no folders to maintain.',
  },
  {
    title: 'AI does the work',
    description:
      'Your inbox auto-organizes by content type, context, and relevance. No tagging. No filing. Just clarity.',
  },
  {
    title: 'Chat to retrieve',
    description:
      'Ask plain-English questions and get exactly what you\u2019re looking for, even months later. Your inbox understands you.',
  },
];

export function Features() {
  return (
    <section
      aria-labelledby="features-heading"
      className="relative border-t border-white/5 px-6 py-20 sm:px-8 sm:py-28 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal as="header" className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-400">What it does</p>
          <h2
            id="features-heading"
            className="mt-4 text-balance font-sans text-3xl font-semibold leading-tight tracking-tight text-neutral-50 sm:text-4xl md:text-5xl"
          >
            Three things, done <span className="font-serif font-normal italic text-amber-300">beautifully</span>.
          </h2>
        </Reveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
          {pillars.map((pillar, index) => (
            <Reveal
              as="li"
              key={pillar.title}
              delayMs={index * 80}
              className="group relative flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.04] sm:p-8"
            >
              <span
                className="mb-6 inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-sm font-medium text-amber-300"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-neutral-50 sm:text-xl">
                {pillar.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                {pillar.description}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
