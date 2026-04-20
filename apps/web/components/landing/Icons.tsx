import type { SVGProps } from 'react';

const baseProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function ClassifyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
      <path d="m3 12 9 4.5L21 12" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}

export function ExtractIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h6M8 17h4" />
    </svg>
  );
}

export function RememberIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07L13 19" />
    </svg>
  );
}

export function RetrieveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
    </svg>
  );
}

export function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M7.5 7.5 9 9M15 15l1.5 1.5M7.5 16.5 9 15M15 9l1.5-1.5" />
    </svg>
  );
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 3v-4.5A8 8 0 1 1 21 12Z" />
      <path d="M8 11h8M8 14h5" />
    </svg>
  );
}

export function AppleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M16.5 2.5c-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.3-.6 3-1.4.7-.7 1.2-1.8.9-3Z" />
      <path d="M20 17.2c-.5 1.2-.8 1.8-1.5 2.9-.9 1.4-2.2 3.1-3.9 3.1-1.5 0-1.9-.9-3.9-.9s-2.5.9-3.9.9c-1.7 0-2.9-1.6-3.8-3-2.6-3.9-2.9-8.5-1.3-10.9 1.2-1.7 3-2.7 4.7-2.7 1.8 0 2.9 1 4.4 1 1.4 0 2.3-1 4.3-1 1.6 0 3.3.9 4.5 2.4-3.9 2.1-3.3 7.7.4 8.2Z" />
    </svg>
  );
}

export function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

export function BoltIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}

export function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} aria-hidden="true" {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
