import type { ReactNode } from 'react';
import { isDemoMode } from '../../lib/bridge';
import { Icon } from '../ui/Icon';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const demo = isDemoMode();
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-background,#f7f7f5)]">
      <TitleBar />
      {demo ? (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--color-outline-variant,#e5e5e3)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-secondary-container,#e8e8e6)_40%,transparent)] px-4 py-2 text-xs text-[var(--color-on-surface,#1a1a19)]"
        >
          <Icon name="science" size={14} className="opacity-80" />
          <span className="font-medium">演示模式</span>
          <span className="opacity-80">数据仅存在于浏览器内存，不读写真实文件。</span>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-background,#f7f7f5)]">{children}</main>
      </div>
    </div>
  );
}
