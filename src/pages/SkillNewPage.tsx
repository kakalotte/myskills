import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/bridge';
import { cn } from '../lib/format';
import { useAppStore } from '../store/app-store';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Modal } from '../components/ui/Modal';

type EditorMode = 'form' | 'source';
type PreviewTab = 'rendered' | 'raw';

interface Section {
  id: string;
  title: string;
  content: string;
  hint: string;
  kind: 'text' | 'few-shot';
}

interface SectionTemplate {
  title: string;
  hint: string;
  kind?: 'few-shot';
}

interface FewShot {
  input: string;
  output: string;
}

interface ParsedSource {
  hasFrontmatter: boolean;
  name: string;
  description: string;
  tools: string[];
  title: string;
  sections: Section[];
  fewShots: FewShot[];
  extra: string[];
}

const SKILL_NAME_MIN = 2;
const SKILL_NAME_MAX = 40;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function skillNameIssue(value: string, conflict: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '请输入 Skill 名称';
  const length = Array.from(trimmed).length;
  if (length < SKILL_NAME_MIN || length > SKILL_NAME_MAX) {
    return `Skill 名称需为 ${SKILL_NAME_MIN}–${SKILL_NAME_MAX} 个字符`;
  }
  if (!SKILL_NAME_PATTERN.test(trimmed)) {
    return '仅支持小写字母、数字和连字符，不能以连字符开头或结尾';
  }
  if (conflict) return `中央库中已存在「${trimmed}」`;
  return null;
}

const TOOL_OPTIONS = [
  { id: 'read', label: '文件读写 (Read)', desc: '读取本地文件' },
  { id: 'websearch', label: '联网检索 (WebSearch)', desc: '查询网络信息' },
  { id: 'bash', label: '终端执行 (Bash)', desc: '运行终端命令' },
];

const FEW_SHOT_HEADING = '示范问答（Examples）';

const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    title: '概述（Overview）',
    hint: '描述这个 Skill 是什么，主要解决什么问题。',
  },
  {
    title: '触发条件（When to Use）',
    hint: '说明什么情况下应该使用、什么情况下不应该使用，以及适用范围。',
  },
  {
    title: '任务目标（Goals）',
    hint: '明确需要完成的任务和最终目标。',
  },
  {
    title: '输入要求（Inputs）',
    hint: '列出必须输入、可选输入、输入格式，以及缺失信息时的处理方式。',
  },
  {
    title: '工作流程（Workflow）',
    hint: '按步骤描述分析、执行、验证与交付流程。',
  },
  {
    title: '执行规则（Rules）',
    hint: '列出必须遵守的规则、禁止操作、特殊约束与优先级。',
  },
  {
    title: '输出规范（Output Format）',
    hint: '规定输出格式、字段、命名和结构。',
  },
  {
    title: '异常处理（Error Handling）',
    hint: '说明输入不完整、执行失败、无法确定时的处理方式，以及是否需要人工确认。',
  },
  {
    title: '参考资料（References）',
    hint: '列出需要进一步读取的参考文档。',
  },
  {
    title: FEW_SHOT_HEADING,
    hint: 'Few-Shot 引导：用「示例 1 / 用户输入 / 期望输出」补充引导示例。',
    kind: 'few-shot',
  },
];

const SECTION_HINTS: Record<string, string> = Object.fromEntries(
  SECTION_TEMPLATES.map((template) => [template.title, template.hint]),
);

function createSection(title: string, index: number, kind: Section['kind'] = 'text'): Section {
  return { id: `s${index}`, title, content: '', hint: SECTION_HINTS[title] ?? '', kind };
}

function createDefaultSections(): Section[] {
  return [
    createSection('触发条件（When to Use）', 1),
    createSection('工作流程（Workflow）', 2),
    createSection('输出规范（Output Format）', 3),
  ];
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-new-skill'
  );
}

function yamlScalar(value: string): string {
  if (value === '') return '""';
  if (/[:#{}[\],&*!|>'"%@`?]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function parseInlineList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner) return [];
  return inner
    .split(',')
    .map((item) =>
      item
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim(),
    )
    .filter(Boolean);
}

/** Parse an arbitrary SKILL.md document so advanced-source edits can flow back into the form. */
function parseSource(raw: string): ParsedSource {
  const clean = raw.replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
  const result: ParsedSource = {
    hasFrontmatter: false,
    name: '',
    description: '',
    tools: [],
    title: '',
    sections: [],
    fewShots: [],
    extra: [],
  };

  const match = clean.match(/^---\n([\s\S]*?)\n---\n?/);
  let body = clean;
  if (match) {
    result.hasFrontmatter = true;
    body = clean.slice(match[0].length);
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1];
      const value = kv[2].trim();
      if (key === 'name') result.name = value.replace(/^["']|["']$/g, '');
      else if (key === 'description') result.description = value.replace(/^["']|["']$/g, '');
      else if (key === 'allowed-tools') result.tools = parseInlineList(value);
      else if (value.length > 0) result.extra.push(line.trim());
    }
  }

  let section: Section | null = null;
  let group: 'body' | 'few-shot' = 'body';
  let shot: FewShot | null = null;
  let sectionIndex = 0;

  const flushSection = () => {
    if (section) result.sections.push(section);
    section = null;
  };
  const flushShot = () => {
    if (shot) result.fewShots.push(shot);
    shot = null;
  };

  for (const line of body.split('\n')) {
    const heading1 = line.match(/^#\s+(.*)$/);
    if (heading1) {
      result.title = heading1[1].trim();
      continue;
    }
    const heading2 = line.match(/^##\s+(.*)$/);
    if (heading2) {
      flushSection();
      flushShot();
      const heading = heading2[1].trim();
      if (heading === FEW_SHOT_HEADING || heading === `${FEW_SHOT_HEADING}对`) {
        group = 'few-shot';
      } else {
        group = 'body';
        sectionIndex += 1;
        section = createSection(heading, sectionIndex);
      }
      continue;
    }
    if (group === 'few-shot') {
      if (/^###\s+/.test(line)) {
        flushShot();
        shot = { input: '', output: '' };
        continue;
      }
      const pair = line.match(/^\*\*(用户输入|期望输出)\*\*[：:]\s*(.*)$/);
      if (pair) {
        if (!shot) shot = { input: '', output: '' };
        if (pair[1] === '用户输入') shot.input = pair[2].trim();
        else shot.output = pair[2].trim();
      }
      continue;
    }
    if (section) {
      section.content += (section.content ? '\n' : '') + line;
    }
  }
  flushSection();
  flushShot();

  result.sections = result.sections
    .map((item) => ({ ...item, content: item.content.trim() }))
    .filter((item) => item.title.length > 0);
  result.fewShots = result.fewShots.filter(
    (item) => item.input.trim().length > 0 || item.output.trim().length > 0,
  );
  return result;
}

export function SkillNewPage() {
  const navigate = useNavigate();
  const scan = useAppStore((state) => state.globalScan);
  const skills = useMemo(() => scan?.skills ?? [], [scan]);
  const pushToast = useAppStore((state) => state.pushToast);
  const refresh = useAppStore((state) => state.refreshGlobal);

  const [mode, setMode] = useState<EditorMode>('form');
  const [name, setName] = useState('');
  const [extraFrontmatter, setExtraFrontmatter] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<Section[]>(createDefaultSections);
  const [fewShots, setFewShots] = useState<FewShot[]>([{ input: '', output: '' }]);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('rendered');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement>(null);

  const slug = name.trim();

  const buildRaw = useCallback((): string => {
    const lines: string[] = [
      '---',
      `name: ${slug}`,
      `description: ${yamlScalar(description.trim())}`,
    ];
    if (allowedTools.length) {
      lines.push(`allowed-tools: [${allowedTools.map((t) => yamlScalar(t)).join(', ')}]`);
    }
    for (const extraLine of extraFrontmatter) {
      const key = extraLine.split(':')[0]?.trim();
      const known = ['name', 'description', 'allowed-tools'];
      if (!key || known.includes(key)) continue;
      lines.push(extraLine);
    }
    lines.push('---', '');
    lines.push(`# ${name.trim() || '未命名技能'}`, '');
    const fewShotSection = sections.find((section) => section.kind === 'few-shot');
    for (const section of sections) {
      if (section.kind === 'few-shot') continue;
      lines.push(`## ${section.title.trim() || '未命名段落'}`, '');
      if (section.content.trim()) lines.push(section.content.trim(), '');
    }
    const shots = fewShots.filter((shot) => shot.input.trim() || shot.output.trim());
    if (fewShotSection && shots.length) {
      lines.push(`## ${fewShotSection.title.trim() || FEW_SHOT_HEADING}`, '');
      shots.forEach((shot, index) => {
        lines.push(`### 示例 ${index + 1}`, '');
        lines.push(`**用户输入**：${shot.input.trim()}`, '');
        lines.push(`**期望输出**：${shot.output.trim()}`, '');
      });
    }
    return `${lines.join('\n').trimEnd()}\n`;
  }, [allowedTools, description, extraFrontmatter, fewShots, name, sections, slug]);

  const sourceMeta = useMemo(() => parseSource(source), [source]);

  const hasFewShotSection = sections.some((section) => section.kind === 'few-shot');
  const filledShots = fewShots.filter((shot) => shot.input.trim() || shot.output.trim());
  const fewShotHeading =
    sections.find((section) => section.kind === 'few-shot')?.title.trim() || FEW_SHOT_HEADING;

  const effectiveName = mode === 'source' ? sourceMeta.name : name;
  const effectiveSections = mode === 'source' ? sourceMeta.sections : sections;
  const effectiveFewShots =
    mode === 'source' ? sourceMeta.fewShots : hasFewShotSection ? filledShots : [];
  const effectiveTools = mode === 'source' ? sourceMeta.tools : allowedTools;
  const effectiveSlug = mode === 'source' ? sourceMeta.name || slugify(effectiveName) : slug;

  const raw = mode === 'source' ? source : buildRaw();

  const conflict = useMemo(
    () =>
      Boolean(effectiveSlug) &&
      skills.some((skill) => !skill.isExternal && skill.name === effectiveSlug),
    [effectiveSlug, skills],
  );

  const nameIssue = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    return skillNameIssue(trimmed, conflict);
  }, [conflict, name]);

  const descriptionLength = Array.from(description).length;
  const descriptionIssue = descriptionLength > 200 ? '一句话说明不能超过 200 个字符' : null;

  const configuredCount =
    allowedTools.length + (hasFewShotSection ? filledShots.length : 0);

  const applySource = useCallback(
    (text: string) => {
      const parsed = parseSource(text);
      setExtraFrontmatter(parsed.extra);
      if (parsed.name) {
        setName(parsed.name);
      } else if (parsed.title) {
        setName(parsed.title);
      }
      if (parsed.description) setDescription(parsed.description);
      if (parsed.sections.length) {
        setSections(parsed.sections.map((item, index) => ({ ...item, id: `s${index + 1}` })));
      }
      if (parsed.fewShots.length) {
        setFewShots(parsed.fewShots);
        setSections((prev) =>
          prev.some((section) => section.kind === 'few-shot')
            ? prev
            : [...prev, createSection(FEW_SHOT_HEADING, Date.now(), 'few-shot')],
        );
      }
      if (parsed.tools.length) setAllowedTools(parsed.tools);
    },
    [],
  );

  const switchMode = useCallback(
    (next: EditorMode) => {
      if (next === mode) return;
      if (next === 'source') {
        setSource(buildRaw());
      } else {
        applySource(source);
      }
      setError(null);
      setMode(next);
    },
    [applySource, buildRaw, mode, source],
  );

  const handleToggleTool = useCallback((tool: string) => {
    setAllowedTools((prev) =>
      prev.includes(tool) ? prev.filter((item) => item !== tool) : [...prev, tool],
    );
  }, []);

  const handleAddSection = useCallback((title: string) => {
    const template = SECTION_TEMPLATES.find((item) => item.title === title);
    setSections((prev) => [...prev, createSection(title, Date.now(), template?.kind ?? 'text')]);
    setSectionMenuOpen(false);
  }, []);

  const handleRemoveSection = useCallback(
    (id: string) => {
      if (sections.length <= 1) return;
      setSections((prev) => prev.filter((section) => section.id !== id));
    },
    [sections.length],
  );

  const handleSave = useCallback(async () => {
    if (saving) return;
    const sourceMode = mode === 'source';
    const rawText = sourceMode ? source.replace(/\r\n/g, '\n') : buildRaw();
    const meta = sourceMode ? parseSource(source) : null;
    const finalDescription = (meta ? meta.description : description).trim();
    const finalTitle = (meta ? meta.title || meta.name : name).trim();
    const finalSlug = (meta ? meta.name : slug).trim();
    const finalSections = meta ? meta.sections : sections;

    const nameProblem = skillNameIssue(
      finalSlug,
      skills.some((skill) => !skill.isExternal && skill.name === finalSlug),
    );
    if (nameProblem) {
      setError(nameProblem);
      return;
    }
    if (!finalDescription) {
      setError('请输入一句话说明');
      return;
    }
    if (Array.from(finalDescription).length > 200) {
      setError('一句话说明不能超过 200 个字符');
      return;
    }
    const hasBody =
      finalSections.some((section) => section.content.trim().length > 0) ||
      (meta ? meta.fewShots.length > 0 : hasFewShotSection && filledShots.length > 0);
    if (!hasBody) {
      setError('请至少填写一段正文内容');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const outcome = await api.createSkill({ name: finalTitle, raw: rawText });
      await refresh({ announce: false });
      pushToast({
        tone: 'success',
        title: '技能已创建',
        description: outcome.displayPath,
      });
      navigate(`/skills/${encodeURIComponent(outcome.skillName)}/edit`);
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      if (normalized.code === 'NAME_CONFLICT') {
        setError(normalized.message ?? '名称冲突，已阻止创建');
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
  }, [
    buildRaw,
    description,
    filledShots,
    hasFewShotSection,
    mode,
    name,
    navigate,
    pushToast,
    refresh,
    saving,
    sections,
    skills,
    slug,
    source,
  ]);

  useEffect(() => {
    if (!sectionMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(event.target as Node)) {
        setSectionMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSectionMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sectionMenuOpen]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(raw)
      .then(() => pushToast({ tone: 'info', title: '源码已复制' }));
  }, [pushToast, raw]);

  const handleReset = useCallback(() => {
    setResetOpen(false);
    setMode('form');
    setName('');
    setExtraFrontmatter([]);
    setDescription('');
    setSections(createDefaultSections());
    setFewShots([{ input: '', output: '' }]);
    setAllowedTools([]);
    setSource('');
    setPreviewTab('rendered');
    setError(null);
    setCollapsed(false);
    setSectionMenuOpen(false);
  }, []);

  const displayName = mode === 'source' ? sourceMeta.title || sourceMeta.name : name;
  const displayDescription = mode === 'source' ? sourceMeta.description : description;
  const displaySections = effectiveSections.filter((section) => section.kind !== 'few-shot');
  const displayFewShots = effectiveFewShots;

  return (
    <div className="flex flex-col gap-space-md p-space-md">
      <header className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex min-w-0 items-center gap-space-md">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="返回技能库"
            title="返回技能库"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <h1 className="text-headline-md font-semibold text-on-surface">新建技能</h1>
              <span className="rounded-control bg-primary-fixed px-space-xs py-space-2xs font-mono text-label-code-sm font-medium text-primary">
                {mode === 'form' ? '表单' : '源码'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center rounded-card bg-surface-container-high p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => switchMode('form')}
              className={cn(
                'flex items-center gap-space-2xs rounded-control px-space-sm py-1 text-body-sm transition-all',
                mode === 'form'
                  ? 'bg-surface-container-lowest font-medium text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon
                name={mode === 'form' ? 'radio_button_checked' : 'radio_button_unchecked'}
                size={14}
              />
              <span>表单</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('source')}
              className={cn(
                'flex items-center gap-space-2xs rounded-control px-space-sm py-1 text-body-sm transition-all',
                mode === 'source'
                  ? 'bg-surface-container-lowest font-medium text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon
                name={mode === 'source' ? 'radio_button_checked' : 'radio_button_unchecked'}
                size={14}
              />
              <span>源码</span>
            </button>
          </div>
          <span className="h-4 w-px bg-outline-variant/50" />
          <Button variant="outline" size="sm" icon="restart_alt" onClick={() => setResetOpen(true)}>
            重置
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="cloud_sync"
            loading={saving}
            onClick={handleSave}
          >
            保存
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-control bg-error-container/50 px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-space-lg pb-space-2xl lg:grid-cols-12">
        {/* 左栏：表单 / 源码编辑器 */}
        <div className="flex flex-col gap-space-lg lg:col-span-7">
          {mode === 'form' ? (
            <>
              <section className="flex flex-col gap-space-lg rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-space-lg shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-space-xs pb-space-xs">
                  <div className="flex items-center gap-space-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary-container" />
                    <h2 className="text-headline-sm font-semibold text-on-surface">基础核心信息</h2>
                    <span className="rounded bg-error-container/40 px-space-xs py-0.5 font-mono text-label-code-sm text-error">
                      3 项必填
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-space-xs">
                  <label className="flex items-center gap-space-2xs font-body-md font-semibold text-on-surface">
                    name
                    <span className="text-error">*</span>
                  </label>
                  <input
                    value={name}
                    spellCheck={false}
                    autoCapitalize="none"
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：weekly-menu"
                    aria-invalid={Boolean(nameIssue)}
                    className={cn(
                      'w-full rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 py-2 font-mono text-sm text-[var(--color-on-surface,#111827)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]',
                      nameIssue && 'border-[var(--color-error,#dc2626)] ring-2 ring-[color-mix(in_srgb,var(--color-error,#dc2626)_20%,transparent)]',
                    )}
                  />
                  <span
                    className={cn(
                      'font-mono text-label-code-sm',
                      nameIssue ? 'text-error' : 'text-on-surface-variant',
                    )}
                  >
                    {nameIssue ?? '2–40 个字符，仅小写字母、数字和连字符'}
                  </span>
                  {extraFrontmatter.length ? (
                    <span className="font-mono text-label-code-sm text-on-surface-variant">
                      已保留 {extraFrontmatter.length} 个自定义字段
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-space-xs">
                  <div className="flex flex-wrap items-center justify-between gap-space-xs">
                    <label className="flex items-center gap-space-2xs font-body-md font-semibold text-on-surface">
                      description
                      <span className="text-error">*</span>
                    </label>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="技能功能及触发条件"
                    aria-invalid={Boolean(descriptionIssue)}
                    className={cn(
                      'w-full resize-none rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-sm text-[var(--color-on-surface,#111827)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]',
                      descriptionIssue && 'border-[var(--color-error,#dc2626)] ring-2 ring-[color-mix(in_srgb,var(--color-error,#dc2626)_20%,transparent)]',
                    )}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span
                      className={cn(
                        'flex items-center gap-space-xs font-mono text-label-code-sm font-medium',
                        descriptionIssue ? 'text-error' : 'text-secondary',
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          descriptionIssue ? 'bg-error' : 'bg-secondary',
                        )}
                      />
                      {descriptionIssue ?? `字数 ${descriptionLength}/200`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-space-sm">
                  <div className="flex flex-wrap items-center justify-between gap-space-xs">
                    <label className="flex items-center gap-space-2xs font-body-md font-semibold text-on-surface">
                      正文内容
                      <span className="text-error">*</span>
                    </label>
                  </div>
                  {sections.map((section) => (
                    <div
                      key={section.id}
                      className="flex flex-col gap-space-xs rounded-card bg-surface-container-low p-space-md transition-all hover:bg-surface-container"
                    >
                      <div className="flex items-center justify-between gap-space-sm">
                        <div className="flex min-w-0 flex-1 items-center gap-space-xs">
                          <span className="shrink-0 font-mono text-[13px] font-bold text-primary">
                            ##
                          </span>
                          {section.kind === 'few-shot' ? (
                            <>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-on-surface">
                                {section.title}
                              </span>
                              <span className="shrink-0 rounded bg-primary-fixed px-1.5 py-px font-mono text-[10px] font-medium text-primary">
                                Few-Shot
                              </span>
                            </>
                          ) : (
                            <input
                              value={section.title}
                              onChange={(e) =>
                                setSections((prev) =>
                                  prev.map((item) =>
                                    item.id === section.id
                                      ? { ...item, title: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="段落标题"
                              className="min-w-0 flex-1 border-b border-transparent bg-transparent text-[13px] font-semibold text-on-surface focus:border-primary/40 focus:outline-none"
                            />
                          )}
                        </div>
                        {sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(section.id)}
                            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-error hover:bg-error-container/20"
                          >
                            <Icon name="delete" size={12} /> 移除
                          </button>
                        )}
                      </div>
                      {section.kind === 'few-shot' ? (
                        <div className="flex flex-col gap-space-xs">
                          <div className="flex flex-wrap items-center justify-between gap-space-xs">
                            <span className="flex items-center gap-space-2xs font-caption-caps text-[10px] uppercase text-on-surface-variant">
                              <Icon name="quiz" size={14} className="text-primary" />
                              Few-Shot 引导 · 已填写 {filledShots.length}/{fewShots.length}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setFewShots((prev) => [...prev, { input: '', output: '' }])
                              }
                              className="flex items-center gap-1 rounded-control px-1.5 py-0.5 font-label-code-sm text-label-code-sm text-primary hover:bg-primary-fixed"
                            >
                              <Icon name="add" size={14} /> 添加示例
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-space-sm md:grid-cols-2">
                            {fewShots.map((shot, shotIndex) => (
                              <div
                                key={shotIndex}
                                className="flex flex-col gap-1 rounded-control bg-surface-container-lowest p-space-sm shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-caption-caps text-[10px] uppercase text-on-surface-variant">
                                    示例 {shotIndex + 1}
                                  </span>
                                  {fewShots.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setFewShots((prev) =>
                                          prev.filter((_, i) => i !== shotIndex),
                                        )
                                      }
                                      className="text-[10px] text-error hover:underline"
                                    >
                                      删除
                                    </button>
                                  )}
                                </div>
                                <span className="font-caption-caps text-[10px] text-on-surface-variant">
                                  用户输入
                                </span>
                                <textarea
                                  value={shot.input}
                                  onChange={(e) =>
                                    setFewShots((prev) =>
                                      prev.map((item, i) =>
                                        i === shotIndex ? { ...item, input: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  rows={2}
                                  placeholder="示例用户请求，例如：把这周的晚餐排成食谱"
                                  className="w-full resize-none rounded-control bg-surface-container-low px-2 py-1 font-body-sm text-body-sm text-on-surface focus:outline-none"
                                />
                                <span className="font-caption-caps text-[10px] text-on-surface-variant">
                                  期望输出
                                </span>
                                <textarea
                                  value={shot.output}
                                  onChange={(e) =>
                                    setFewShots((prev) =>
                                      prev.map((item, i) =>
                                        i === shotIndex
                                          ? { ...item, output: e.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                  rows={2}
                                  placeholder="示例期望结果，例如：按天列出的食谱表格"
                                  className="w-full resize-none rounded-control bg-surface-container-low px-2 py-1 font-body-sm text-body-sm text-on-surface focus:outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={section.content}
                          onChange={(e) =>
                            setSections((prev) =>
                              prev.map((item) =>
                                item.id === section.id
                                  ? { ...item, content: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          rows={3}
                          placeholder={section.hint || '填写段落内容…'}
                          className="w-full resize-none rounded-control bg-surface-container-lowest px-space-md py-1.5 text-body-md text-on-surface shadow-sm focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                  <div className="relative" ref={sectionMenuRef}>
                    <button
                      type="button"
                      onClick={() => setSectionMenuOpen((prev) => !prev)}
                      aria-expanded={sectionMenuOpen}
                      aria-haspopup="menu"
                      className={cn(
                        'flex w-full items-center justify-center gap-space-xs rounded-card bg-surface-container-low py-2 text-body-sm text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface',
                        sectionMenuOpen && 'bg-surface-container text-on-surface',
                      )}
                    >
                      <Icon name="add_circle" size={18} />
                      <span>添加段落</span>
                      <Icon name={sectionMenuOpen ? 'expand_more' : 'expand_less'} size={16} />
                    </button>
                    {sectionMenuOpen ? (
                      <div
                        role="menu"
                        aria-label="选择要添加的内容段"
                        className="absolute bottom-full left-0 z-30 mb-space-xs flex max-h-80 w-full flex-col overflow-y-auto rounded-card border border-outline-variant/40 bg-surface-container-lowest p-space-2xs shadow-dialog"
                      >
                        <span className="px-space-sm py-1 font-caption-caps uppercase text-on-surface-variant">
                          选择内容段
                        </span>
                        {SECTION_TEMPLATES.map((template) => {
                          const added =
                            template.kind === 'few-shot'
                              ? sections.some((item) => item.kind === 'few-shot')
                              : sections.some(
                                  (item) =>
                                    item.kind !== 'few-shot' && item.title === template.title,
                                );
                          return (
                            <button
                              key={template.title}
                              type="button"
                              role="menuitem"
                              disabled={added}
                              onClick={() => handleAddSection(template.title)}
                              className={cn(
                                'flex w-full flex-col gap-0.5 rounded-control px-space-sm py-1.5 text-left transition-colors',
                                template.kind === 'few-shot' &&
                                  'mt-1 border-t border-outline-variant/40 pt-1.5',
                                added
                                  ? 'cursor-not-allowed opacity-50'
                                  : 'hover:bg-surface-container-low',
                              )}
                            >
                              <span className="flex items-center justify-between gap-space-xs text-body-sm font-medium text-on-surface">
                                {template.title}
                                {added ? (
                                  <span className="font-mono text-label-code-sm text-secondary">
                                    已添加
                                  </span>
                                ) : null}
                              </span>
                              <span className="truncate font-mono text-label-code-sm text-on-surface-variant">
                                {template.hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest shadow-card">
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => !prev)}
                  className="flex w-full select-none items-center justify-between px-space-lg py-space-md text-left"
                >
                  <div className="flex items-center gap-space-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-tertiary" />
                    <h2 className="text-headline-sm font-semibold text-on-surface">
                      选填信息与高级属性
                    </h2>
                  </div>
                  <div className="flex items-center gap-space-xs text-on-surface-variant">
                    <span className="text-body-sm">已配置 {configuredCount} 项</span>
                    <Icon
                      name={collapsed ? 'chevron_right' : 'expand_less'}
                      size={18}
                      className={cn('transition-transform', collapsed ? '-rotate-90' : 'rotate-0')}
                    />
                  </div>
                </button>
                {!collapsed && (
                  <div className="flex flex-col gap-space-md px-space-lg pb-space-lg">

                    <div className="flex flex-col gap-space-2xs">
                      <label className="text-body-sm font-semibold text-on-surface">
                        允许调用的外部工具 (allowed-tools 约束)
                      </label>
                      <div className="grid grid-cols-1 gap-space-sm md:grid-cols-3">
                        {TOOL_OPTIONS.map((tool) => (
                          <label
                            key={tool.id}
                            className="flex cursor-pointer items-center gap-space-xs rounded-control bg-surface-container-low p-space-sm transition-colors hover:bg-surface-container"
                          >
                            <input
                              type="checkbox"
                              checked={allowedTools.includes(tool.id)}
                              onChange={() => handleToggleTool(tool.id)}
                              className="w-4 h-4 text-primary rounded focus:ring-0"
                            />
                            <div className="flex flex-col">
                              <span className="font-body-sm font-semibold text-on-surface">
                                {tool.label}
                              </span>
                              <span className="font-caption-caps text-caption-caps text-on-surface-variant text-[10px]">
                                {tool.desc}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-lg shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <h2 className="text-headline-sm font-semibold text-on-surface">SKILL.md 源码</h2>
                </div>
                <span className="font-mono text-label-code-sm text-on-surface-variant">
                  YAML + Markdown
                </span>
              </div>
              <p className="rounded-control bg-surface-container-low px-space-sm py-1.5 font-mono text-label-code-sm text-on-surface-variant">
                编辑完整文档，切回表单时会自动回填。
              </p>
              <textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                spellCheck={false}
                rows={28}
                className="min-h-[520px] w-full resize-y rounded-card bg-inverse-surface p-space-md font-mono text-label-code-sm leading-relaxed text-inverse-on-surface focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-label-code-sm text-on-surface-variant">
                  {raw.split('\n').length} 行 · UTF-8
                </span>
                <Button variant="outline" size="sm" icon="content_copy" onClick={handleCopy}>
                  复制源码
                </Button>
              </div>
            </section>
          )}
        </div>

        {/* 右栏：预览 */}
        <div className="sticky top-14 flex min-w-0 flex-col gap-space-md lg:col-span-5">
          <section className="flex flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-space-xs bg-surface-container-low px-space-md py-space-xs">
              <div className="flex items-center gap-space-xs">
                <button
                  type="button"
                  onClick={() => setPreviewTab('rendered')}
                  className={cn(
                    'flex items-center gap-space-2xs rounded-control px-space-sm py-1 text-body-sm transition-all',
                    previewTab === 'rendered'
                      ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <Icon name="visibility" size={15} />
                  <span>预览</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('raw')}
                  className={cn(
                    'flex items-center gap-space-2xs rounded-control px-space-sm py-1 text-body-sm transition-all',
                    previewTab === 'raw'
                      ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <Icon name="code" size={15} />
                  <span>源码</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded px-space-xs py-1 font-mono text-label-code-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                title="复制代码"
              >
                <Icon name="content_copy" size={14} />
                <span>复制</span>
              </button>
            </div>
            <div className="flex max-h-[560px] flex-col gap-space-md overflow-y-auto bg-surface-container-lowest p-space-lg">
              {previewTab === 'rendered' ? (
                <div className="flex flex-col gap-space-md">
                  <div className="flex flex-col gap-space-2xs rounded-card bg-surface-container-low p-space-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-caption-caps font-bold uppercase text-on-surface-variant">
                        Frontmatter Metadata
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-space-md gap-y-1 font-mono text-label-code-sm">
                      <div className="text-on-surface-variant">
                        名称：
                        <span className="font-semibold text-on-surface">{effectiveSlug}</span>
                      </div>
                      <div className="text-on-surface-variant">
                        工具授权：{' '}
                        <span className="font-semibold text-secondary">
                          {effectiveTools.length ? effectiveTools.join(', ') : '无'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-space-xs">
                    <h1 className="text-headline-lg text-on-surface">
                      {displayName || '未命名技能'}
                    </h1>
                    <p className="rounded-card bg-surface-container-low/50 p-space-sm text-body-md italic text-on-surface-variant">
                      {displayDescription || '暂无描述'}
                    </p>
                  </div>
                  {displaySections.map((section) => (
                    <div key={section.id} className="flex flex-col gap-space-xs">
                      <h2 className="flex items-center gap-space-2xs text-headline-sm text-on-surface">
                        <span className="font-bold text-primary">##</span> {section.title}
                      </h2>
                      <div className="whitespace-pre-line rounded-card bg-surface-container-low/30 p-space-sm text-body-md text-on-surface">
                        {section.content || '（暂无内容）'}
                      </div>
                    </div>
                  ))}
                  {displayFewShots.length ? (
                    <div className="flex flex-col gap-space-xs">
                      <h2 className="flex items-center gap-space-2xs text-headline-sm text-on-surface">
                        <span className="font-bold text-primary">##</span> {fewShotHeading}
                      </h2>
                      {displayFewShots.map((shot, index) => (
                        <div
                          key={index}
                          className="flex flex-col gap-0.5 rounded-card bg-surface-container-low/30 p-space-sm text-body-sm text-on-surface"
                        >
                          <span className="text-on-surface-variant">
                            用户输入：{shot.input || '—'}
                          </span>
                          <span>期望输出：{shot.output || '—'}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="max-h-full select-text overflow-y-auto rounded-card bg-inverse-surface p-space-md font-mono text-label-code-sm leading-relaxed text-inverse-on-surface">
                  <pre className="font-mono text-label-code-sm">{raw}</pre>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-space-xs bg-surface-container-low px-space-md py-space-xs font-mono text-label-code-sm text-on-surface-variant">
              <div className="flex items-center gap-space-xs overflow-hidden">
                <Icon name="description" size={14} className="text-primary" />
                <span className="truncate">~/.myskills/store/{effectiveSlug || '…'}/SKILL.md</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Modal open={resetOpen} onOpenChange={setResetOpen} title="重置" size="sm">
        <div className="px-4 py-4">
          <p className="text-body-sm text-on-surface-variant">将清空当前填写内容。是否继续？</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-outline-variant/30 bg-surface-container-low/40 px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={() => setResetOpen(false)}>
            取消
          </Button>
          <Button variant="danger" size="sm" icon="restart_alt" onClick={handleReset}>
            重置
          </Button>
        </div>
      </Modal>
    </div>
  );
}
