import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BundleCard } from '../components/bundles/BundleCard';
import { SkillCard } from '../components/home/SkillCard';
import { SkillPreviewDialog } from '../components/home/SkillPreviewDialog';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { api, isDemoMode } from '../lib/bridge';
import { cn } from '../lib/format';
import { pickDirectory, revealPath } from '../lib/platform';
import type { Bundle, Project, SkillView } from '../lib/types';
import { useAppStore } from '../store/app-store';

export function ProjectsPage() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const projectScans = useAppStore((state) => state.projectScans);
  const projectScanning = useAppStore((state) => state.projectScanning);
  const projectScanErrors = useAppStore((state) => state.projectScanErrors);
  const refreshProject = useAppStore((state) => state.refreshProject);
  const addProject = useAppStore((state) => state.addProject);
  const removeProject = useAppStore((state) => state.removeProject);
  const pushToast = useAppStore((state) => state.pushToast);
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams();

  const projects = bootstrap?.settings.projects ?? [];
  const roots = bootstrap?.roots ?? [];

  const routeId = routeProjectId ? decodeURIComponent(routeProjectId) : null;
  const [query, setQuery] = useState('');
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [previewSkill, setPreviewSkill] = useState<SkillView | null>(null);

  const activeProject = projects.find((p) => p.id === routeId) ?? projects[0] ?? null;
  const activeId = activeProject?.id ?? '';
  const scan = activeId ? projectScans[activeId] : undefined;
  const scanning = activeId ? projectScanning[activeId] ?? false : false;
  const scanError = activeId ? projectScanErrors[activeId] ?? null : null;

  useEffect(() => {
    if (bootstrap && activeProject && !scan && !scanning) {
      void refreshProject(activeProject.id, { announce: false });
    }
  }, [bootstrap, activeProject, scan, scanning, refreshProject]);

  useEffect(() => {
    if (!bootstrap) return;
    void api
      .listBundles()
      .then((outcome) => setBundles(outcome.bundles))
      .catch(() => setBundles([]));
  }, [bootstrap, scan]);

  function rootCount(projectId: string) {
    return roots.filter((root) => root.projectId === projectId && root.exists).length;
  }

  async function addProjectFromDirectory() {
    if (adding) return;
    if (isDemoMode()) {
      pushToast({ tone: 'info', title: '演示模式无法选择目录', description: '请在桌面应用中使用「添加项目」' });
      return;
    }
    const path = await pickDirectory('选择项目根目录');
    if (!path) return;

    setAdding(true);
    try {
      const project = await addProject(undefined, path);
      navigate(`/projects/${encodeURIComponent(project.id)}`, { replace: true });
    } catch (error) {
      pushToast({ tone: 'error', title: '添加项目失败', description: (error as { message?: string }).message ?? String(error) });
    } finally {
      setAdding(false);
    }
  }

  async function removeProjectEntry(project: Project) {
    if (removingId) return;
    const confirmed = window.confirm(`确定删除项目「${project.name}」的登记吗？\n不会删除磁盘上的任何文件。`);
    if (!confirmed) return;

    setRemovingId(project.id);
    try {
      await removeProject(project.id);
      if (routeId === project.id) navigate('/projects', { replace: true });
    } catch (error) {
      pushToast({ tone: 'error', title: '删除项目失败', description: (error as { message?: string }).message ?? String(error) });
    } finally {
      setRemovingId(null);
    }
  }

  const skills = useMemo(() => (scan?.skills ?? []).filter((skill) => !skill.isExternal), [scan]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.dirName, skill.description].join(' ').toLowerCase().includes(needle),
    );
  }, [skills, query]);

  const filteredBundles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bundles;
    return bundles.filter((bundle) =>
      [bundle.name, bundle.slug, bundle.description].join(' ').toLowerCase().includes(needle),
    );
  }, [bundles, query]);

  const context = { scope: 'project' as const, projectId: activeId };

  return (
    <div className="flex flex-col gap-space-md p-space-md lg:h-full lg:min-h-0">
      <div className="flex min-w-0 flex-col gap-space-md lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        <aside className="flex flex-col gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-3 lg:min-h-0 lg:w-[280px] lg:shrink-0 lg:overflow-hidden">
          <div className="flex items-center px-1 pb-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-on-surface-variant,#6b7280)]">项目列表</span>
          </div>

          <div className="flex gap-space-xs overflow-x-auto lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
            {projects.map((project) => {
              const selected = project.id === activeProject?.id;
              const count = rootCount(project.id);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    navigate(`/projects/${encodeURIComponent(project.id)}`, { replace: true });
                  }}
                  aria-current={selected ? 'true' : undefined}
                  title={project.path}
                  className={cn(
                    'flex min-w-[220px] shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors lg:w-full',
                    selected
                      ? 'bg-[var(--color-secondary-container,#e0e7ff)] font-medium text-[var(--color-on-secondary-container,#312e81)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_25%,transparent)]'
                      : 'text-[var(--color-on-surface-variant,#5c5c5a)] hover:bg-[color-mix(in_srgb,var(--color-surface-container,#eef2f6)_80%,transparent)] hover:text-[var(--color-on-surface,#111827)]',
                  )}
                >
                  <Icon name="folder" size={20} className={selected ? 'text-[var(--color-on-secondary-container,#312e81)]' : 'opacity-80'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{project.name}</span>
                    <span className={cn('block truncate text-xs', selected ? 'text-[var(--color-on-secondary-container,#312e81)]/80' : 'text-[var(--color-on-surface-variant,#6b7280)]')}>
                      {count > 0 ? `${count} 个 Agent 目录` : '无 Agent 目录'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {projects.length === 0 ? (
            <p className="rounded-card bg-surface-container-low p-space-sm text-body-sm text-on-surface-variant">
              还没有登记任何项目。
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void addProjectFromDirectory()}
            disabled={adding}
            className="mt-auto flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--color-on-surface-variant,#5c5c5a)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-surface-container,#eef2f6)_80%,transparent)] hover:text-[var(--color-on-surface,#111827)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>添加项目</span>
            {adding ? (
              <Icon name="progress_activity" size={16} className="animate-spin" />
            ) : (
              <Icon name="add" size={16} />
            )}
          </button>
        </aside>

        <section className="flex min-w-0 flex-col gap-space-md lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {!activeProject ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
              <Icon name="create_new_folder" size={28} className="text-outline" />
              <p className="text-body-md font-medium text-on-surface">还没有登记任何项目</p>
              <p className="max-w-md text-body-sm text-on-surface-variant">点击左侧「添加项目」选择工程目录，在右侧管理该项目的技能与组合。</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-space-sm rounded-card bg-surface-container-lowest p-space-md shadow-card lg:sticky lg:top-0 lg:z-10 lg:shrink-0">
                <div className="flex items-start justify-between gap-space-sm">
                  <div className="flex min-w-0 flex-col">
                    <h2 className="truncate text-headline-sm font-semibold text-on-surface">{activeProject.name}</h2>
                    <span className="truncate font-mono text-label-code-sm text-on-surface-variant" title={activeProject.path}>
                      {activeProject.path}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-space-xs">
                    <Button
                      size="sm"
                      variant="outline"
                      icon="folder_open"
                      onClick={() => {
                        void revealPath(activeProject.path).catch(() =>
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
                    <Button
                      size="sm"
                      variant="outline"
                      icon="delete_outline"
                      loading={removingId === activeProject.id}
                      disabled={removingId !== null}
                      onClick={() => void removeProjectEntry(activeProject)}
                    >
                      删除
                    </Button>
                    <Button variant="outline" size="sm" icon="refresh" loading={scanning} onClick={() => void refreshProject(activeId, { announce: true })} title="重新扫描">
                      刷新
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-space-xs">
                  <label className="relative flex h-8 min-w-[160px] flex-1 items-center rounded-control bg-surface-container-low focus-within:ring-1 focus-within:ring-primary/25 sm:max-w-sm">
                    <Icon name="search" size={15} className="ml-space-xs text-outline" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技能或组合" className="h-full min-w-0 flex-1 bg-transparent px-space-xs text-body-sm text-on-surface outline-none" />
                    {query ? <button type="button" onClick={() => setQuery('')} aria-label="清空搜索" className="mr-space-2xs flex h-5 w-5 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container"><Icon name="close" size={13} /></button> : null}
                  </label>
                </div>
              </div>

              {scanError && !scan ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
                  <Icon name="error" size={26} className="text-error" />
                  <p className="text-body-md font-medium text-on-surface">扫描没有完成</p>
                  <p className="max-w-md text-body-sm text-on-surface-variant">{scanError.message}</p>
                  {scanError.detail ? <pre className="max-w-lg overflow-x-auto rounded bg-error-container/40 px-2 py-1 font-mono text-[10px] text-on-error-container">{scanError.detail}</pre> : null}
                  <Button variant="outline" size="sm" icon="refresh" onClick={() => void refreshProject(activeId, { announce: true })}>重试扫描</Button>
                </div>
              ) : scanning && !scan ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest text-on-surface-variant shadow-card">
                  <Icon name="progress_activity" size={26} className="animate-spin text-primary" />
                  <p className="text-body-md">正在扫描项目目录</p>
                </div>
              ) : filtered.length === 0 && filteredBundles.length === 0 ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
                  <Icon name={query ? 'search_off' : 'inventory_2'} size={28} className="text-outline" />
                  <p className="text-body-md font-medium text-on-surface">{query ? '没有匹配的技能或组合' : '当前项目暂无可用内容'}</p>
                  <p className="max-w-md text-body-sm text-on-surface-variant">可从中央库分发技能或组合到该项目的 Agent 目录。</p>
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
                            skills={scan?.skills ?? []}
                            roots={scan?.roots ?? []}
                            context={context}
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
                            context={context}
                            onPreview={(item) => setPreviewSkill(item)}
                            onEdit={(item) => navigate(`/skills/${encodeURIComponent(item.name)}/edit?scope=project&projectId=${encodeURIComponent(activeId)}`)}
                            onOpen={(item) => navigate(`/skills/${encodeURIComponent(item.name)}?scope=project&projectId=${encodeURIComponent(activeId)}`)}
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

      <SkillPreviewDialog skill={previewSkill} context={context} onClose={() => setPreviewSkill(null)} />
    </div>
  );
}
