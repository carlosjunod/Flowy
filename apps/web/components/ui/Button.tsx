'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary:   'bg-primary text-background hover:bg-primary/90',
  secondary: 'bg-surface-elevated text-foreground border border-border hover:border-foreground/30 hover:bg-surface',
  ghost:     'bg-transparent text-foreground hover:bg-foreground/5',
  danger:    'bg-transparent text-red-700 border border-red-300 hover:bg-red-50 hover:border-red-400 dark:text-red-300 dark:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:border-red-800',
  accent:    'bg-accent text-background hover:bg-accent/90 shadow-sm',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-full',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-2.5 text-sm rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', fullWidth, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-all duration-150 ease-out-expo',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});
