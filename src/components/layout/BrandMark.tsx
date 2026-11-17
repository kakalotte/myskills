import { cn } from '../../lib/format';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 22, className }: BrandMarkProps) {
  return (
    <img
      src="/logo/logo.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      draggable={false}
    />
  );
}
