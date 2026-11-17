import { useMemo, useState } from 'react';
import { AgentBadge } from '../agents/AgentBadge';
import { Icon } from '../ui/Icon';
import { api } from '../../lib/bridge';
import { cn } from '../../lib/format';
import type { AgentBadge as AgentBadgeType, InstallSkillItem, RootInfo, ScopeKind, SkillView } from '../../lib/types';
import { useAppStore } from '../../store/app-store';

interface Bundle {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  skillNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BundleInstallTarget {
  rootId: string;
  agentId: string;
  agentName: string;
}

interface BundleCardProps {
  bundle: Bundle;
  skills: SkillView[];
  roots: RootInfo[];
  context: { scope: ScopeKind; projectId?: string | null };
  installTarget?: BundleInstallTarget;
  onOpen?: () => void;
}

export function BundleCard({ bundle, skills, roots, context, installTarget, onOpen }: BundleCardProps) {
  const pushToast = useAppStore((state) => state.pushToast);
  const refreshGlobal = useAppStore((state) => state.refreshGlobal);
  const refreshProject = useAppStore((state) => state.refreshProject);
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);

  const skillMap = useMemo(() => new Map(skills.map((s) => [s.name, s])), [skills]);
  const bundleSkills = useMemo(
    () => bundle.skillNames.map((name) => skillMap.get(name)).filter((s): s is SkillView => Boolean(s)),
    [bundle.skillNames, skillMap],
  );
  const missingCount = bundle.skillNames.length - bundleSkills.length;
  const installableSkills = useMemo(
    () => bundleSkills.filter((s) => !s.isExternal),
    [bundleSkills],
  );

  const agentRoots = useMemo(() => {
    if (installTarget) {
      const root = roots.find((r) => r.id === installTarget.rootId || r.agentId === installTarget.agentId);
      return root ? [root] : [];
    }
    return roots.filter((r) => r.authorized && r.exists);
  }, [roots, installTarget]);

  const refresh = async () => {
    if (context.scope === 'project' && context.projectId) {
      await refreshProject(context.projectId, { announce: false });
    } else {
      await refreshGlobal({ announce: false });
    }
  };

  const computeBadge = (agent: RootInfo): AgentBadgeType => {
    if (installableSkills.length === 0) {
      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        rootId: agent.id,
        scope: context.scope,
        state: 'locked',
        mountType: null,
        targetPath: agent.path,
        targetDisplay: agent.displayPath,
        authorized: agent.authorized,
        rootExists: agent.exists,
        detail: missingCount > 0 ? `无可安装技能（缺失 ${missingCount} 个）` : '组合中暂无可安装技能',
      };
    }
    let installedCount = 0;
    let conflict = false;
    let available = false;
    for (const skill of installableSkills) {
      const badge = skill.badges.find((item) => item.rootId === agent.id || item.agentId === agent.agentId);
      if (!badge) continue;
      if (badge.state === 'conflict') conflict = true;
      else if (badge.state === 'installed') installedCount += 1;
      else if (badge.state === 'available') available = true;
    }
    const allInstalled = installedCount === installableSkills.length;
    const state: AgentBadgeType['state'] = conflict
      ? 'conflict'
      : allInstalled
        ? 'installed'
        : available || installedCount < installableSkills.length
          ? 'available'
          : 'locked';
    return {
      agentId: agent.agentId,
      agentName: agent.agentName,
      rootId: agent.id,
      scope: context.scope,
      state,
      mountType: allInstalled ? 'symlink' : null,
      targetPath: agent.path,
      targetDisplay: agent.displayPath,
      authorized: agent.authorized,
      rootExists: agent.exists,
      detail:
        conflict
          ? `存在同名目标，安装时将覆盖${missingCount > 0 ? `（缺失 ${missingCount} 个）` : ''}`
          : allInstalled
            ? `已安装全部 ${installableSkills.length} 个技能${missingCount > 0 ? `（缺失 ${missingCount} 个）` : ''}`
            : `已安装 ${installedCount}/${installableSkills.length}${missingCount > 0 ? `，缺失 ${missingCount} 个` : ''}`,
    };
  };

  const handleInstall = async (agentId: string, agentName: string, force = false) => {
    if (installableSkills.length === 0) return;
    setPendingAgent(agentId);
    try {
      const items: InstallSkillItem[] = installableSkills.map((skill) => ({ skillName: skill.name, agentId }));
      const outcome = await api.installSkills({ items, scope: context.scope, projectId: context.projectId ?? null, force });
      await refresh();
      pushToast({
        tone: outcome.failed === 0 ? 'success' : 'warning',
        title: `${bundle.name} · ${agentName}`,
        description: `成功 ${outcome.succeeded}，跳过 ${outcome.skipped}，失败 ${outcome.failed}${missingCount > 0 ? `（缺失 ${missingCount} 个未安装）` : ''}`,
      });
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      pushToast({ tone: 'error', title: '安装失败', description: normalized.message ?? String(err) });
    } finally {
      setPendingAgent(null);
    }
  };

  const handleUninstall = async (agentId: string, agentName: string) => {
    if (installableSkills.length === 0) return;
    setPendingAgent(agentId);
    try {
      let succeeded = 0;
      let failed = 0;
      const agentRoot = agentRoots.find((r) => r.agentId === agentId);
      for (const skill of installableSkills) {
        const badge = skill.badges.find((item) => (agentRoot ? item.rootId === agentRoot.id : item.agentId === agentId));
        if (badge?.state !== 'installed') continue;
        try {
          await api.uninstallSkill({ skillName: skill.name, agentId, scope: context.scope, projectId: context.projectId ?? null, force: false });
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      await refresh();
      pushToast({
        tone: failed === 0 ? 'success' : 'warning',
        title: `已从 ${agentName} 卸载组合`,
        description: `成功 ${succeeded}，失败 ${failed}`,
      });
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      pushToast({ tone: 'error', title: '卸载失败', description: normalized.message ?? String(err) });
    } finally {
      setPendingAgent(null);
    }
  };

  const badges = agentRoots.map((agent) => computeBadge(agent));
  const anyInstalled = badges.some((b) => b.state === 'installed');
  const single = installTarget ? badges[0] ?? null : null;

  return (
    <article className="relative flex h-full min-h-[210px] flex-col gap-space-sm rounded-card bg-surface-container-lowest p-space-md shadow-card transition-shadow duration-200 hover:shadow-floating">
      <div className="flex items-start justify-between gap-space-sm">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" title={bundle.name}>
          <div className="flex items-center gap-space-xs">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-primary-fixed text-primary">
              <Icon name="layers" size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-headline-sm font-semibold text-on-surface">{bundle.name}</h3>
              <p className="truncate font-mono text-label-code-sm text-on-surface-variant">
                {bundle.skillNames.length} 个技能{missingCount > 0 ? ` · 缺失 ${missingCount}` : ''}
              </p>
            </div>
          </div>
        </button>
        <span className={cn('shrink-0 rounded px-space-xs py-0.5 text-[12px] font-medium', anyInstalled ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant')}>
          {anyInstalled ? '已安装' : '未安装'}
        </span>
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-body-sm text-on-surface-variant">
        {bundle.description || '暂无描述'}
      </p>

      <div className="mt-auto flex flex-col gap-space-xs">
        {installTarget && single ? (
          <div className="flex items-center justify-between rounded-card bg-surface-container-low/60 p-space-xs">
            <span className="text-body-sm text-on-surface-variant">安装到 {installTarget.agentName}</span>
            <AgentBadge
              badge={single}
              pending={pendingAgent === single.agentId}
              onInstall={() => void handleInstall(single.agentId, single.agentName)}
              onReplace={() => void handleInstall(single.agentId, single.agentName, true)}
              onUninstall={() => void handleUninstall(single.agentId, single.agentName)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-space-xs rounded-card bg-surface-container-low/60 p-space-xs">
            <div className="flex flex-wrap items-center gap-space-xs">
              {badges.map((badge) => (
                <AgentBadge
                  key={badge.rootId}
                  badge={badge}
                  pending={pendingAgent === badge.agentId}
                  onInstall={() => void handleInstall(badge.agentId, badge.agentName)}
                  onReplace={() => void handleInstall(badge.agentId, badge.agentName, true)}
                  onUninstall={() => void handleUninstall(badge.agentId, badge.agentName)}
                />
              ))}
              {badges.length === 0 ? (
                <span className="px-1 text-[11px] text-on-surface-variant">未发现可安装的agent文件夹</span>
              ) : null}
            </div>
          </div>
        )}
        {missingCount > 0 ? (
          <span className="px-1 text-[11px] text-on-surface-variant">{missingCount} 个技能不在当前库中，将跳过</span>
        ) : null}
      </div>
    </article>
  );
}
