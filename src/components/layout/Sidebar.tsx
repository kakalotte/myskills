import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/format';
import { useAppStore } from '../../store/app-store';
import { Icon } from '../ui/Icon';

const navItems = [
  { to: '/', icon: 'inventory_2', label: '技能库', end: true },
  { to: '/bundles', icon: 'layers', label: '组合' },
  { to: '/agents', icon: 'smart_toy', label: 'Agent' },
  { to: '/projects', icon: 'folder_special', label: '项目' },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const settingsActive = pathname.startsWith('/settings') || pathname === '/backup';
  const updateInfo = useAppStore((state) => state.updateInfo);
  const skippedVersion = useAppStore(
    (state) => state.bootstrap?.settings.update.skippedVersion ?? null,
  );
  const hasUpdate = Boolean(
    updateInfo?.updateAvailable && updateInfo.latestVersion !== skippedVersion,
  );

  return (
    <aside className="flex w-[240px] shrink-0 flex-col justify-between border-r border-[color-mix(in_srgb,var(--color-outline-variant,#e5e5e3)_50%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] px-3 py-4">
      <nav className="flex flex-col gap-1" aria-label="主导航">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-[var(--color-primary-container,#dbeafe)] font-medium text-[var(--color-on-primary-container,#1e3a8a)]'
                  : 'text-[var(--color-on-surface-variant,#5c5c5a)] hover:bg-[color-mix(in_srgb,var(--color-surface-container,#eef2f6)_80%,transparent)] hover:text-[var(--color-on-surface,#111827)]',
              )
            }
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col pt-4">
        <NavLink
          to="/settings/roots"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
            settingsActive
              ? 'bg-[var(--color-primary-container,#dbeafe)] font-medium text-[var(--color-on-primary-container,#1e3a8a)]'
              : 'text-[var(--color-on-surface-variant,#5c5c5a)] hover:bg-[color-mix(in_srgb,var(--color-surface-container,#eef2f6)_80%,transparent)] hover:text-[var(--color-on-surface,#111827)]',
          )}
        >
          <Icon name="settings" size={20} />
          设置
          {hasUpdate ? (
            <span
              aria-label="有新版本"
              title="有新版本"
              className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-error"
            />
          ) : null}
        </NavLink>
      </div>
    </aside>
  );
}
