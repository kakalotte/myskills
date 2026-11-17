import { cn } from '../../lib/format';

interface IconProps {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 18, filled = false, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('material-symbols-outlined', filled && 'filled', className)}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}
