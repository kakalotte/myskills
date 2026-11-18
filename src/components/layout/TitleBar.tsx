import { useWindowControls } from '../../hooks/useWindowControls';
import { BrandMark } from './BrandMark';
import { Icon } from '../ui/Icon';

export function TitleBar() {
  const { desktop, maximized, minimize, toggleMaximize, close } = useWindowControls();

  return (
    <header data-tauri-drag-region className="relative z-50 flex h-12 shrink-0 items-center justify-between border-b border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] px-4 shadow-[0_1px_0_rgba(37,99,235,0.08)]">
      <div className="flex h-full min-w-0 flex-1 items-center gap-3">
        <div className="flex items-center gap-2">
          <BrandMark size={22} />
          <span className="text-sm font-semibold tracking-tight text-[var(--color-on-surface,#1a1a19)]">
            mySkills
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={minimize}
          disabled={!desktop}
          aria-label="最小化"
          title="最小化"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-on-surface-variant,#5c5c5a)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-surface-container,#f0f0ee)_70%,transparent)] disabled:opacity-40"
        >
          <Icon name="remove" size={18} />
        </button>
        <button
          type="button"
          onClick={toggleMaximize}
          disabled={!desktop}
          aria-label={maximized ? '还原' : '最大化'}
          title={maximized ? '还原' : '最大化'}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-on-surface-variant,#5c5c5a)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-surface-container,#f0f0ee)_70%,transparent)] disabled:opacity-40"
        >
          <Icon name={maximized ? 'filter_none' : 'crop_square'} size={16} />
        </button>
        <button
          type="button"
          onClick={close}
          disabled={!desktop}
          aria-label="关闭"
          title="关闭"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-on-surface-variant,#5c5c5a)] transition-colors hover:bg-[var(--color-error-container,#f5e6e6)] hover:text-[var(--color-on-error-container,#8a2c2c)] disabled:opacity-40"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </header>
  );
}
