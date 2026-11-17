import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/format';
import { Icon } from './Icon';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  icon?: string;
  wrapperClassName?: string;
}

export function Select({ icon, className, wrapperClassName, children, ...rest }: SelectProps) {
  return (
    <div
      className={cn(
        'relative inline-flex h-8 items-center rounded-control border border-outline-variant/55 bg-surface-container-lowest text-on-surface transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20',
        wrapperClassName,
      )}
    >
      {icon ? <Icon name={icon} size={15} className="ml-2.5 text-outline" /> : null}
      <select
        className={cn(
          'h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent py-0 pl-2 pr-7 text-body-sm text-on-surface outline-none',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="expand_more"
        size={15}
        className="pointer-events-none absolute right-2 text-outline"
      />
    </div>
  );
}
