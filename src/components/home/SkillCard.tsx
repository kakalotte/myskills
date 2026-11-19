import { useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { badgeStateLabel, cn, sourceLabel } from '../../lib/format';
import type { AgentBadge as AgentBadgeType, ScopeKind, SkillView } from '../../lib/types';
import { copyText, revealPath } from '../../lib/platform';
import { useAppStore } from '../../store/app-store';
import { AgentBadge } from '../agents/AgentBadge';
import { ReplaceInstallDialog } from '../agents/ReplaceInstallDialog';
import { Icon } from '../ui/Icon';

/** Single Agent workspace this card installs into; hides the per-Agent badge row. */
export interface SkillInstallTarget {
  rootId: string;
  agentId: string;
  agentName: string;
}

interface SkillCardProps {
  skill: SkillView;
  context: { scope: ScopeKind; projectId?: string | null };
  onPreview: (skill: SkillView) => void;
  onEdit: (skill: SkillView) => void;
  onOpen: (skill: SkillView) => void;
  onImport?: (skill: SkillView) => void;
  installTarget?: SkillInstallTarget;
}

const sourceStyles: Record<SkillView['source'], string> = {
  builtin: 'bg-primary-fixed text-on-primary-fixed',
  imported: 'bg-tertiary-fixed text-on-tertiary-fixed',
  external: 'bg-surface-container-high text-on-surface-variant',
};

export function SkillCard({
  skill,
  context,
  onPreview,
  onEdit,
  onOpen,
  onImport,
  installTarget,
}: SkillCardProps) {
  const install = useAppStore((state) => state.install);
  const uninstall = useAppStore((state) => state.uninstall);
  const pushToast = useAppStore((state) => state.pushToast);
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [forcePrompt, setForcePrompt] = useState<{ agentId: string; agentName: string } | null>(
    null,
  );
  const targetBadge = installTarget
    ? (skill.badges.find((badge) => badge.rootId === installTarget.rootId) ?? null)
    : null;

  async function handleBadge(
    agentId: string,
    agentName: string,
    installed: boolean,
    force = false,
  ) {
    setPendingAgent(agentId);
    try {
      if (installed) {
        await uninstall(
          {
            skillName: skill.name,
            agentId,
            scope: context.scope,
            projectId: context.projectId ?? null,
            force: false,
          },
          agentName,
        );
      } else {
        await install(
          {
            skillName: skill.name,
            agentId,
            scope: context.scope,
            projectId: context.projectId ?? null,
            force,
          },
          agentName,
        );
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'COPY_MODIFIED') {
        setForcePrompt({ agentId, agentName });
        return;
      }
      pushToast({
        tone: 'error',
        title: installed ? '卸载未完成' : '安装未完成',
        description: (error as { message?: string }).message ?? String(error),
      });
    } finally {
      setPendingAgent(null);
    }
  }

  return (
    <>
      <article className="group flex flex-col justify-between gap-space-md rounded-card bg-surface-container-lowest p-space-md shadow-card transition-all hover:shadow-float">
        <div className="flex flex-col gap-space-sm">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-space-xs">
              <button
                type="button"
                onClick={() => onOpen(skill)}
                className="min-w-0 truncate text-left text-headline-sm font-semibold text-on-surface hover:text-primary"
                title={`查看 ${skill.name} 详情`}
              >
                {skill.name}
              </button>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded px-space-xs py-[1px] font-mono text-[10px]',
                  sourceStyles[skill.source],
                )}
              >
                {skill.isExternal ? '外部' : sourceLabel(skill.source)}
              </span>
            </div>
          </div>

          <p className="line-clamp-2 min-h-[34px] text-body-sm leading-relaxed text-on-surface-variant">
            {skill.description || '暂无描述'}
          </p>

          {skill.isExternal ? (
            <div className="flex items-center gap-space-xs rounded-card bg-surface-container-low px-space-xs py-space-2xs font-mono text-label-code-sm text-on-surface-variant">
              <Icon name="dns" size={14} className="shrink-0 text-outline" />
              <span className="truncate">{skill.displayPath}</span>
            </div>
          ) : null}

          {installTarget ? null : (
            <div className="flex flex-col gap-space-xs rounded-card bg-surface-container-low/60 p-space-xs">
              <div className="flex flex-wrap items-center gap-space-xs">
                {skill.badges.filter((badge) => badge.authorized).map((badge) => (
                  <AgentBadge
                    key={badge.rootId}
                    badge={badge}
                    pending={pendingAgent === badge.agentId}
                    onInstall={() => void handleBadge(badge.agentId, badge.agentName, false)}
                    onReplace={() => void handleBadge(badge.agentId, badge.agentName, false, true)}
                    onUninstall={() => void handleBadge(badge.agentId, badge.agentName, true)}
                  />
                ))}
                {skill.badges.filter((badge) => badge.authorized).length === 0 ? (
                  <span className="px-1 text-[11px] text-on-surface-variant">
                    未发现可安装的agent文件夹
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-xs pt-space-xs">
          <div className="flex min-w-0 flex-wrap items-center gap-space-xs">
            {skill.isExternal ? (
              <button
                type="button"
                onClick={() => onImport?.(skill)}
                className="flex items-center gap-1 rounded-card bg-primary-fixed px-space-sm py-1 text-body-sm font-semibold text-primary transition-colors hover:bg-primary-container hover:text-on-primary"
              >
                <Icon name="archive" size={15} />
                纳入中央库
              </button>
            ) : (
              <>
                <CardAction icon="visibility" label="预览" onClick={() => onPreview(skill)} />
                <CardAction icon="edit" label="编辑" onClick={() => onEdit(skill)} />
                {installTarget ? (
                  <InstallAction
                    target={installTarget}
                    badge={targetBadge}
                    pending={pendingAgent === installTarget.agentId}
                    onInstall={() =>
                      void handleBadge(installTarget.agentId, installTarget.agentName, false)
                    }
                    onReplace={() =>
                      void handleBadge(installTarget.agentId, installTarget.agentName, false, true)
                    }
                    onUninstall={() =>
                      void handleBadge(installTarget.agentId, installTarget.agentName, true)
                    }
                  />
                ) : null}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={`${skill.name} 更多操作`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface data-[state=open]:bg-surface-container"
                >
                  <Icon name="more_horiz" size={16} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-[70] min-w-[184px] rounded-card border border-outline-variant/40 bg-surface-container-lowest p-1 shadow-float"
                >
                  <MenuItem icon="open_in_new" onSelect={() => onOpen(skill)}>
                    查看技能详情
                  </MenuItem>
                  <MenuItem icon="visibility" onSelect={() => onPreview(skill)}>
                    预览 SKILL.md
                  </MenuItem>
                  <MenuItem
                    icon="content_copy"
                    onSelect={() => {
                      void copyText(skill.path).then(
                        () =>
                          pushToast({
                            tone: 'info',
                            title: '路径已复制',
                            description: skill.displayPath,
                          }),
                        () =>
                          pushToast({
                            tone: 'error',
                            title: '复制失败',
                            description: '剪贴板不可用',
                          }),
                      );
                    }}
                  >
                    复制技能路径
                  </MenuItem>
                  <MenuItem
                    icon="folder_open"
                    onSelect={() => {
                      void revealPath(skill.path).catch(() =>
                        pushToast({
                          tone: 'warning',
                          title: '无法打开目录',
                          description: '该操作仅在桌面应用内可用',
                        }),
                      );
                    }}
                  >
                    在文件管理器中显示
                  </MenuItem>
                  <DropdownMenu.Separator className="my-1 h-px bg-outline-variant/35" />
                  {skill.isExternal ? (
                    <MenuItem icon="archive" onSelect={() => onImport?.(skill)}>
                      纳入中央库
                    </MenuItem>
                  ) : (
                    <MenuItem icon="edit" onSelect={() => onEdit(skill)}>
                      编辑技能
                    </MenuItem>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </article>

      {forcePrompt ? (
        <ForceUninstallDialog
          prompt={forcePrompt}
          skillName={skill.name}
          context={context}
          onCancel={() => setForcePrompt(null)}
          onConfirm={async () => {
            const target = forcePrompt;
            setForcePrompt(null);
            try {
              await uninstall(
                {
                  skillName: skill.name,
                  agentId: target.agentId,
                  scope: context.scope,
                  projectId: context.projectId ?? null,
                  force: true,
                },
                target.agentName,
              );
            } catch (error) {
              pushToast({
                tone: 'error',
                title: '强制卸载失败',
                description: (error as { message?: string }).message ?? String(error),
              });
            }
          }}
        />
      ) : null}
    </>
  );
}

function InstallAction({
  target,
  badge,
  pending,
  onInstall,
  onReplace,
  onUninstall,
}: {
  target: SkillInstallTarget;
  badge: AgentBadgeType | null;
  pending: boolean;
  onInstall: () => void;
  onReplace: () => void;
  onUninstall: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const state = badge?.state ?? 'locked';
  const installed = state === 'installed';
  const conflict = state === 'conflict';
  const actionable = !pending && (installed || conflict || state === 'available');

  const label = installed
    ? '已安装'
    : state === 'available' || state === 'conflict'
      ? '安装'
      : state === 'locked'
        ? '目录未授权'
        : '无可用目录';

  const icon = installed
    ? 'link'
    : state === 'available' || state === 'conflict'
      ? 'add_link'
      : 'lock';

  const title = [
    `${target.agentName} · ${badgeStateLabel(state)}`,
    badge?.detail,
    badge?.targetDisplay,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      <button
        type="button"
        disabled={!actionable}
        onClick={installed ? onUninstall : conflict ? () => setConfirming(true) : onInstall}
        title={title}
        aria-label={`${target.agentName}：${pending ? '处理中' : label}`}
        className={cn(
          'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-control px-space-xs py-1 text-body-sm transition-colors',
          actionable
            ? 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            : 'cursor-default text-outline',
        )}
      >
        {pending ? (
          <Icon name="progress_activity" size={14} className="shrink-0 animate-spin" />
        ) : (
          <Icon name={icon} size={14} className="shrink-0" />
        )}
        <span className="truncate">{pending ? '处理中…' : label}</span>
      </button>

      {confirming ? (
        <ReplaceInstallDialog
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onReplace();
          }}
        />
      ) : null}
    </>
  );
}

function CardAction({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-control px-space-xs py-1 text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}

function MenuItem({
  icon,
  children,
  onSelect,
}: {
  icon: string;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex cursor-pointer select-none items-center gap-2 rounded-control px-2 py-1.5 text-body-sm text-on-surface outline-none data-[highlighted]:bg-surface-container"
    >
      <Icon name={icon} size={15} className="text-on-surface-variant" />
      {children}
    </DropdownMenu.Item>
  );
}

function ForceUninstallDialog({
  prompt,
  skillName,
  onCancel,
  onConfirm,
}: {
  prompt: { agentId: string; agentName: string };
  skillName: string;
  context: { scope: ScopeKind; projectId?: string | null };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--color-scrim)] p-4 backdrop-blur-[2px]">
      <div className="dialog-enter w-full max-w-md rounded-card border border-error/30 bg-surface-container-lowest p-4 shadow-dialog">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error-container text-error">
            <Icon name="warning" size={18} filled />
          </span>
          <div>
            <h3 className="text-headline-sm font-semibold text-on-surface">副本已被外部修改</h3>
            <p className="mt-1 text-body-sm leading-5 text-on-surface-variant">
              「{skillName}」在 {prompt.agentName}{' '}
              工作区中的副本已与安装时不一致。继续卸载会移除这些外部修改。 副本将被移入{' '}
              <span className="font-mono text-[11px]">~/.myskills/trash/</span>。
              中央库原件不会受到影响。
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-control border border-outline-variant/60 px-3 py-1.5 text-body-md text-on-surface transition-colors hover:bg-surface-container-low"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 rounded-control bg-error px-3 py-1.5 text-body-md text-on-error transition-colors hover:bg-error/90"
          >
            <Icon name="delete_forever" size={15} />
            确认强制卸载
          </button>
        </div>
      </div>
    </div>
  );
}
