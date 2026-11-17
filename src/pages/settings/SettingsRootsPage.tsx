import { useEffect, useState } from 'react';
import { AgentMark } from '../../components/agents/AgentMark';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { cn } from '../../lib/format';
import type { RootInfo } from '../../lib/types';
import { useAppStore } from '../../store/app-store';

function RootRow({
  root,
  pending,
  onToggle,
}: {
  root: RootInfo;
  pending: boolean;
  onToggle: (authorized: boolean) => Promise<void>;
}) {
  return (
    <div className="group flex items-center justify-between gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] px-3 py-3 shadow-sm transition-colors hover:bg-[var(--color-surface-container-low,#fbfcfd)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center">
          <AgentMark agentId={root.agentId} agentName={root.agentName} size={28} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-semibold text-[var(--color-on-surface,#111827)]">{root.agentName}</span>
          <span className="truncate font-mono text-xs text-[var(--color-on-surface-variant,#6b7280)]" title={root.path}>
            {root.displayPath}
          </span>
        </div>
      </div>
      <div className="ml-space-xs flex shrink-0 items-center">
        <button
          type="button"
          role="switch"
          aria-checked={root.authorized}
          disabled={pending || !root.exists}
          onClick={() => void onToggle(!root.authorized)}
          title={
            root.exists
              ? root.authorized
                ? '已授权（默认随检测开启，可手动关闭）'
                : '未授权（已手动关闭）'
              : '未检测到目录，无法授权'
          }
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform disabled:cursor-not-allowed disabled:opacity-40',
            root.authorized && root.exists ? 'bg-[var(--color-primary,#2563eb)] after:translate-x-5' : 'bg-[var(--color-outline,#94a3b8)]',
            !root.exists && root.authorized ? 'bg-[var(--color-outline,#94a3b8)] after:translate-x-5 opacity-60' : '',
          )}
        >
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Icon name="progress_activity" size={12} className="animate-spin text-primary" />
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

export function SettingsRootsPage() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const authorizeRoot = useAppStore((state) => state.authorizeRoot);
  const pushToast = useAppStore((state) => state.pushToast);
  const scan = useAppStore((state) => state.globalScan);
  const refresh = useAppStore((state) => state.refreshGlobal);
  const scanning = useAppStore((state) => state.globalScanning);

  const [pendingRoot, setPendingRoot] = useState<string | null>(null);
  const [showUndetectedRoots, setShowUndetectedRoots] = useState(false);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      void refresh({ announce: false });
    }
  }, [bootstrap, scan, scanning, refresh]);

  const roots = (bootstrap?.roots ?? []).filter((root) => root.scope === 'global');
  const detectedRoots = roots.filter((root) => root.exists);
  const undetectedRoots = roots.filter((root) => !root.exists);

  async function handleToggle(rootId: string, authorized: boolean) {
    setPendingRoot(rootId);
    try {
      await authorizeRoot(rootId, authorized);
    } catch (error) {
      pushToast({
        tone: 'error',
        title: '授权状态未更新',
        description: (error as { message?: string }).message ?? String(error),
      });
    } finally {
      setPendingRoot(null);
    }
  }

  return (
    <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-md shadow-card">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-space-2xs">
          <h2 className="text-headline-md font-semibold text-on-surface">Agent 路径</h2>
          <p className="text-body-sm text-on-surface-variant">
            管理全局 Agent 的扫描目录与读取权限。已安装/已探测默认开启，可手动开启未安装或关闭已安装；授权影响 Agent 在其他模块的显示。
          </p>
        </div>
        <Button size="sm" variant="outline" icon="sync" loading={scanning} onClick={() => void refresh({ announce: true })}>
          重新探测
        </Button>
      </div>

      <div className="flex flex-col gap-space-xs">
        <h3 className="text-headline-sm font-semibold text-on-surface">全局 Agent 路径</h3>
        {detectedRoots.length === 0 ? (
          <p className="rounded-card bg-surface-container-low px-space-sm py-space-sm text-body-sm text-on-surface-variant">
            未检测到已存在的全局 Agent 目录。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {detectedRoots.map((root) => (
              <RootRow
                key={root.id}
                root={root}
                pending={pendingRoot === root.id}
                onToggle={(authorized) => handleToggle(root.id, authorized)}
              />
            ))}
          </div>
        )}
      </div>

      {undetectedRoots.length > 0 ? (
        <div className="flex flex-col gap-space-xs">
          <button
            type="button"
            onClick={() => setShowUndetectedRoots((value) => !value)}
            className="flex w-full items-center justify-between rounded-card bg-surface-container-low px-space-sm py-space-xs text-left transition-colors hover:bg-surface-container"
          >
            <span className="font-caption-caps uppercase text-on-surface-variant">
              未探测到的全局 Agent（{undetectedRoots.length}）
            </span>
            <Icon
              name={showUndetectedRoots ? 'expand_less' : 'expand_more'}
              size={18}
              className="text-on-surface-variant"
            />
          </button>
          {showUndetectedRoots ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {undetectedRoots.map((root) => (
                <RootRow
                  key={root.id}
                  root={root}
                  pending={pendingRoot === root.id}
                  onToggle={(authorized) => handleToggle(root.id, authorized)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
