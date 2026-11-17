import { useAppStore } from '../../store/app-store';
import { cn } from '../../lib/format';
import { Icon } from './Icon';

const toneStyles = {
  success: {
    icon: 'check_circle',
    iconClass: 'bg-secondary-container text-secondary',
    border: 'border-secondary/25',
  },
  error: {
    icon: 'error',
    iconClass: 'bg-error-container text-error',
    border: 'border-error/25',
  },
  info: {
    icon: 'info',
    iconClass: 'bg-primary-fixed text-primary',
    border: 'border-primary/20',
  },
  warning: {
    icon: 'warning',
    iconClass: 'bg-[var(--color-warning-container,#fef3c7)] text-[var(--color-on-warning-container,#92400e)]',
    border: 'border-[color-mix(in_srgb,var(--color-warning,#d97706)_35%,transparent)]',
  },
} as const;

export function Toaster() {
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.dismissToast);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-9 right-4 z-[90] flex w-[360px] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const tone = toneStyles[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'toast-enter pointer-events-auto flex items-start gap-2.5 rounded-card border bg-surface-container-lowest p-3 shadow-float',
              tone.border,
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                tone.iconClass,
              )}
            >
              <Icon name={tone.icon} size={15} filled />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-body-md font-semibold text-on-surface">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-body-sm leading-[1.45] text-on-surface-variant">
                  {toast.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => dismissToast(toast.id)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-on-surface-variant/70 transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
