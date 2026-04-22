'use client';

/**
 * ThemeToggle — single-tap dark/light switch sized to match NavLink.
 *
 * Renders both icons stacked and crossfades them so we don't get a layout
 * shift when toggling. The pre-mount state shows the sun by default; the
 * inline ThemeScript will already have set the correct class on <html>,
 * but useTheme's resolved value isn't available until the effect runs —
 * we render the SunIcon first to avoid hydration mismatch warnings, then
 * swap once mounted.
 */

import { useEffect, useState } from 'react';
import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon } from './icons';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolved === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      data-testid="theme-toggle"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-all hover:bg-foreground/5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
    >
      <SunIcon
        size={16}
        className={`absolute transition-all duration-300 ease-out-expo ${
          isDark ? 'scale-50 opacity-0 -rotate-90' : 'scale-100 opacity-100 rotate-0'
        }`}
      />
      <MoonIcon
        size={16}
        className={`absolute transition-all duration-300 ease-out-expo ${
          isDark ? 'scale-100 opacity-100 rotate-0' : 'scale-50 opacity-0 rotate-90'
        }`}
      />
    </button>
  );
}
