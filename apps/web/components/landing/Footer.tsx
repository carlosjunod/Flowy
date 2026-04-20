import Link from 'next/link';

type NavGroup = {
  title: string;
  links: { label: string; href: string }[];
};

const groups: NavGroup[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#' },
      { label: 'Pricing', href: '#' },
      { label: 'Security', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Blog', href: '#' },
      { label: 'About', href: '#' },
      { label: 'Contact', href: '#' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help center', href: '#' },
      { label: 'API docs', href: '#' },
      { label: 'Status page', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
      { label: 'Cookies', href: '#' },
    ],
  },
];

export function Footer() {
  return (
    <footer
      aria-labelledby="footer-heading"
      className="border-t border-white/5 px-6 pb-14 pt-20 sm:px-8 sm:pt-24"
    >
      <h2 id="footer-heading" className="sr-only">
        Tryflowy footer
      </h2>
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-8">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 text-base font-medium text-neutral-50">
              <span
                aria-hidden="true"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-400 text-[11px] font-semibold text-neutral-950"
              >
                t
              </span>
              Tryflowy
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral-400">
              The AI inbox that actually organizes itself.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{group.title}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-neutral-400 transition-colors duration-200 hover:text-neutral-50"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-8 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <p>&copy; 2026 Tryflowy. Made by humans and Claude.</p>
          <p className="text-neutral-600">
            Private beta &middot; tryflowy.app
          </p>
        </div>
      </div>
    </footer>
  );
}
