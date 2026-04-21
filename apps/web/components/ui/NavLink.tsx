'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface Props {
  href: string;
  children: ReactNode;
}

/**
 * Header nav link with an animated underline that sweeps in on hover and stays
 * fully drawn when the route is active. Uses a pseudo-element so the link never
 * shifts layout during the transition (important — the header is sticky).
 */
export function NavLink({ href, children }: Props) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        'relative rounded-md px-3 py-1.5 text-sm transition-colors',
        'after:pointer-events-none after:absolute after:bottom-0.5 after:left-3 after:right-3 after:h-[2px] after:rounded-full after:bg-accent',
        'after:origin-center after:scale-x-0 after:transition-transform after:duration-200 after:ease-out-expo',
        'hover:text-foreground hover:after:scale-x-100',
        active ? 'text-foreground after:scale-x-100' : 'text-muted',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}
