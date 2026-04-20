import { Reveal } from './Reveal';

const steps = [
  {
    label: 'Share anywhere',
    description: 'Hit share from Safari, Twitter, TikTok, Photos \u2014 or paste a link. One tap. That\u2019s it.',
  },
  {
    label: 'AI organizes',
    description: 'In seconds, Tryflowy classifies what you shared, extracts the goods, and locks it away safe.',
  },
  {
    label: 'Chat to find',
    description: 'Ask your inbox anything. It learns what matters to you. The more you ask, the smarter it gets.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="relative border-t border-white/5 px-6 py-20 sm:px-8 sm:py-28 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal as="header" className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-400">How it works</p>
          <h2
            id="how-heading"
            className="mt-4 text-balance font-sans text-3xl font-semibold leading-tight tracking-tight text-neutral-50 sm:text-4xl md:text-5xl"
          >
            Share, and <span className="font-serif font-normal italic text-amber-300">forget</span>.
          </h2>
        </Reveal>

        <ol
          className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6"
          aria-label="Three step flow"
        >
          {steps.map((step, index) => (
            <Reveal
              as="li"
              key={step.label}
              delayMs={index * 80}
              className="relative flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-7 sm:p-8"
            >
              <span
                className="font-serif text-5xl italic leading-none text-amber-300/70 sm:text-6xl"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-neutral-50 sm:text-xl">
                {step.label}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                {step.description}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
