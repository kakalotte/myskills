import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/format';
import { Icon } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'outline';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string;
  iconFilled?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-primary,#1a1a19)] text-[var(--color-on-primary,#fff)] hover:opacity-90 active:scale-[0.99]',
  secondary:
    'bg-[color-mix(in_srgb,var(--color-surface-container,#f0f0ee)_80%,transparent)] text-[var(--color-on-surface,#1a1a19)] hover:bg-[var(--color-surface-container-high,#e8e8e6)] active:scale-[0.99]',
  ghost:
    'text-[var(--color-on-surface-variant,#5c5c5a)] hover:bg-[color-mix(in_srgb,var(--color-surface-container,#f0f0ee)_60%,transparent)] hover:text-[var(--color-on-surface,#1a1a19)] active:scale-[0.99]',
  danger: 'bg-[var(--color-error,#c44545)] text-[var(--color-on-error,#fff)] hover:opacity-90 active:scale-[0.99]',
  soft: 'bg-[color-mix(in_srgb,var(--color-primary,#1a1a19)_10%,transparent)] text-[var(--color-primary,#1a1a19)] hover:bg-[color-mix(in_srgb,var(--color-primary,#1a1a19)_15%,transparent)] active:scale-[0.99]',
  outline:
    'border border-[color-mix(in_srgb,var(--color-outline-variant,#e5e5e3)_80%,transparent)] bg-transparent text-[var(--color-on-surface,#1a1a19)] hover:bg-[color-mix(in_srgb,var(--color-surface-container,#f0f0ee)_50%,transparent)] active:scale-[0.99]',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 gap-1.5 text-sm rounded-md',
  md: 'h-9 px-4 gap-2 text-sm rounded-md',
  icon: 'h-9 w-9 justify-center rounded-md',
  'icon-sm': 'h-8 w-8 justify-center rounded-md',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconFilled,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Icon name="progress_activity" size={size === 'sm' ? 14 : 16} className="animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={size === 'sm' ? 14 : 16} filled={iconFilled} />
      ) : null}
      {children}
    </button>
  );
}
