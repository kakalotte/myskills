import { useState } from 'react';
import { cn, badgeStateLabel } from '../../lib/format';
import type { AgentBadge as AgentBadgeType } from '../../lib/types';
import { Icon } from '../ui/Icon';
import { AgentMark } from './AgentMark';
import { ReplaceInstallDialog } from './ReplaceInstallDialog';

interface AgentBadgeProps {
  badge: AgentBadgeType;
  pending: boolean;
  onInstall: () => void;
  /** Install after the user confirmed deleting the same-name entry. */
  onReplace: () => void;
  onUninstall: () => void;
}

const installableClasses =
  'bg-surface-container-highest/50 text-outline border-outline-variant/25 opacity-50 hover:opacity-100 hover:bg-surface-container-high';

const stateClasses: Record<AgentBadgeType['state'], string> = {
  installed: '',
  available: installableClasses,
  origin: 'bg-secondary-fixed text-on-secondary-fixed border-secondary/35 shadow-sm cursor-default',
  // A same-name entry is presented exactly like "not installed"; the overwrite warning
  // only appears after the click.
  conflict: installableClasses,
  locked:
    'bg-surface-container text-outline/60 border-outline-variant/35 opacity-55 cursor-default',
  external:
    'bg-surface-container text-outline/60 border-outline-variant/30 opacity-40 cursor-default',
};

export function AgentBadge({ badge, pending, onInstall, onReplace, onUninstall }: AgentBadgeProps) {
  const [confirming, setConfirming] = useState(false);
  const installed = badge.state === 'installed';
  const conflict = badge.state === 'conflict';
  const actionable = !pending && (installed || conflict || badge.state === 'available');
  const titleParts = [
    `${badge.agentName} · ${badgeStateLabel(badge.state)}`,
  ];
  if (badge.detail) titleParts.push(badge.detail);
  titleParts.push(badge.targetDisplay);

  const installedClasses = '';

  return (
    <>
      <button
        type="button"
        disabled={!actionable}
        title={titleParts.join('\n')}
        aria-label={`${badge.agentName}：${badgeStateLabel(badge.state)}`}
        onClick={installed ? onUninstall : conflict ? () => setConfirming(true) : onInstall}
        className={cn(
          'relative flex h-7 w-7 items-center justify-center rounded-control border transition-all duration-150',
          installed ? installedClasses : stateClasses[badge.state],
          actionable && 'active:scale-95',
        )}
      >
        <AgentMark agentId={badge.agentId} agentName={badge.agentName} size={15} />
        {badge.state === 'locked' ? (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-surface-container-lowest bg-surface-container-highest text-outline">
            <Icon name="lock" size={7} />
          </span>
        ) : null}
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-control bg-surface-container-lowest/85">
            <Icon name="progress_activity" size={13} className="animate-spin text-primary" />
          </span>
        ) : null}
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
