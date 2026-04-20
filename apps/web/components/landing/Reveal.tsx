'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  as?: 'div' | 'section' | 'header' | 'article' | 'li';
  className?: string;
  delayMs?: number;
};

export function Reveal({ children, as: Tag = 'div', className = '', delayMs = 0 }: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      node.classList.add('is-visible');
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      node.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            if (delayMs > 0) {
              window.setTimeout(() => target.classList.add('is-visible'), delayMs);
            } else {
              target.classList.add('is-visible');
            }
            observer.unobserve(target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delayMs]);

  const assignRef = (node: HTMLElement | null) => {
    ref.current = node;
  };

  const combinedClass = `reveal ${className}`.trim();

  if (Tag === 'section') return <section ref={assignRef as never} className={combinedClass}>{children}</section>;
  if (Tag === 'header') return <header ref={assignRef as never} className={combinedClass}>{children}</header>;
  if (Tag === 'article') return <article ref={assignRef as never} className={combinedClass}>{children}</article>;
  if (Tag === 'li') return <li ref={assignRef as never} className={combinedClass}>{children}</li>;
  return <div ref={assignRef as never} className={combinedClass}>{children}</div>;
}
