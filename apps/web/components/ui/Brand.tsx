interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TEXT_SIZE: Record<Required<Props>['size'], string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-3xl',
};

const DOT_SIZE: Record<Required<Props>['size'], string> = {
  sm: 'h-1 w-1',
  md: 'h-1.5 w-1.5',
  lg: 'h-2 w-2',
};

/**
 * Wordmark. Display-serif "Flowy" + an accent dot. The dot reads as the period in
 * "Flowy." and doubles as the brand motif (carried into the login halo and empty
 * states). Kept as a single component so route headers, footers, and auth share it.
 */
export function Brand({ size = 'md', className = '' }: Props) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-display tracking-tight ${TEXT_SIZE[size]} ${className}`}>
      <span className="leading-none">Flowy</span>
      <span className={`inline-block rounded-full bg-accent ${DOT_SIZE[size]}`} aria-hidden />
    </span>
  );
}
