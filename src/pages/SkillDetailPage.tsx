import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { badgeStateLabel, cn, mountLabel, sourceLabel } from '../lib/format';
import { copyText } from '../lib/platform';
import type { AgentBadge, ScopeKind, SkillPreview } from '../lib/types';
import { useAppStore } from '../store/app-store';
import { AgentMark } from '../components/agents/AgentMark';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

type PreviewTab = 'rendered' | 'source';

function useSkillContext() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const scopeParam = params.get('scope');
  const projectIdParam = params.get('projectId');
  const scope: ScopeKind = scopeParam === 'project' ? 'project' : 'global';
  const projectId = scope === 'project' ? projectIdParam : null;
  return { scope, projectId };
}

export function SkillDetailPage() {
  const { skillName = '' } = useParams();
  const { scope, projectId } = useSkillContext();
  const name = decodeURIComponent(skillName);
  const key = `${name}:${scope}:${projectId ?? ''}`;
  return <SkillDetailInner key={key} name={name} scope={scope} projectId={projectId} />;
}

function SkillDetailInner({
  name,
  scope,
  projectId,
}: {
  name: string;
  scope: ScopeKind;
  projectId: string | null;
}) {
  const navigate = useNavigate();
  const globalScan = useAppStore((state) => state.globalScan);
  const projectScan = useAppStore((state) =>
    projectId ? state.projectScans[projectId] : undefined,
  );
  const refreshGlobal = useAppStore((state) => state.refreshGlobal);
  const refreshProject = useAppStore((state) => state.refreshProject);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const preview = useAppStore((state) => state.preview);
  const pushToast = useAppStore((state) => state.pushToast);
  const install = useAppStore((state) => state.install);
  const uninstall = useAppStore((state) => state.uninstall);

  const scan = scope === 'project' ? projectScan : globalScan;
  const scanning = useAppStore((state) =>
    scope === 'project'
      ? projectId
        ? (state.projectScanning[projectId] ?? false)
        : false
      : state.globalScanning,
  );

  const skill = useMemo(
    () => (scan?.skills ?? []).find((item) => item.name === name) ?? null,
    [scan, name],
  );

  const [data, setData] = useState<SkillPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewTab>('rendered');
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [forcePrompt, setForcePrompt] = useState<AgentBadge | null>(null);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      if (scope === 'project' && projectId) void refreshProject(projectId, { announce: false });
      else void refreshGlobal({ announce: false });
    }
  }, [bootstrap, scan, scanning, scope, projectId, refreshGlobal, refreshProject]);

  useEffect(() => {
    let cancelled = false;
    if (!name) return;
    preview({ skillName: name, scope, projectId })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error: { message?: string }) => {
        if (!cancelled) setPreviewError(error.message ?? '无法读取 SKILL.md');
      });
    return () => {
      cancelled = true;
    };
  }, [name, preview, scope, projectId]);

  async function handleBadge(badge: AgentBadge, installed: boolean) {
    setPendingAgent(badge.agentId);
    try {
      if (installed) {
        await uninstall(
          { skillName: name, agentId: badge.agentId, scope, projectId, force: false },
          badge.agentName,
        );
      } else {
        await install({ skillName: name, agentId: badge.agentId, scope, projectId }, badge.agentName);
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'COPY_MODIFIED') {
        setForcePrompt(badge);
      } else {
        const normalized = error as { message?: string; detail?: string };
        pushToast({
          tone: 'error',
          title: installed ? '卸载未完成' : '安装未完成',
          description: normalized.detail
            ? `${normalized.message ?? String(error)}\n${normalized.detail}`
            : normalized.message ?? String(error),
        });
      }
    } finally {
      setPendingAgent(null);
    }
  }

  const backTo =
    scope === 'project' && projectId ? `/projects/${encodeURIComponent(projectId)}` : '/';
  const backLabel = scope === 'project' ? '项目模块' : '技能库';
  const contextQuery =
    scope === 'project' && projectId
      ? `?scope=project&projectId=${encodeURIComponent(projectId)}`
      : '';

  if (!skill) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-space-lg">
        <Icon
          name={scanning ? 'progress_activity' : 'search_off'}
          size={30}
          className={cn('text-outline', scanning && 'animate-spin text-primary')}
        />
        <p className="text-body-md font-medium text-on-surface">
          {scanning ? '正在加载技能…' : `找不到技能「${name}」`}
        </p>
        <p className="text-body-sm text-on-surface-variant">
          {scanning ? '请稍候' : '它可能已被移除，或当前模块未包含它。'}
        </p>
        <Button size="sm" variant="outline" icon="arrow_back" onClick={() => navigate(backTo)}>
          返回{backLabel}
        </Button>
      </div>
    );
  }

  const frontmatterKeys =
    data?.frontmatter && typeof data.frontmatter === 'object' ? Object.keys(data.frontmatter) : [];
  const installedCount = skill.badges.filter((badge) => badge.state === 'installed').length;

  return (
    <div className="flex flex-col gap-space-md p-space-md">
      <section className="flex flex-col justify-between gap-space-md rounded-card bg-surface-container-lowest p-space-md shadow-card lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <div className="flex flex-wrap items-center gap-space-xs font-mono text-label-code-sm text-on-surface-variant">
            <Link to={backTo} className="flex items-center gap-space-2xs hover:text-primary">
              <Icon name="arrow_back" size={15} />
              {backLabel}
            </Link>
            <span className="text-outline-variant">/</span>
            <span className="rounded-control bg-surface-container-high px-space-xs py-space-2xs text-[10px] font-semibold uppercase tracking-wide text-on-surface">
              {skill.isExternal ? '外部' : sourceLabel(skill.source)}
            </span>
            {scope === 'project' ? (
              <span className="rounded-control bg-tertiary-fixed px-space-xs py-space-2xs text-[10px] font-semibold text-on-tertiary-fixed">
                项目上下文
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-space-md">
            <div className="flex items-center gap-space-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-card bg-primary-fixed text-primary shadow-sm">
                <Icon name="description" size={22} />
              </span>
              <div className="flex min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-space-xs">
                  <h1 className="truncate text-headline-lg tracking-tight text-on-surface">
                    {skill.name}
                  </h1>
                  <span className="rounded-control bg-surface-container px-space-xs py-space-2xs font-mono text-label-code-md text-on-surface-variant">
                    {skill.dirName}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-space-xs">
                  <span className="flex items-center gap-space-2xs rounded-control bg-secondary-container px-space-xs py-space-2xs font-mono text-label-code-sm text-on-secondary-container">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                    {installedCount > 0 ? `已安装 ${installedCount} 处` : '尚未安装'}
                  </span>
                  <span className="truncate font-mono text-label-code-sm text-on-surface-variant">
                    {skill.displayPath}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-space-xs self-start lg:self-center">
          <Button
            size="sm"
            variant="outline"
            icon="content_copy"
            onClick={() => {
              void copyText(skill.path).then(
                () => pushToast({ tone: 'info', title: '路径已复制', description: skill.displayPath }),
                () => pushToast({ tone: 'error', title: '复制失败', description: '剪贴板不可用' }),
              );
            }}
          >
            复制路径
          </Button>
          {!skill.isExternal ? (
            <Button
              size="sm"
              variant="primary"
              icon="edit"
              onClick={() => navigate(`/skills/${encodeURIComponent(skill.name)}/edit${contextQuery}`)}
            >
              编辑技能
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <section className="flex flex-col gap-space-md xl:col-span-7">
          <div className="flex flex-col overflow-hidden rounded-card bg-surface-container-lowest shadow-card">
            <div className="flex items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-xs">
              <div className="flex items-center gap-space-2xs rounded-card bg-surface-container p-space-2xs">
                <button
                  type="button"
                  onClick={() => setTab('rendered')}
                  className={cn(
                    'flex items-center gap-space-2xs rounded-card px-space-md py-space-2xs text-body-md transition-colors',
                    tab === 'rendered'
                      ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <Icon name="visibility" size={16} />
                  预览
                </button>
                <button
                  type="button"
                  onClick={() => setTab('source')}
                  className={cn(
                    'flex items-center gap-space-2xs rounded-card px-space-md py-space-2xs text-body-md transition-colors',
                    tab === 'source'
                      ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <Icon name="code" size={16} />
                  源码
                </button>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface-variant">
                <span className="rounded-control bg-surface-container-highest px-space-xs py-space-2xs font-mono text-label-code-sm">
                  UTF-8
                </span>
                <button
                  type="button"
                  title="复制源码"
                  onClick={() => {
                    if (!data) return;
                    void copyText(tab === 'source' ? data.raw : data.body).then(
                      () => pushToast({ tone: 'info', title: '已复制内容' }),
                      () => pushToast({ tone: 'error', title: '复制失败' }),
                    );
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-control transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <Icon name="content_copy" size={16} />
                </button>
              </div>
            </div>

            <div className="p-space-lg">
              {previewError ? (
                <div className="flex flex-col items-center gap-1 py-10 text-center">
                  <Icon name="error" size={24} className="text-error" />
                  <p className="text-body-md text-on-surface">无法读取 SKILL.md</p>
                  <p className="text-body-sm text-on-surface-variant">{previewError}</p>
                </div>
              ) : !data ? (
                <div className="flex flex-col items-center gap-2 py-10 text-on-surface-variant">
                  <Icon name="progress_activity" size={22} className="animate-spin text-primary" />
                  <p className="text-body-sm">正在读取文件…</p>
                </div>
              ) : tab === 'rendered' ? (
                <div className="flex flex-col gap-space-lg">
                  <div className="flex flex-col gap-space-xs rounded-card bg-surface-container-low p-space-md">
                    <div className="flex flex-wrap items-center justify-between gap-space-xs">
                      <span className="flex items-center gap-space-2xs font-caption-caps uppercase tracking-wider text-on-surface-variant">
                        <Icon name="psychology" size={14} className="text-primary" />
                        触发意图
                      </span>
                      <span className="font-mono text-label-code-sm font-medium text-secondary">
                        {skill.isExternal ? '只读' : '本地'}
                      </span>
                    </div>
                    <p className="text-body-md font-medium text-on-surface">
                      {skill.description || '尚未填写描述。'}
                    </p>
                    <p className="truncate font-mono text-label-code-sm text-outline">
                      {data.displayPath}
                    </p>
                  </div>

                  <article className="md-body text-on-surface">
                    <Markdown remarkPlugins={[remarkGfm]}>{data.body || '_正文为空_'}</Markdown>
                  </article>
                </div>
              ) : (
                <pre className="overflow-x-auto rounded-card bg-inverse-surface p-space-md font-mono text-label-code-sm leading-relaxed text-inverse-on-surface">
                  {data.raw}
                </pre>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-space-sm rounded-card bg-surface-container-lowest p-space-md shadow-card">
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-xs">
                <Icon name="inventory_2" size={18} className="text-tertiary" />
                <h2 className="text-headline-sm text-on-surface">元数据</h2>
              </div>
              <span className="rounded-control bg-secondary-container px-space-xs py-space-2xs font-mono text-label-code-sm font-semibold text-secondary">
                {frontmatterKeys.length} 项字段
              </span>
            </div>
            <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
              <div className="flex flex-col gap-space-2xs rounded-card bg-surface-container-low p-space-sm">
                <span className="font-caption-caps uppercase text-on-surface-variant">来源</span>
                <span className="text-body-md font-semibold text-on-surface">
                  {skill.isExternal ? '外部' : sourceLabel(skill.source)}
                </span>
                <span className="font-mono text-label-code-sm text-on-surface-variant">
                  {skill.dirName}
                </span>
              </div>
              <div className="flex flex-col gap-space-2xs rounded-card bg-surface-container-low p-space-sm">
                <span className="font-caption-caps uppercase text-on-surface-variant">未知字段</span>
                <span className="text-body-md font-semibold text-on-surface">保存时保留</span>
                <span className="font-mono text-label-code-sm text-on-surface-variant">
                  {frontmatterKeys.slice(0, 4).join(' · ') || '无 frontmatter'}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-space-md xl:col-span-5">
          <div className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-md shadow-card">
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-xs">
                <Icon name="hub" size={20} className="text-primary" />
                <h2 className="text-headline-md text-on-surface">分发</h2>
              </div>
              <span className="rounded-control bg-surface-container px-space-xs py-space-2xs font-mono text-label-code-sm text-on-surface-variant">
                {skill.badges.length} 目录
              </span>
            </div>

            <div className="flex flex-col gap-space-sm">
              {skill.badges.length === 0 ? (
                <p className="rounded-card bg-surface-container-low p-space-sm text-body-sm text-on-surface-variant">
                  当前模块没有可分发的 Agent 目录。
                </p>
              ) : (
                skill.badges.map((badge) => {
                  const installed = badge.state === 'installed';
                  return (
                    <div
                      key={badge.rootId}
                      className="flex flex-col gap-space-xs rounded-card bg-surface-container-low p-space-sm transition-all hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-space-sm">
                        <div className="flex min-w-0 items-center gap-space-sm">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-surface-container-lowest text-primary shadow-sm">
                            <AgentMark agentId={badge.agentId} size={20} />
                          </span>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-body-md font-semibold text-on-surface">
                              {badge.agentName}
                            </span>
                          </div>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-control px-space-xs py-space-2xs font-mono text-label-code-sm',
                            installed
                              ? badge.mountType === 'copy'
                                ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                                : 'bg-secondary-container text-on-secondary-container'
                              : 'bg-surface-container text-on-surface-variant',
                          )}
                        >
                          {installed
                            ? `${badge.scope === 'project' ? '项目级' : '全局级'} · ${mountLabel(badge.mountType)}`
                            : badgeStateLabel(badge.state)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-space-2xs rounded-card bg-surface-container-lowest p-space-xs font-mono text-label-code-sm">
                        <div className="flex items-center justify-between gap-space-sm text-on-surface-variant">
                          <span className="shrink-0 text-outline">目标路径</span>
                          <span className="truncate text-on-surface" title={badge.targetPath}>
                            {badge.targetDisplay}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-space-sm">
                          <span className="shrink-0 text-outline">授权</span>
                          <span className="flex items-center gap-space-2xs text-secondary">
                            <Icon name={badge.authorized ? 'check_circle' : 'lock'} size={13} />
                            {badge.authorized
                              ? badge.rootExists
                                ? '可读'
                                : '目录不存在'
                              : '未授权'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-space-2xs flex items-center justify-end gap-space-xs">
                        {installed ? (
                          <button
                            type="button"
                            disabled={pendingAgent === badge.agentId || skill.isExternal}
                            onClick={() => void handleBadge(badge, true)}
                            className="flex h-6 items-center gap-space-2xs rounded-control bg-surface-container-lowest px-space-sm text-body-sm font-medium text-on-surface-variant transition-colors hover:bg-error-container hover:text-error disabled:opacity-50"
                          >
                            <Icon name="link_off" size={14} />
                            卸载
                          </button>
                        ) : badge.state === 'available' && !skill.isExternal ? (
                          <button
                            type="button"
                            disabled={pendingAgent === badge.agentId}
                            onClick={() => void handleBadge(badge, false)}
                            className="flex h-7 items-center gap-space-2xs rounded-card bg-primary-container px-space-sm text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary disabled:opacity-50"
                          >
                            <Icon name="add_link" size={15} />
                            安装
                          </button>
                        ) : (
                          <span className="text-label-code-sm text-outline">
                            {badge.detail ?? (skill.isExternal ? '外部技能需先纳入中央库' : '当前不可操作')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </section>
      </div>

      {forcePrompt ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--color-scrim)] p-4 backdrop-blur-[2px]">
          <div className="dialog-enter w-full max-w-md rounded-card border border-error/30 bg-surface-container-lowest p-4 shadow-dialog">
            <h3 className="text-headline-sm font-semibold text-on-surface">副本已被外部修改</h3>
            <p className="mt-1 text-body-sm leading-5 text-on-surface-variant">
              「{skill.name}」在 {forcePrompt.agentName} 工作区中的副本已与安装时不一致。继续卸载会移除这些外部修改，副本将被移入{' '}
              <span className="font-mono text-[11px]">~/.myskills/trash/</span>。中央库原件不会受到影响。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setForcePrompt(null)}>
                取消
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon="delete_forever"
                onClick={() => {
                  const badge = forcePrompt;
                  setForcePrompt(null);
                  setPendingAgent(badge.agentId);
                  void uninstall(
                    { skillName: skill.name, agentId: badge.agentId, scope, projectId, force: true },
                    badge.agentName,
                  )
                    .catch((error: { message?: string }) =>
                      pushToast({
                        tone: 'error',
                        title: '强制卸载失败',
                        description: error.message ?? String(error),
                      }),
                    )
                    .finally(() => setPendingAgent(null));
                }}
              >
                确认强制卸载
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
