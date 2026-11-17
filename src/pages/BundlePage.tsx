import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentBadge } from '../components/agents/AgentBadge';
import { api } from '../lib/bridge';
import { cn } from '../lib/format';
import { useAppStore } from '../store/app-store';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import type { AgentBadge as AgentBadgeType, InstallSkillItem } from '../lib/types';

interface BundleItem {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  skillNames: string[];
  createdAt: string;
  updatedAt: string;
}

export function BundlePage() {
  const navigate = useNavigate();
  const pushToast = useAppStore((state) => state.pushToast);
  const scan = useAppStore((state) => state.globalScan);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const scanning = useAppStore((state) => state.globalScanning);
  const refresh = useAppStore((state) => state.refreshGlobal);

  const [bundles, setBundles] = useState<BundleItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      void refresh({ announce: false });
    }
  }, [bootstrap, scan, scanning, refresh]);

  const skillMap = useMemo(
    () => new Map((scan?.skills ?? []).map((skill) => [skill.name, skill])),
    [scan],
  );

  const activeBundle = useMemo(
    () => bundles.find((bundle) => bundle.id === selectedId) ?? null,
    [bundles, selectedId],
  );

  const availableSkills = useMemo(() => {
    if (!activeBundle) return [];
    return (scan?.skills ?? [])
      .filter((skill) => !skill.isExternal && !activeBundle.skillNames.includes(skill.name))
      .map((skill) => skill.name)
      .sort((a, b) => a.localeCompare(b));
  }, [scan, activeBundle]);

  const loadBundles = useCallback(async () => {
    setError(null);
    try {
      const outcome = await api.listBundles();
      setBundles(outcome.bundles);
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      setError(normalized.message ?? '加载组合失败');
      pushToast({
        tone: 'error',
        title: '加载组合失败',
        description: normalized.message ?? String(err),
      });
    }
  }, [pushToast]);

  const filteredBundles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundles.filter((bundle) => {
      return (
        !q ||
        bundle.name.toLowerCase().includes(q) ||
        bundle.slug.toLowerCase().includes(q) ||
        bundle.description.toLowerCase().includes(q)
      );
    });
  }, [bundles, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBundles();
  }, [loadBundles]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('确定要删除此组合吗？组合内的技能不会被删除。')) return;
      try {
        await api.deleteBundle(id);
        pushToast({ tone: 'success', title: '组合已删除' });
        if (selectedId === id) setSelectedId(null);
        void loadBundles();
      } catch (err: unknown) {
        const normalized = err as { code?: string; message?: string };
        setError(normalized.message ?? '删除组合失败');
        pushToast({
          tone: 'error',
          title: '删除组合失败',
          description: normalized.message ?? String(err),
        });
      }
    },
    [pushToast, loadBundles, selectedId],
  );

  const handleRename = useCallback(async () => {
    if (!activeBundle) return;
    const newName = window.prompt('请输入新名称', activeBundle.name);
    if (!newName || !newName.trim()) return;
    setSubmitting(true);
    try {
      await api.updateBundle({ id: activeBundle.id, name: newName.trim() });
      pushToast({ tone: 'success', title: '组合已重命名' });
      void loadBundles();
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      setError(normalized.message ?? '重命名失败');
      pushToast({
        tone: 'error',
        title: '重命名失败',
        description: normalized.message ?? String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }, [activeBundle, pushToast, loadBundles]);

  const handleAddSkill = useCallback(
    async (skillName: string) => {
      if (!activeBundle) return;
      setSubmitting(true);
      try {
        await api.addSkillToBundle({ bundleId: activeBundle.id, skillName });
        pushToast({ tone: 'success', title: '技能已添加' });
        void loadBundles();
      } catch (err: unknown) {
        const normalized = err as { code?: string; message?: string };
        setError(normalized.message ?? '添加技能失败');
        pushToast({
          tone: 'error',
          title: '添加技能失败',
          description: normalized.message ?? String(err),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [activeBundle, pushToast, loadBundles],
  );

  const handleRemoveSkill = useCallback(
    async (skillName: string) => {
      if (!activeBundle) return;
      setSubmitting(true);
      try {
        await api.removeSkillFromBundle({ bundleId: activeBundle.id, skillName });
        pushToast({ tone: 'success', title: '技能已移除' });
        void loadBundles();
      } catch (err: unknown) {
        const normalized = err as { code?: string; message?: string };
        setError(normalized.message ?? '移除技能失败');
        pushToast({
          tone: 'error',
          title: '移除技能失败',
          description: normalized.message ?? String(err),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [activeBundle, pushToast, loadBundles],
  );

  const acronym = (name: string) =>
    name
      .split(/[\s\-_]/)
      .map((word) => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('')
      .slice(0, 2) || 'SK';

  const mountedCount = (bundle: BundleItem) =>
    bundle.skillNames.reduce((total, name) => {
      const skill = skillMap.get(name);
      return total + (skill?.badges.filter((badge) => badge.state === 'installed').length ?? 0);
    }, 0);

  const bundleSkills = useMemo(() => {
    if (!activeBundle) return [];
    return activeBundle.skillNames
      .map((name) => skillMap.get(name))
      .filter((skill): skill is NonNullable<typeof skill> => skill !== undefined);
  }, [activeBundle, skillMap]);

  const agents = useMemo(
    () =>
      (scan?.roots ?? [])
        .filter((root) => root.scope === 'global' && root.authorized && root.exists)
        .sort((a, b) => a.agentName.localeCompare(b.agentName, 'zh-CN')),
    [scan],
  );

  const bundleBadges = useMemo<AgentBadgeType[]>(() => {
    if (!activeBundle) return [];
    return agents.map((agent) => {
      let installedCount = 0;
      let conflict = false;
      let available = false;
      for (const skill of bundleSkills) {
        const badge = skill.badges.find((item) => item.rootId === agent.id);
        if (!badge) continue;
        if (badge.state === 'conflict') conflict = true;
        else if (badge.state === 'installed') installedCount += 1;
        else if (badge.state === 'available') available = true;
      }
      const allInstalled = bundleSkills.length > 0 && installedCount === bundleSkills.length;
      const state: AgentBadgeType['state'] = conflict
        ? 'conflict'
        : allInstalled
          ? 'installed'
          : available || installedCount < bundleSkills.length
            ? 'available'
            : 'locked';
      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        rootId: agent.id,
        scope: 'global',
        state: bundleSkills.length === 0 ? 'locked' : state,
        mountType: allInstalled ? 'symlink' : null,
        targetPath: agent.path,
        targetDisplay: agent.displayPath,
        authorized: agent.authorized,
        rootExists: agent.exists,
        detail:
          bundleSkills.length === 0
            ? '组合中暂无技能'
            : conflict
              ? '存在同名目标，安装时将覆盖'
              : allInstalled
                ? `已安装全部 ${bundleSkills.length} 个技能`
                : `已安装 ${installedCount}/${bundleSkills.length}`,
      };
    });
  }, [activeBundle, agents, bundleSkills]);

  const handleBundleInstall = useCallback(
    async (agentId: string, agentName: string, force = false) => {
      if (!activeBundle) return;
      setPendingAgent(agentId);
      try {
        const items: InstallSkillItem[] = bundleSkills.map((skill) => ({
          skillName: skill.name,
          agentId,
        }));
        const outcome = await api.installSkills({ items, scope: 'global', force });
        await refresh({ announce: false });
        pushToast({
          tone: outcome.failed === 0 ? 'success' : 'warning',
          title: `${activeBundle.name} · ${agentName}`,
          description: `成功 ${outcome.succeeded}，跳过 ${outcome.skipped}，失败 ${outcome.failed}`,
        });
      } catch (err: unknown) {
        const normalized = err as { code?: string; message?: string };
        pushToast({
          tone: 'error',
          title: '安装失败',
          description: normalized.message ?? String(err),
        });
      } finally {
        setPendingAgent(null);
      }
    },
    [activeBundle, bundleSkills, pushToast, refresh],
  );

  const handleBundleUninstall = useCallback(
    async (agentId: string, agentName: string) => {
      if (!activeBundle) return;
      setPendingAgent(agentId);
      try {
        let succeeded = 0;
        let failed = 0;
        for (const skill of bundleSkills) {
          const badge = skill.badges.find((item) => item.agentId === agentId);
          if (badge?.state !== 'installed') continue;
          try {
            await api.uninstallSkill({
              skillName: skill.name,
              agentId,
              scope: 'global',
              projectId: null,
              force: false,
            });
            succeeded += 1;
          } catch {
            failed += 1;
          }
        }
        await refresh({ announce: false });
        pushToast({
          tone: failed === 0 ? 'success' : 'warning',
          title: `已从 ${agentName} 卸载组合`,
          description: `成功 ${succeeded}，失败 ${failed}`,
        });
      } catch (err: unknown) {
        const normalized = err as { code?: string; message?: string };
        pushToast({
          tone: 'error',
          title: '卸载失败',
          description: normalized.message ?? String(err),
        });
      } finally {
        setPendingAgent(null);
      }
    },
    [activeBundle, bundleSkills, pushToast, refresh],
  );

  return (
    <div className="flex flex-col gap-space-md p-space-md lg:h-full lg:min-h-0">
      <header className="flex flex-col justify-between gap-4 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-space-md">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-fixed text-primary shadow-sm">
            <Icon name="layers" size={24} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-headline-md font-semibold text-on-surface">技能组合</h1>
            <p className="truncate text-body-sm text-on-surface-variant">技能编组与一键安装。</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm self-end md:self-auto">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--color-outline,#94a3b8)]">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索组合"
              className="h-9 w-48 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] pl-9 pr-3 text-sm text-[var(--color-on-surface,#111827)] outline-none placeholder:text-[var(--color-outline,#94a3b8)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            icon="add_box"
            onClick={() => navigate('/bundles/new')}
          >
            新建组合
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-control bg-error-container/50 px-space-md py-space-sm text-body-sm text-on-error-container">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-space-md lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:items-stretch">
        {/* 左栏：组合列表 */}
        <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-4 shadow-sm lg:col-span-4 lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-center justify-between gap-space-xs pb-space-xs">
            <span className="font-mono text-label-code-sm text-on-surface-variant">
              共 {bundles.length} 个组合
            </span>
          </div>

          <div className="flex flex-col gap-space-sm lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {filteredBundles.length > 0 ? (
              filteredBundles.map((bundle) => {
                const isSelected = selectedId === bundle.id;
                const mounted = mountedCount(bundle);
                return (
                  <div
                    key={bundle.id}
                    onClick={() => setSelectedId(bundle.id)}
                    className={cn(
                      'flex cursor-pointer select-none flex-col gap-2 rounded-lg border p-4 transition-all',
                      isSelected
                        ? 'border-[color-mix(in_srgb,var(--color-primary,#2563eb)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary,#2563eb)_6%,var(--color-surface,#fff))] ring-1 ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]'
                        : 'border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container-low,#fbfcfd)]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-space-xs">
                      <div className="flex min-w-0 items-center gap-space-sm">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-card text-headline-sm font-bold',
                            isSelected
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-on-surface-variant',
                          )}
                          aria-hidden="true"
                        >
                          {acronym(bundle.name)}
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <h4
                            className="truncate text-headline-sm font-semibold text-on-surface"
                            title={bundle.name}
                          >
                            {bundle.name}
                          </h4>
                          <span className="font-mono text-label-code-sm text-on-surface-variant">
                            {bundle.skillNames.length} 个技能
                          </span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded px-space-xs py-0.5 text-[12px] font-medium',
                          mounted > 0
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-container text-on-surface-variant',
                        )}
                      >
                        {mounted > 0 ? '已安装' : '未安装'}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-body-sm text-on-surface-variant">
                      {bundle.description || '暂无描述'}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center gap-space-xs rounded-card bg-surface-container-lowest py-10 text-on-surface-variant">
                <Icon name="inventory_2" size={28} className="text-outline" />
                <p className="text-body-sm">暂无技能组合</p>
                <Button
                  variant="soft"
                  size="sm"
                  icon="add"
                  onClick={() => navigate('/bundles/new')}
                >
                  新建组合
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 右栏：组合详情 */}
        <div className="flex min-w-0 flex-col gap-space-md lg:col-span-8 lg:min-h-0 lg:overflow-y-auto">
          {activeBundle ? (
            <>
              <section className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-space-sm md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-col">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <h2 className="truncate text-headline-lg text-on-surface">
                        {activeBundle.name}
                      </h2>
                      <button
                        type="button"
                        onClick={handleRename}
                        className="text-on-surface-variant transition-colors hover:text-primary"
                        title="修改组合名称"
                        disabled={submitting}
                      >
                        <Icon name="edit_note" size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      icon="delete"
                      className="text-[var(--color-error,#dc2626)] hover:bg-[var(--color-error-container,#fee2e2)] hover:border-[var(--color-error,#dc2626)]"
                      onClick={() => void handleDelete(activeBundle.id)}
                    >
                      删除
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon="edit"
                      onClick={() => navigate(`/bundles/${activeBundle.id}/edit`)}
                    >
                      编辑
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)] bg-[var(--color-surface-container-low,#fbfcfd)] p-4">
                  <div className="flex flex-col items-start justify-between gap-space-sm sm:flex-row sm:items-center">
                    <span className="text-sm text-[var(--color-on-surface-variant,#4b5563)]">
                      共 {activeBundle.skillNames.length} 个技能。
                    </span>
                  </div>
                  {activeBundle.skillNames.length > 0 ? (
                    <div className="flex flex-col gap-space-xs border-t border-surface-container pt-space-sm">
                      <span className="font-caption-caps uppercase text-on-surface-variant">
                        安装到 Agent
                      </span>
                      <div className="flex flex-wrap items-center gap-space-xs">
                        {bundleBadges.map((badge) => (
                          <AgentBadge
                            key={badge.rootId}
                            badge={badge}
                            pending={pendingAgent === badge.agentId}
                            onInstall={() => void handleBundleInstall(badge.agentId, badge.agentName)}
                            onReplace={() =>
                              void handleBundleInstall(badge.agentId, badge.agentName, true)
                            }
                            onUninstall={() => void handleBundleUninstall(badge.agentId, badge.agentName)}
                          />
                        ))}
                        {bundleBadges.length === 0 ? (
                          <span className="text-body-sm text-on-surface-variant">
                            暂无可用的全局 Agent
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-space-xs">
                  <div className="flex items-center gap-space-sm">
                    <h3 className="text-headline-sm text-on-surface">已打包技能清单</h3>
                    <span className="rounded bg-surface-container px-space-xs py-0.5 font-mono text-label-code-sm font-medium text-on-surface-variant">
                      {activeBundle.skillNames.length} 项
                    </span>
                  </div>
                  {availableSkills.length > 0 ? (
                    <select
                      value=""
                      disabled={submitting}
                      onChange={(e) => {
                        if (e.target.value) void handleAddSkill(e.target.value);
                      }}
                      className="h-9 max-w-[240px] rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 text-sm text-[var(--color-on-surface,#111827)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]"
                    >
                      <option value="">添加技能…</option>
                      {availableSkills.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-mono text-label-code-sm text-on-surface-variant">
                      已全部加入
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left font-body-sm">
                    <thead>
                      <tr className="bg-[var(--color-surface-container,#eaf0f6)] text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant,#4b5563)]">
                        <th className="rounded-l px-space-md py-2.5">技能名称</th>
                        <th className="px-space-md py-2.5">功能说明</th>
                        <th className="px-space-md py-2.5 text-center">部署状态</th>
                        <th className="rounded-r px-space-md py-2.5 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {activeBundle.skillNames.map((skillName) => {
                        const skill = skillMap.get(skillName);
                        const installed =
                          skill?.badges.filter((badge) => badge.state === 'installed').length ?? 0;
                        return (
                          <tr
                            key={skillName}
                            className="transition-colors hover:bg-[var(--color-surface-container-low,#fbfcfd)]"
                          >
                            <td className="px-space-md py-2.5 font-semibold text-on-surface">
                              <span className="line-clamp-1">{skillName}</span>
                            </td>
                            <td className="max-w-xs px-space-md py-2.5 text-on-surface-variant">
                              <span className="line-clamp-1">{skill?.description || '—'}</span>
                            </td>
                            <td className="px-space-md py-2.5 text-center">
                              <span
                                className={cn(
                                  'rounded px-space-xs py-0.5 text-[11px] font-medium',
                                  installed > 0
                                    ? 'bg-secondary-container text-on-secondary-container'
                                    : 'bg-surface-container text-on-surface-variant',
                                )}
                              >
                                {installed > 0 ? `已安装 ${installed} 处` : '未安装'}
                              </span>
                            </td>
                            <td className="px-space-md py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => void handleRemoveSkill(skillName)}
                                className="p-1 text-on-surface-variant transition-colors hover:text-error"
                                title="移出组合"
                              >
                                <Icon name="delete_outline" size={18} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {activeBundle.skillNames.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-space-lg text-center font-mono text-label-code-sm text-on-surface-variant"
                          >
                            暂无技能，可从右上角添加。
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>


            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] py-20 text-[var(--color-on-surface-variant,#6b7280)] shadow-sm">
              <Icon name="layers" size={40} className="text-outline" />
              <h2 className="mt-space-xs text-body-md font-medium text-on-surface">
                请选择一个技能组合
              </h2>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


