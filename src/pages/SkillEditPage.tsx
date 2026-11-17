import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../lib/bridge';
import { cn } from '../lib/format';
import { useAppStore } from '../store/app-store';
import type { AppState } from '../store/app-store';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Modal } from '../components/ui/Modal';

interface RawSkillMeta {
  name: string;
  description: string;
  version: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
}

function parseSkillRaw(raw: string): RawSkillMeta {
  const clean = raw.replace(/^\ufeff/, '');
  const match = clean.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter: Record<string, unknown> = {};
  let body = clean;
  if (match) {
    body = clean.slice(match[0].length);
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv) {
        const value = kv[2].trim();
        if (value.length > 0) frontmatter[kv[1]] = value;
      }
    }
  }
  return {
    name: (frontmatter.name as string) || '',
    description: (frontmatter.description as string) || '',
    version: (frontmatter.version as string) || null,
    frontmatter,
    body: body.startsWith('\n') ? body.slice(1) : body,
  };
}

function serializeYamlValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    if (/[-:{#[]&*!|>'"@%`,?{}()<>]/.test(value) || value === '') {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(serializeYamlValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${serializeYamlValue(v)}`)
      .join(', ')}}`;
  }
  return String(value);
}

function buildRaw(form: {
  name: string;
  description: string;
  version: string | null;
  extra: Record<string, unknown>;
  body: string;
}): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${serializeYamlValue(form.name)}`);
  if (form.description) lines.push(`description: ${serializeYamlValue(form.description)}`);
  if (form.version) lines.push(`version: ${serializeYamlValue(form.version)}`);
  for (const [key, value] of Object.entries(form.extra)) {
    if (['name', 'description', 'version'].includes(key)) continue;
    lines.push(`${key}: ${serializeYamlValue(value)}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(form.body);
  return lines.join('\n');
}

function useSkillContext() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const scopeParam = params.get('scope');
  const projectIdParam = params.get('projectId');
  const scope = scopeParam === 'project' ? ('project' as const) : ('global' as const);
  const projectId = scope === 'project' ? projectIdParam : null;
  return { scope, projectId };
}

export function SkillEditPage() {
  const { skillName } = useParams<{ skillName: string }>();
  const decodedName = skillName ? decodeURIComponent(skillName) : '';
  const { scope, projectId } = useSkillContext();
  const globalScan = useAppStore((state: AppState) => state.globalScan);
  const projectScan = useAppStore((state: AppState) =>
    projectId ? state.projectScans[projectId] : undefined,
  );
  const pushToast = useAppStore((state: AppState) => state.pushToast);
  const refreshGlobal = useAppStore((state: AppState) => state.refreshGlobal);
  const refreshProject = useAppStore((state: AppState) => state.refreshProject);
  const navigate = useNavigate();

  const scan = scope === 'project' ? projectScan : globalScan;
  const skill = useMemo(
    () => scan?.skills.find((s) => s.name === decodedName),
    [scan, decodedName],
  );

  const [raw, setRaw] = useState('');
  const [initialRaw, setInitialRaw] = useState('');
  const [parsed, setParsed] = useState<RawSkillMeta>({
    name: '',
    description: '',
    version: null,
    frontmatter: {},
    body: '',
  });
  const [formExtra, setFormExtra] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameConfirmOpen, setRenameConfirmOpen] = useState(false);

  const canEdit = Boolean(skill && !skill.isExternal);

  const frontmatterEntries = useMemo(() => {
    return Object.entries(parsed.frontmatter).filter(
      ([k]) => !['name', 'description', 'version'].includes(k),
    );
  }, [parsed]);

  useEffect(() => {
    if (!decodedName) return;
    let cancelled = false;
    // Editing is always against central store content; scope hint helps locate external if ever needed.
    api
      .previewSkill({ skillName: decodedName, scope, projectId })
      .then((preview) => {
        if (cancelled) return;
        setInitialRaw(preview.raw);
        setRaw(preview.raw);
        const meta = parseSkillRaw(preview.raw);
        setParsed(meta);
        setFormExtra(meta.frontmatter);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(err.message ?? '无法读取 SKILL.md');
      });
    return () => {
      cancelled = true;
    };
  }, [decodedName, scope, projectId]);

  const handleRawChange = useCallback((next: string) => {
    setRaw(next);
    const meta = parseSkillRaw(next);
    setParsed(meta);
    setFormExtra(meta.frontmatter);
  }, []);

  const dirty = raw !== initialRaw;
  const backTo = scope === 'project' && projectId ? `/projects/${encodeURIComponent(projectId)}` : '/';
  const contextQuery = scope === 'project' && projectId ? `?scope=project&projectId=${encodeURIComponent(projectId)}` : '';

  const handleSave = useCallback(async () => {
    if (!canEdit || !skill) return;
    const nextRaw = buildRaw({
      name: parsed.name.trim(),
      description: parsed.description.trim(),
      version: parsed.version?.trim() || null,
      extra: formExtra,
      body: parsed.body.trim(),
    });
    setSaving(true);
    setError(null);
    try {
      await api.saveSkill({ skillName: skill.name, raw: nextRaw });
      await refreshGlobal({ announce: false });
      if (scope === 'project' && projectId) await refreshProject(projectId, { announce: false });
      pushToast({ tone: 'success', title: '已保存', description: 'SKILL.md 已写入中央库' });
      navigate(`/skills/${encodeURIComponent(parsed.name)}${contextQuery}`);
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      if (normalized.code === 'NAME_CONFLICT') {
        setRenameConfirmOpen(true);
        return;
      }
      setError(normalized.message ?? '保存失败');
      pushToast({
        tone: 'error',
        title: '保存失败',
        description: normalized.message ?? String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [canEdit, skill, parsed, formExtra, refreshGlobal, refreshProject, scope, projectId, pushToast, navigate, contextQuery]);

  const handleCancel = useCallback(() => {
    setRaw(initialRaw);
    const meta = parseSkillRaw(initialRaw);
    setParsed(meta);
    setFormExtra(meta.frontmatter);
    setError(null);
  }, [initialRaw]);

  const handleRenameConfirm = useCallback(() => {
    setRenameConfirmOpen(false);
    void handleSave();
  }, [handleSave]);

  if (error && !skill) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-2 rounded-card border border-error/25 bg-surface-container-lowest px-6 text-center">
        <Icon name="error" size={26} className="text-error" />
        <p className="text-body-md font-medium text-on-surface">{error}</p>
        <Button variant="outline" size="sm" icon="arrow_back" onClick={() => navigate(backTo)}>
          返回
        </Button>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant">
        <Icon name="progress_activity" size={26} className="animate-spin text-primary" />
        <p className="text-body-md">正在加载技能…</p>
      </div>
    );
  }

  if (skill.isExternal) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-2 rounded-card border border-error-container/25 bg-surface-container-lowest px-6 text-center">
        <Icon name="lock" size={26} className="text-error" />
        <p className="text-body-md font-medium text-on-surface">外部原件只读</p>
        <p className="text-body-sm text-on-surface-variant">
          「{skill.name}」来自 Agent 工作区，需先纳入中央库才能编辑。
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" icon="arrow_back" onClick={() => navigate(backTo)}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  const formValues = {
    name: parsed.name,
    description: parsed.description,
    version: parsed.version,
    extra: formExtra,
    body: parsed.body,
  };

  const frontmatterClosed =
    raw.trimStart().startsWith('---') && raw.trimStart().indexOf('\n---', 4) !== -1;
  const bodyLines = parsed.body.split('\n');
  const hasHeading = bodyLines.some((line) => line.startsWith('## '));
  const diagnostics = [
    {
      label: 'YAML 顶层格式闭合',
      detail: frontmatterClosed ? 'Frontmatter 起始与结束标记完整' : '缺少 --- 闭合标记',
      pass: frontmatterClosed,
    },
    {
      label: '必填项验证 (name/desc)',
      detail:
        parsed.name.trim() && parsed.description.trim() ? '名称与描述均已填写' : '名称或描述为空',
      pass: Boolean(parsed.name.trim()) && Boolean(parsed.description.trim()),
    },
    {
      label: 'Markdown H2 段落完整',
      detail: hasHeading ? '已检测到二级标题段落' : '正文缺少 ## 段落',
      pass: hasHeading,
    },
    {
      label: '未知字段原样保护',
      detail: `${frontmatterEntries.length} 个扩展字段将在保存时保留`,
      pass: true,
    },
  ];
  const allPass = diagnostics.every((item) => item.pass);

  return (
    <div className="flex flex-col gap-space-md p-space-md">
      <header className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex min-w-0 items-center gap-space-md">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label="返回"
            title="返回"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <h1 className="text-headline-md font-semibold text-on-surface">编辑技能</h1>
              <span
                className={cn(
                  'rounded px-space-xs py-space-2xs font-mono text-label-code-sm',
                  skill.source === 'builtin'
                    ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                    : 'bg-surface-container text-on-surface-variant',
                )}
              >
                {skill.source === 'builtin' ? '自建' : '导入'}
              </span>
            </div>
            <span
              className="mt-space-2xs truncate font-mono text-label-code-sm text-on-surface-variant"
              title={skill.displayPath}
            >
              {skill.displayPath}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-xs">
          <Button
            variant="outline"
            size="sm"
            icon="history_toggle_off"
            onClick={handleCancel}
            disabled={!dirty || saving}
          >
            还原变更
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="bolt"
            loading={saving}
            disabled={!canEdit || !dirty || saving}
            onClick={handleSave}
          >
            保存
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-control bg-error-container/50 px-space-md py-space-sm text-body-sm text-on-error-container">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <section className="flex flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] shadow-sm xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-space-xs bg-surface-container-low px-space-md py-space-xs">
            <div className="flex items-center gap-space-xs">
              <Icon name="description" size={16} className="text-on-surface-variant" />
              <span className="font-mono text-label-code-md font-medium text-on-surface">SKILL.md</span>
              <span
                className={cn('h-2 w-2 rounded-full', dirty ? 'bg-error' : 'bg-secondary')}
                title={dirty ? '有未保存的更改' : '已与磁盘一致'}
              />
            </div>
            <div className="flex items-center gap-space-md font-mono text-label-code-sm text-on-surface-variant">
              <span>
                <span className="text-outline">行数: </span>
                <span className="text-on-surface">{raw.split('\n').length}</span>
              </span>
              <span className="h-3 w-px bg-surface-container-highest" />
              <span>
                <span className="text-outline">编码: </span>
                <span className="text-on-surface">UTF-8</span>
              </span>
            </div>
          </div>

          <div className="flex max-h-[720px] min-h-[560px] overflow-hidden bg-surface-container-lowest font-mono">
            <div
              aria-hidden="true"
              className="w-12 shrink-0 select-none overflow-hidden border-r border-outline-variant/20 bg-surface-container-low/50 py-space-md pr-space-xs text-right font-mono text-label-code-sm leading-6 text-outline"
            >
              {raw.split('\n').map((_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
            <textarea
              value={raw}
              onChange={(e) => handleRawChange(e.target.value)}
              className="min-h-[560px] w-full flex-1 resize-none bg-transparent p-space-md font-mono text-label-code-md leading-6 text-on-surface focus:outline-none"
              disabled={!canEdit}
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-space-xs bg-surface-container-low px-space-md py-space-2xs font-mono text-label-code-sm text-on-surface-variant">
            <div className="flex items-center gap-space-md">
              <span
                className={cn(
                  'flex items-center gap-space-2xs font-medium',
                  dirty ? 'text-[var(--color-warning,#d97706)]' : 'text-secondary',
                )}
              >
                <Icon name={dirty ? 'edit' : 'done_all'} size={14} />
                {dirty ? '有未保存的更改' : '已与磁盘一致'}
              </span>
              <span>{new Blob([raw]).size} 字节</span>
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(raw)
                  .then(() => pushToast({ tone: 'info', title: '源码已复制' }));
              }}
              className="flex items-center gap-space-2xs rounded px-space-xs py-0.5 transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <Icon name="content_copy" size={14} />
              复制源码
            </button>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-space-md xl:col-span-5">
          <section className="flex flex-col gap-space-sm rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-space-md shadow-sm">
            <div className="flex items-center justify-between gap-space-xs">
              <div className="flex items-center gap-space-xs">
                <Icon name="fact_check" size={20} className="text-secondary" />
                <h2 className="text-headline-sm text-on-surface">诊断</h2>
              </div>
              <span
                className={cn(
                  'rounded-pill px-space-sm py-0.5 font-mono text-label-code-sm font-semibold',
                  allPass
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-error-container text-on-error-container',
                )}
              >
                {allPass ? '通过' : '待修正'}
              </span>
            </div>
            <div className="mt-space-xs grid grid-cols-1 gap-space-xs sm:grid-cols-2">
              {diagnostics.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-space-xs rounded-card bg-surface-container-low p-space-xs"
                >
                  <Icon
                    name={item.pass ? 'check_circle' : 'cancel'}
                    size={16}
                    className={item.pass ? 'text-secondary' : 'text-error'}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm text-on-surface">{item.label}</span>
                    <span className="truncate font-mono text-[10px] text-on-surface-variant">
                      {item.detail}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-space-sm rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-space-md shadow-sm">
            <div className="flex items-center justify-between gap-space-xs">
              <h2 className="text-headline-sm text-on-surface">元数据</h2>
            </div>
            <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
              <div className="flex flex-col gap-space-2xs">
                <label className="text-body-sm font-medium text-on-surface">名称</label>
                <input
                  value={formValues.name}
                  onChange={(e) => {
                    setParsed((prev) => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="技能名称"
                  className={cn(
                    'h-9 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 font-mono text-sm text-[var(--color-on-surface,#111827)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]',
                    !canEdit && 'bg-[var(--color-surface-container,#eaf0f6)] text-[var(--color-on-surface-variant,#6b7280)]',
                  )}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-col gap-space-2xs">
                <label className="text-body-sm font-medium text-on-surface">版本</label>
                <input
                  value={formValues.version ?? ''}
                  onChange={(e) => setParsed((prev) => ({ ...prev, version: e.target.value || null }))}
                  placeholder="例如 1.2.0"
                  className={cn(
                    'h-9 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 font-mono text-sm text-[var(--color-on-surface,#111827)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]',
                    !canEdit && 'bg-[var(--color-surface-container,#eaf0f6)] text-[var(--color-on-surface-variant,#6b7280)]',
                  )}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-col gap-space-2xs sm:col-span-2">
                <label className="text-body-sm font-medium text-on-surface">描述</label>
                <textarea
                  value={formValues.description}
                  onChange={(e) => setParsed((prev) => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  placeholder="一句话说明用途"
                  className={cn(
                    'min-h-[56px] resize-none rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 py-2 font-mono text-sm text-[var(--color-on-surface,#111827)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]',
                    !canEdit && 'bg-[var(--color-surface-container,#eaf0f6)] text-[var(--color-on-surface-variant,#6b7280)]',
                  )}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-space-sm rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-space-md shadow-sm">
            <div className="flex items-center justify-between gap-space-xs">
              <span className="font-caption-caps uppercase tracking-wider text-outline">扩展字段</span>
              <span className="font-mono text-label-code-sm font-medium text-primary">
                {frontmatterEntries.length} 个字段
              </span>
            </div>
            {frontmatterEntries.length === 0 ? (
              <p className="rounded-card bg-surface-container-low p-space-sm text-body-sm text-on-surface-variant">
                SKILL.md 中没有额外的 frontmatter 字段。
              </p>
            ) : (
              <div className="flex flex-col gap-space-xs">
                {frontmatterEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-space-xs rounded bg-surface-container-lowest p-space-xs font-mono text-label-code-sm"
                  >
                    <span className="flex min-w-0 items-center gap-space-xs">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                      <span className="truncate font-semibold text-primary">{key}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-space-xs">
                      <span className="truncate text-on-surface-variant">{serializeYamlValue(value)}</span>
                      <span className="shrink-0 rounded bg-secondary-container px-space-xs text-[10px] text-on-secondary-container">
                        保留
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] shadow-sm">
            <div className="flex items-center justify-between gap-space-xs bg-surface-container-low px-space-md py-space-xs">
              <h2 className="text-headline-sm text-on-surface">预览</h2>
              <span className="font-mono text-label-code-sm text-on-surface-variant">实时</span>
            </div>
            <div className="md-body max-h-[420px] min-h-[200px] overflow-y-auto p-space-md">
              <Markdown remarkPlugins={[remarkGfm]}>{parsed.body || '_正文为空_'}</Markdown>
            </div>
          </section>
        </div>
      </div>

      <Modal open={renameConfirmOpen} onOpenChange={setRenameConfirmOpen} title="名称冲突" size="sm">
        <div className="p-space-lg">
          <p className="text-body-sm text-on-surface-variant">
            「{parsed.name}」已被其他技能使用，继续将覆盖它。
          </p>
        </div>
        <div className="flex items-center justify-end gap-space-sm border-t border-outline-variant/30 bg-surface-container-low/40 px-space-lg py-space-sm">
          <Button variant="outline" size="sm" onClick={() => setRenameConfirmOpen(false)}>
            取消
          </Button>
          <Button variant="danger" size="sm" icon="save" onClick={handleRenameConfirm}>
            强制保存
          </Button>
        </div>
      </Modal>
    </div>
  );
}
