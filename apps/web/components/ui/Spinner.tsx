interface Props {
  size?: number;
  className?: string;
  tone?: 'accent' | 'foreground' | 'background';
}

const TONE: Record<Required<Props>['tone'], string> = {
  accent:     'border-accent/30 border-t-accent',
  foreground: 'border-foreground/20 border-t-foreground',
  background: 'border-background/30 border-t-background',
};

export function Spinner({ size = 16, className = '', tone = 'foreground' }: Props) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 ${TONE[tone]} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
