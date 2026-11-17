import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BundleCard } from '../components/bundles/BundleCard';
import { SkillCard } from '../components/home/SkillCard';
import { SkillPreviewDialog } from '../components/home/SkillPreviewDialog';
import { AgentMark } from '../components/agents/AgentMark';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { api } from '../lib/bridge';
import { cn } from '../lib/format';
import { revealPath } from '../lib/platform';
import type { Bundle, RootInfo, SkillView } from '../lib/types';
import { useAppStore } from '../store/app-store';

export function AgentsPage() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const scan = useAppStore((state) => state.globalScan);
  const scanning = useAppStore((state) => state.globalScanning);
  const scanError = useAppStore((state) => state.globalScanError);
  const refresh = useAppStore((state) => state.refreshGlobal);
  const pushToast = useAppStore((state) => state.pushToast);
  const navigate = useNavigate();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyUninstalled, setOnlyUninstalled] = useState(false);
  const [previewSkill, setPreviewSkill] = useState<SkillView | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      void refresh({ announce: false });
    }
  }, [bootstrap, scan, scanning, refresh]);

  useEffect(() => {
    if (!bootstrap) return;
    void api
      .listBundles()
      .then((outcome) => setBundles(outcome.bundles))
      .catch(() => setBundles([]));
  }, [bootstrap, scan]);

  // Left rail: only global Agent workspaces the user has authorized and that exist on disk.
  const agents = useMemo<RootInfo[]>(() => {
    const seen = new Set<string>();
    const result: RootInfo[] = [];
    for (const root of bootstrap?.roots ?? []) {
      if (root.scope !== 'global' || !root.exists || !root.authorized) continue;
      if (seen.has(root.agentId)) continue;
      seen.add(root.agentId);
      result.push(root);
    }
    return result.sort((a, b) => a.agentName.localeCompare(b.agentName, 'zh-CN'));
  }, [bootstrap]);

  const activeRoot = agents.find((root) => root.agentId === selectedAgentId) ?? agents[0] ?? null;
  const activeRootId = activeRoot?.id ?? null;

  // External skills cannot be installed directly, so this page only lists central-library skills.
  const skills = useMemo(() => (scan?.skills ?? []).filter((skill) => !skill.isExternal), [scan]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skills
      .filter((skill) => {
        if (onlyUninstalled) {
          const badge = skill.badges.find((item) => item.rootId === activeRootId);
          if (badge?.state === 'installed') return false;
        }
        if (!needle) return true;
        return [skill.name, skill.dirName, skill.description]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [skills, query, onlyUninstalled, activeRootId]);

  const filteredBundles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const skillMap = new Map(skills.map((skill) => [skill.name, skill]));
    return bundles
      .filter((bundle) => {
        if (needle) {
          const hay = [bundle.name, bundle.slug, bundle.description].join(' ').toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        if (!onlyUninstalled || !activeRootId) return true;
        const members = bundle.skillNames
          .map((name) => skillMap.get(name))
          .filter((s): s is SkillView => s != null && !s.isExternal);
        if (members.length === 0) return true;
        const allInstalled = members.every(
          (member) => member.badges.find((item) => item.rootId === activeRootId)?.state === 'installed',
        );
        return !allInstalled;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [bundles, skills, query, onlyUninstalled, activeRootId]);

  return (
    <div className="flex flex-col gap-space-md p-space-md lg:h-full lg:min-h-0">

      <div className="flex min-w-0 flex-col gap-space-md lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        <aside className="flex flex-col gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-3 lg:min-h-0 lg:w-[260px] lg:shrink-0 lg:overflow-hidden">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-on-surface-variant,#6b7280)]">
              已授权 Agent
            </span>
            <span className="rounded-md bg-[var(--color-surface-container,#eaf0f6)] px-2 py-0.5 text-xs text-[var(--color-on-surface-variant,#4b5563)]">
              {agents.length}
            </span>
          </div>

          <div className="flex gap-1 overflow-x-auto lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
            {agents.map((root) => {
              const selected = root.id === activeRoot?.id;
              return (
                <button
                  key={root.agentId}
                  type="button"
                  onClick={() => setSelectedAgentId(root.agentId)}
                  aria-current={selected ? 'true' : undefined}
                  title={root.displayPath}
                  className={cn(
                    'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors lg:w-full',
                    selected
                      ? 'bg-[var(--color-secondary-container,#e0e7ff)] font-medium text-[var(--color-on-secondary-container,#312e81)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_25%,transparent)]'
                      : 'text-[var(--color-on-surface-variant,#5c5c5a)] hover:bg-[color-mix(in_srgb,var(--color-surface-container,#eef2f6)_80%,transparent)] hover:text-[var(--color-on-surface,#111827)]',
                  )}
                >
                  <AgentMark agentId={root.agentId} agentName={root.agentName} size={22} />
                  <span className="truncate text-sm font-medium">{root.agentName}</span>
                </button>
              );
            })}
          </div>

          {agents.length === 0 ? (
            <p className="rounded-card bg-surface-container-low p-space-sm text-body-sm text-on-surface-variant">
              还没有已授权的全局 Agent 目录。
            </p>
          ) : null}

          <Link
            to="/settings"
            className="mt-auto flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--color-on-surface-variant,#5c5c5a)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-surface-container,#eef2f6)_80%,transparent)] hover:text-[var(--color-on-surface,#111827)]"
          >
            管理 Agent 目录
            <Icon name="arrow_forward" size={16} />
          </Link>
        </aside>

        <section className="flex min-w-0 flex-col gap-space-md lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {!activeRoot ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
              <Icon name="smart_toy" size={28} className="text-outline" />
              <p className="text-body-md font-medium text-on-surface">还没有可用的全局 Agent</p>
              <p className="max-w-md text-body-sm text-on-surface-variant">
                在设置中授权 Agent 的全局 Skill 目录后，即可在这里向它分发技能。
              </p>
              <Button
                size="sm"
                variant="outline"
                icon="settings"
                onClick={() => navigate('/settings')}
              >
                前往设置
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-space-sm rounded-card bg-surface-container-lowest p-space-md shadow-card lg:sticky lg:top-0 lg:z-10 lg:shrink-0">
                <div className="flex items-start justify-between gap-space-sm">
                  <div className="flex min-w-0 items-center gap-space-sm">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-fixed text-primary shadow-sm">
                      <AgentMark
                        agentId={activeRoot.agentId}
                        agentName={activeRoot.agentName}
                        size={24}
                      />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <h2 className="truncate text-headline-sm font-semibold text-on-surface">
                        {activeRoot.agentName}
                      </h2>
                      <span
                        className="truncate font-mono text-label-code-sm text-on-surface-variant"
                        title={activeRoot.path}
                      >
                        {activeRoot.displayPath}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    icon="folder_open"
                    onClick={() => {
                      void revealPath(activeRoot.path).catch(() =>
                        pushToast({
                          tone: 'warning',
                          title: '无法打开目录',
                          description: '该操作仅在桌面应用内可用',
                        }),
                      );
                    }}
                  >
                    打开目录
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-space-xs">
                  <label className="relative flex h-8 min-w-[160px] flex-1 items-center rounded-control bg-surface-container-low focus-within:ring-1 focus-within:ring-primary/25 sm:max-w-sm">
                    <Icon name="search" size={15} className="ml-space-xs text-outline" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索技能"
                      className="h-full min-w-0 flex-1 bg-transparent px-space-xs text-body-sm text-on-surface outline-none"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="清空搜索"
                        className="mr-space-2xs flex h-5 w-5 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    ) : null}
                  </label>

                  <label className="flex h-8 cursor-pointer select-none items-center gap-space-xs rounded-control px-space-xs text-body-sm text-on-surface-variant transition-colors hover:text-on-surface">
                    <input
                      type="checkbox"
                      checked={onlyUninstalled}
                      onChange={(event) => setOnlyUninstalled(event.target.checked)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <span>仅显示未安装</span>
                  </label>

                  <span className="ml-auto hidden font-mono text-label-code-sm text-on-surface-variant sm:inline">
                  </span>
                </div>
              </div>

              {scanError && !scan ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
                  <Icon name="error" size={26} className="text-error" />
                  <p className="text-body-md font-medium text-on-surface">扫描没有完成</p>
                  <p className="max-w-md text-body-sm text-on-surface-variant">
                    {scanError.message}
                  </p>
                  {scanError.detail ? (
                    <pre className="max-w-lg overflow-x-auto rounded bg-error-container/40 px-2 py-1 font-mono text-[10px] text-on-error-container">
                      {scanError.detail}
                    </pre>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    icon="refresh"
                    onClick={() => void refresh({ announce: true })}
                  >
                    重试扫描
                  </Button>
                </div>
              ) : scanning && !scan ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest text-on-surface-variant shadow-card">
                  <Icon name="progress_activity" size={26} className="animate-spin text-primary" />
                  <p className="text-body-md">正在扫描本地目录</p>
                </div>
              ) : filtered.length === 0 && filteredBundles.length === 0 ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
                  <Icon
                    name={query || onlyUninstalled ? 'search_off' : 'inventory_2'}
                    size={28}
                    className="text-outline"
                  />
                  <p className="text-body-md font-medium text-on-surface">
                    {query || onlyUninstalled
                      ? '没有匹配的技能或组合'
                      : `中央库还没有可分发到 ${activeRoot.agentName} 的内容`}
                  </p>
                  <p className="max-w-md text-body-sm text-on-surface-variant">
                    {query || onlyUninstalled
                      ? '调整搜索或取消「仅显示未安装」再试。'
                      : '新建技能或组合后即可在这里一键安装到该 Agent。'}
                  </p>
                  <div className="mt-1 flex gap-1.5">
                    {query || onlyUninstalled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        icon="filter_alt_off"
                        onClick={() => {
                          setQuery('');
                          setOnlyUninstalled(false);
                        }}
                      >
                        清除筛选
                      </Button>
                    ) : null}
                    <Button
                      variant="soft"
                      size="sm"
                      icon="add"
                      onClick={() => navigate('/skills/new')}
                    >
                      新建技能
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-space-lg">
                  {filteredBundles.length > 0 ? (
                    <section className="flex flex-col gap-space-sm">
                      <h3 className="text-body-md font-semibold text-on-surface">技能组合</h3>
                      <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 2xl:grid-cols-3">
                        {filteredBundles.map((bundle) => (
                          <BundleCard
                            key={bundle.id}
                            bundle={bundle}
                            skills={skills}
                            roots={scan?.roots ?? []}
                            context={{ scope: 'global' }}
                            installTarget={{
                              rootId: activeRoot.id,
                              agentId: activeRoot.agentId,
                              agentName: activeRoot.agentName,
                            }}
                            onOpen={() => navigate('/bundles')}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {filtered.length > 0 ? (
                    <section className="flex flex-col gap-space-sm">
                      <h3 className="text-body-md font-semibold text-on-surface">技能</h3>
                      <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 2xl:grid-cols-3">
                        {filtered.map((skill) => (
                          <SkillCard
                            key={skill.id}
                            skill={skill}
                            context={{ scope: 'global' }}
                            installTarget={{
                              rootId: activeRoot.id,
                              agentId: activeRoot.agentId,
                              agentName: activeRoot.agentName,
                            }}
                            onPreview={(item) => setPreviewSkill(item)}
                            onEdit={(item) => navigate(`/skills/${encodeURIComponent(item.name)}/edit`)}
                            onOpen={(item) => navigate(`/skills/${encodeURIComponent(item.name)}`)}
                            onImport={() => undefined}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <SkillPreviewDialog
        skill={previewSkill}
        context={{ scope: 'global' }}
        onClose={() => setPreviewSkill(null)}
      />
    </div>
  );
}