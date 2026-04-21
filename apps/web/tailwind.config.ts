import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--color-bg) / <alpha-value>)',
        foreground: 'hsl(var(--color-text) / <alpha-value>)',
        surface: {
          DEFAULT: 'hsl(var(--color-surface) / <alpha-value>)',
          elevated: 'hsl(var(--color-surface-elevated) / <alpha-value>)',
        },
        primary: 'hsl(var(--color-primary) / <alpha-value>)',
        accent: 'hsl(var(--color-accent) / <alpha-value>)',
        muted: 'hsl(var(--color-text-muted) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 hsl(var(--color-text) / 0.04), 0 1px 1px 0 hsl(var(--color-text) / 0.03)',
        'card-hover': '0 12px 32px -8px hsl(var(--color-text) / 0.12), 0 4px 8px -2px hsl(var(--color-text) / 0.05)',
        elev: '0 20px 48px -12px hsl(var(--color-text) / 0.18), 0 8px 16px -4px hsl(var(--color-text) / 0.08)',
        halo: '0 0 0 1px hsl(var(--color-accent) / 0.25), 0 8px 24px -6px hsl(var(--color-accent) / 0.35)',
      },
      backgroundImage: {
        'halo-accent': 'radial-gradient(ellipse at center, hsl(var(--color-accent) / 0.14), transparent 60%)',
        'halo-primary': 'radial-gradient(ellipse at center, hsl(var(--color-primary) / 0.06), transparent 70%)',
        shimmer: 'linear-gradient(90deg, transparent 0%, hsl(var(--color-text) / 0.06) 50%, transparent 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'halo-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(0, -8px, 0) scale(1.04)' },
        },
        'check-pop': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 380ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'fade-in': 'fade-in 260ms ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
        'halo-drift': 'halo-drift 8s ease-in-out infinite',
        'check-pop': 'check-pop 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
