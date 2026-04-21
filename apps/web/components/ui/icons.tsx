/**
 * Inline SVG icon registry. Chosen over lucide-react to avoid a dependency install.
 * All icons follow 24×24 viewBox / stroke-based Lucide geometry for visual consistency.
 * Props mirror SVGAttributes so callers can set `className`, `aria-hidden`, etc.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, strokeWidth = 1.75, className, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': rest['aria-hidden'] ?? true,
    ...rest,
  };
}

export function LinkIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

export function ImageIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export function PlayIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.52.86l11.05-6.86a1 1 0 0 0 0-1.72L9.52 4.28A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function ReceiptIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 4v17l2.5-1.5L9 21l2.5-1.5L14 21l2.5-1.5L19 21l2-1V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function FileTextIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

export function HeadphonesIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4Zm-18 0a2 2 0 0 0 2 2h1v-6H3v4Z" />
    </svg>
  );
}

export function VideoIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="m22 8-6 4 6 4V8Z" />
    </svg>
  );
}

export function PaperclipIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-8.84 8.84a1.5 1.5 0 0 1-2.12-2.12l7.42-7.42" />
    </svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function XIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function RotateIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function ArrowUpRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export function ShareIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6 12 2 8 6" />
      <path d="M12 2v13" />
    </svg>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m22 2-9.5 20-3-9-9-3 21.5-8Z" />
      <path d="m22 2-10 10" />
    </svg>
  );
}

export function ChatIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

export function InboxIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

export function LogoutIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function GridIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3"  width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function ListIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RowsIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="18" height="6.5" rx="1.5" />
      <rect x="3" y="14.5" width="18" height="6.5" rx="1.5" />
    </svg>
  );
}

export function ArrowUpIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function ArrowDownIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

export function AlertTriangleIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function SparkleIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}

/**
 * Maps an Item.type to the right inline SVG.
 * Consumers pass `size` and `className`; default is 16×16 matching prior emoji rendering.
 */
export function TypeIcon({ type, ...rest }: { type: string } & IconProps) {
  switch (type) {
    case 'url':        return <LinkIcon {...rest} />;
    case 'screenshot': return <ImageIcon {...rest} />;
    case 'youtube':    return <PlayIcon {...rest} />;
    case 'receipt':    return <ReceiptIcon {...rest} />;
    case 'pdf':        return <FileTextIcon {...rest} />;
    case 'audio':      return <HeadphonesIcon {...rest} />;
    case 'video':      return <VideoIcon {...rest} />;
    default:           return <PaperclipIcon {...rest} />;
  }
}
