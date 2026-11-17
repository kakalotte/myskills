import type { BadgeState, MountType, ScopeKind, SkillSource } from './types';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function scopeLabel(scope: ScopeKind | null | undefined): string {
  return scope === 'project' ? '项目级' : '全局级';
}

export function sourceLabel(source: SkillSource): string {
  if (source === 'external') return '外部安装';
  if (source === 'imported') return '导入';
  return '自建';
}

export function mountLabel(mount: MountType | null | undefined): string {
  if (mount === 'copy') return '副本';
  if (mount === 'symlink') return '链接';
  return '未安装';
}

export function badgeStateLabel(state: BadgeState): string {
  switch (state) {
    case 'installed':
      return '已安装';
    case 'available':
      return '未安装';
    case 'origin':
      return '外部原件';
    case 'conflict':
      // Same-name entries are presented as plain "not installed"; the overwrite warning
      // only appears after the user clicks install.
      return '未安装';
    case 'locked':
      return '未授权';
    case 'external':
      return '需纳入中央库';
    default:
      return state;
  }
}


