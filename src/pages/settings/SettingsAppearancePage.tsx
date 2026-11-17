import { Icon } from '../../components/ui/Icon';
import { cn } from '../../lib/format';
import { THEME_OPTIONS } from '../../lib/theme';
import type { ThemePreference } from '../../lib/types';
import { useAppStore } from '../../store/app-store';

/**
 * Swatches are literal colors on purpose: each preview shows another mode, so it
 * cannot use the active theme's tokens.
 */
const PREVIEW: Record<'light' | 'dark', { shell: string; panel: string; line: string; accent: string }> = {
  light: { shell: '#f4f6f8', panel: '#ffffff', line: '#d7dee8', accent: '#2563eb' },
  dark: { shell: '#0f1319', panel: '#171d26', line: '#2b3644', accent: '#60a5fa' },
};

function MiniPreview({ mode }: { mode: 'light' | 'dark' }) {
  const c = PREVIEW[mode];
  return (
    <div className="flex h-16 w-full gap-1 p-1.5" style={{ backgroundColor: c.shell }}>
      <div className="flex w-1/4 flex-col gap-1 rounded-[3px] p-1" style={{ backgroundColor: c.panel }}>
        <span className="h-1 w-full rounded-full" style={{ backgroundColor: c.accent }} />
        <span className="h-1 w-3/4 rounded-full" style={{ backgroundColor: c.line }} />
        <span className="h-1 w-2/3 rounded-full" style={{ backgroundColor: c.line }} />
      </div>
      <div className="flex flex-1 flex-col gap-1 rounded-[3px] p-1" style={{ backgroundColor: c.panel }}>
        <span className="h-1 w-1/2 rounded-full" style={{ backgroundColor: c.line }} />
        <span className="h-1 w-full rounded-full" style={{ backgroundColor: c.line }} />
        <span className="h-1 w-5/6 rounded-full" style={{ backgroundColor: c.line }} />
        <span className="mt-auto h-2 w-8 rounded-full" style={{ backgroundColor: c.accent }} />
      </div>
    </div>
  );
}

function ThemePreview({ mode }: { mode: ThemePreference }) {
  if (mode === 'system') {
    return (
      <div className="flex h-16 w-full overflow-hidden rounded-[3px]">
        <div className="w-1/2">
          <MiniPreview mode="light" />
        </div>
        <div className="w-1/2">
          <MiniPreview mode="dark" />
        </div>
      </div>
    );
  }
  return <MiniPreview mode={mode} />;
}

export function SettingsAppearancePage() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const pushToast = useAppStore((state) => state.pushToast);

  const handleSelect = (next: ThemePreference) => {
    if (next === theme) return;
    void setTheme(next).catch((error: unknown) => {
      pushToast({
        tone: 'error',
        title: '切换主题失败',
        description: error instanceof Error ? error.message : String(error),
      });
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-on-surface,#111827)]">
          <Icon name="palette" size={20} className="text-[var(--color-primary,#2563eb)]" />
          主题
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-on-surface-variant,#4b5563)]">
          选择界面配色。「跟随系统」会随操作系统的深色模式自动切换，无需重启。
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="主题"
        className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {THEME_OPTIONS.map((option) => {
          const active = option.value === theme;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-3 text-left transition-all',
                active
                  ? 'border-[color-mix(in_srgb,var(--color-primary,#2563eb)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-primary,#2563eb)_6%,var(--color-surface,#fff))] ring-1 ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_25%,transparent)]'
                  : 'border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] hover:bg-[var(--color-surface-container-low,#fbfcfd)]',
              )}
            >
              <div className="overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)]">
                <ThemePreview mode={option.value} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon
                    name={option.icon}
                    size={16}
                    className={
                      active
                        ? 'text-[var(--color-primary,#2563eb)]'
                        : 'text-[var(--color-on-surface-variant,#4b5563)]'
                    }
                  />
                  <span className="truncate text-sm font-medium text-[var(--color-on-surface,#111827)]">
                    {option.label}
                  </span>
                </span>
                {active ? (
                  <Icon name="check_circle" size={16} className="text-[var(--color-primary,#2563eb)]" filled />
                ) : null}
              </div>
              <span className="text-xs leading-relaxed text-[var(--color-on-surface-variant,#6b7280)]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
