import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/format';
import { useAppStore } from '../../store/app-store';
import { Icon } from '../../components/ui/Icon';

const navItems = [
  { to: '/settings/roots', label: 'Agent 路径', icon: 'rule_folder' },
  { to: '/settings/appearance', label: '外观', icon: 'palette' },
  { to: '/settings/backup', label: '备份与迁移', icon: 'cloud_sync' },
  { to: '/settings/about', label: '关于', icon: 'info' },
];

export function SettingsLayout() {
  const updateInfo = useAppStore((state) => state.updateInfo);
  const skippedVersion = useAppStore(
    (state) => state.bootstrap?.settings.update.skippedVersion ?? null,
  );
  const hasUpdate = Boolean(
    updateInfo?.updateAvailable && updateInfo.latestVersion !== skippedVersion,
  );

  return (
    <div className="flex w-full flex-col gap-space-md p-space-md">
      <div className="flex flex-col justify-between gap-space-sm md:flex-row md:items-end">
        <div className="flex flex-col gap-space-2xs">
          <h1 className="text-headline-lg tracking-tight text-on-surface">设置</h1>
          <p className="text-body-sm text-on-surface-variant">Agent 路径、安装策略与本地数据。</p>
        </div>
      </div>

      <nav
        aria-label="设置分区"
        className="flex gap-space-2xs overflow-x-auto rounded-card bg-surface-container-lowest p-space-xs shadow-card"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--color-primary,#2563eb)] text-[var(--color-on-primary,#ffffff)] shadow-sm'
                  : 'text-[var(--color-on-surface-variant,#5c5c5a)] hover:bg-[var(--color-surface-container,#eaf0f6)] hover:text-[var(--color-on-surface,#111827)]',
              )
            }
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
            {item.to === '/settings/about' && hasUpdate ? (
              <span
                aria-label="有新版本"
                title="有新版本"
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-error"
              />
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-space-md">
        <Outlet />
      </div>
    </div>
  );
}
