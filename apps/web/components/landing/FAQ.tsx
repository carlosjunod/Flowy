import { Reveal } from './Reveal';

type Entry = {
  question: string;
  answer: string;
};

const faqs: Entry[] = [
  {
    question: 'How much does it cost?',
    answer:
      'Free during beta. We\u2019ll announce paid plans when we launch publicly \u2014 likely tiered by storage and advanced AI features. Early users get grandfathered pricing.',
  },
  {
    question: 'Who can see what I share?',
    answer:
      'Only you. Your data is encrypted in transit and at rest. We never train on your content or sell access to it. Your inbox is yours alone.',
  },
  {
    question: 'Can I export my data?',
    answer:
      'Yes. You can export all your saved items and chat history as JSON or CSV anytime. You own your data.',
  },
  {
    question: 'What platforms do you support today?',
    answer:
      'iOS and macOS share sheet. Android is coming later in 2026. Web access works from any browser on any device.',
  },
  {
    question: 'What AI model powers this?',
    answer:
      'Claude Sonnet, made by Anthropic. It\u2019s fast, accurate, and privacy-first \u2014 we don\u2019t log your conversations.',
  },
];

export function FAQ() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="relative border-t border-white/5 px-6 py-20 sm:px-8 sm:py-28 md:py-32"
    >
      <div className="mx-auto max-w-3xl">
        <Reveal as="header" className="text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-400">Frequently asked</p>
          <h2
            id="faq-heading"
            className="mt-4 text-balance font-sans text-3xl font-semibold leading-tight tracking-tight text-neutral-50 sm:text-4xl md:text-5xl"
          >
            Straight <span className="font-serif font-normal italic text-amber-300">answers</span>.
          </h2>
        </Reveal>

        <div className="mt-12 divide-y divide-white/5 border-y border-white/5">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group py-5 [&_summary::-webkit-details-marker]:hidden sm:py-6"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-medium text-neutral-100 transition-colors duration-200 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:text-lg">
                <span>{faq.question}</span>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-white/10 text-neutral-400 transition-all duration-200 group-open:rotate-45 group-open:border-amber-400/40 group-open:text-amber-300"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 pr-10 text-sm leading-relaxed text-neutral-400 sm:text-base">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
