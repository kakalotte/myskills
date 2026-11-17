import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '../../lib/format';
import { Icon } from './Icon';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: ModalSize;
  className?: string;
  showClose?: boolean;
  dismissible?: boolean;
}

const sizes: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
  '3xl': 'max-w-6xl',
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
  className,
  showClose = true,
  dismissible = true,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[var(--color-scrim)] backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'dialog-enter fixed left-1/2 top-1/2 z-[61] flex max-h-[86vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-outline-variant/35 bg-surface-container-lowest shadow-dialog',
            sizes[size],
            className,
          )}
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!dismissible) event.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{description ?? title}</Dialog.Description>
          {showClose ? (
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭"
                className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-control text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <Icon name="close" size={17} />
              </button>
            </Dialog.Close>
          ) : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
