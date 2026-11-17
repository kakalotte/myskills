import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/bridge';
import { useAppStore } from '../store/app-store';
import { SkillPicker } from '../components/bundles/SkillPicker';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

export function BundleNewPage() {
  const navigate = useNavigate();
  const pushToast = useAppStore((state) => state.pushToast);
  const scan = useAppStore((state) => state.globalScan);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const scanning = useAppStore((state) => state.globalScanning);
  const refresh = useAppStore((state) => state.refreshGlobal);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      void refresh({ announce: false });
    }
  }, [bootstrap, scan, scanning, refresh]);

  const skills = useMemo(() => (scan?.skills ?? []).filter((skill) => !skill.isExternal), [scan]);
  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames]);
  const selectedSkills = useMemo(
    () =>
      selectedNames
        .map((name) => skills.find((skill) => skill.name === name))
        .filter((skill): skill is (typeof skills)[number] => Boolean(skill)),
    [selectedNames, skills],
  );

  const slugify = useCallback((value: string) => {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'my-bundle'
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError('请输入组合名称');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const baseSlug = slugify(name.trim());
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const outcome = await api.createBundle({
        name: name.trim(),
        slug,
        version: '1.0.0',
        description: description.trim(),
      });
      const failed: string[] = [];
      for (const skillName of selectedNames) {
        try {
          await api.addSkillToBundle({ bundleId: outcome.bundle.id, skillName });
        } catch {
          failed.push(skillName);
        }
      }
      pushToast({
        tone: failed.length > 0 ? 'warning' : 'success',
        title: failed.length > 0 ? '组合已创建，部分技能未加入' : '组合已创建',
        description:
          failed.length > 0 ? `${failed.length} 个技能加入失败，可在编辑页重试。` : undefined,
      });
      navigate('/bundles');
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      if (normalized.code === 'BUNDLE_EXISTS') {
        setError(normalized.message ?? '组合名称已存在');
        return;
      }
      setError(normalized.message ?? '创建组合失败');
      pushToast({
        tone: 'error',
        title: '创建组合失败',
        description: normalized.message ?? String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }, [name, description, selectedNames, navigate, pushToast, slugify]);

  return (
    <div className="flex flex-col gap-space-md p-space-md">
      <header className="flex flex-col justify-between gap-space-sm md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-space-sm">
          <button
            type="button"
            onClick={() => navigate('/bundles')}
            aria-label="返回组合列表"
            title="返回组合列表"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <h1 className="truncate text-headline-md font-semibold text-on-surface">新建组合</h1>
        </div>
        <div className="flex items-center gap-space-sm self-end md:self-auto">
          <Button
            variant="primary"
            size="sm"
            icon="save"
            loading={submitting}
            disabled={!name.trim() || submitting}
            onClick={handleCreate}
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

      <section className="grid grid-cols-1 items-center gap-4 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant,#4b5563)]">组合名称</span>
          <span className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 py-2.5">
            <Icon name="layers" size={18} className="text-[var(--color-primary,#2563eb)]" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：全栈前端开发套件"
              className="w-full bg-transparent text-sm text-[var(--color-on-surface,#111827)] outline-none placeholder:text-[var(--color-outline,#94a3b8)]"
            />
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant,#4b5563)]">组合描述</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="简要说明用途"
            className="resize-none rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--color-on-surface,#111827)] outline-none placeholder:text-[var(--color-outline,#94a3b8)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]"
          />
        </label>
      </section>

      <div className="grid grid-cols-1 items-start gap-space-md lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SkillPicker
            skills={skills}
            selected={selectedSet}
            onSelect={(skillName) =>
              setSelectedNames((prev) => (prev.includes(skillName) ? prev : [...prev, skillName]))
            }
            onDeselect={(skillName) =>
              setSelectedNames((prev) => prev.filter((name) => name !== skillName))
            }
            disabled={submitting}
          />
        </div>

        <section className="flex flex-col gap-4 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm lg:col-span-7">
          <div className="grid grid-cols-12 gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant,#4b5563)]">
            <div className="col-span-1 text-center">序号</div>
            <div className="col-span-8">技能项</div>
            <div className="col-span-3 text-right">操作</div>
          </div>

          <div className="flex flex-col gap-2">
            {selectedSkills.map((skill, index) => (
              <div
                key={skill.id}
                className="grid grid-cols-12 items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)] bg-[var(--color-surface-container-lowest)] p-3 shadow-sm transition-colors hover:bg-[var(--color-surface-container-low,#fbfcfd)]"
              >
                <div className="col-span-1 text-center font-mono text-sm font-semibold text-[var(--color-on-surface,#111827)]">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="col-span-8 flex min-w-0 flex-col pr-2">
                  <span className="truncate text-sm font-medium text-[var(--color-on-surface,#111827)]">{skill.name}</span>
                  <span className="line-clamp-1 text-xs text-[var(--color-on-surface-variant,#6b7280)]">
                    {skill.description || '暂无描述'}
                  </span>
                </div>
                <div className="col-span-3 flex justify-end">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      setSelectedNames((prev) => prev.filter((name) => name !== skill.name))
                    }
                    className="rounded-md p-1.5 text-[var(--color-on-surface-variant,#6b7280)] transition-colors hover:bg-[var(--color-error-container,#fee2e2)] hover:text-[var(--color-on-error-container,#991b1b)] disabled:opacity-40"
                    title="移出组合"
                  >
                    <Icon name="delete" size={18} />
                  </button>
                </div>
              </div>
            ))}
            {selectedSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-low,#fbfcfd)] py-8 text-[var(--color-on-surface-variant,#6b7280)]">
                <Icon name="playlist_add" size={28} className="opacity-60" />
                <p className="text-sm">从左栏挑选技能加入组合</p>
              </div>
            ) : null}
          </div>

        </section>
      </div>
    </div>
  );
}
