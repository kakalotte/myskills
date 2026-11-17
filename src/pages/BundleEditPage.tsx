import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/bridge';
import { useAppStore } from '../store/app-store';
import type { Bundle, ScanResult, ToastMessage } from '../lib/types';
import { SkillPicker } from '../components/bundles/SkillPicker';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

function BundleEditForm({
  bundleId,
  scan,
  pushToast,
}: {
  bundleId: string;
  scan: ScanResult | null;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => string;
}) {
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSkills = useMemo(
    () => (scan?.skills ?? []).filter((skill) => !skill.isExternal),
    [scan],
  );

  const selectedSet = useMemo(() => new Set(bundle?.skillNames ?? []), [bundle?.skillNames]);

  const bundleSkills = useMemo(
    () =>
      (bundle?.skillNames ?? [])
        .map((name) => allSkills.find((skill) => skill.name === name))
        .filter((skill): skill is (typeof allSkills)[number] => Boolean(skill)),
    [bundle?.skillNames, allSkills],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const outcome = await api.listBundles();
        const found = outcome.bundles.find((item) => item.id === bundleId);
        if (!cancelled) {
          if (found) setBundle(found);
          else setError('组合不存在或已被删除');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const normalized = err as { code?: string; message?: string };
          setError(normalized.message ?? '加载组合失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [bundleId]);

  const handleAddSkill = useCallback(
    async (skillName: string) => {
      if (!bundle || bundle.skillNames.includes(skillName)) return;
      setSubmitting(true);
      setError(null);
      try {
        await api.addSkillToBundle({ bundleId: bundle.id, skillName });
        setBundle((prev) =>
          prev ? { ...prev, skillNames: [...prev.skillNames, skillName] } : prev,
        );
        pushToast({ tone: 'success', title: '技能已添加' });
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
    [bundle, pushToast],
  );

  const handleRemoveSkill = useCallback(
    async (skillName: string) => {
      if (!bundle) return;
      setSubmitting(true);
      try {
        await api.removeSkillFromBundle({ bundleId: bundle.id, skillName });
        setBundle((prev) =>
          prev
            ? { ...prev, skillNames: prev.skillNames.filter((name) => name !== skillName) }
            : prev,
        );
        pushToast({ tone: 'success', title: '技能已移除' });
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
    [bundle, pushToast],
  );

  const handleUpdateBundle = useCallback(async () => {
    if (!bundle) return;
    if (!bundle.name.trim()) {
      setError('组合名称不能为空');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateBundle({
        id: bundle.id,
        name: bundle.name.trim(),
        slug: bundle.slug,
        version: bundle.version,
        description: bundle.description.trim(),
      });
      pushToast({ tone: 'success', title: '组合已保存' });
      navigate('/bundles');
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      setError(normalized.message ?? '保存组合失败');
      pushToast({
        tone: 'error',
        title: '保存组合失败',
        description: normalized.message ?? String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }, [bundle, pushToast, navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-space-lg text-body-sm text-on-surface-variant">
        正在加载组合…
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex flex-col items-center justify-center gap-space-sm p-space-2xl text-on-surface-variant">
        <Icon name="error" size={28} className="text-outline" />
        <p className="text-body-sm">{error ?? '组合不存在'}</p>
        <Button variant="outline" size="sm" icon="arrow_back" onClick={() => navigate('/bundles')}>
          返回组合列表
        </Button>
      </div>
    );
  }

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
          <h1 className="truncate text-headline-md font-semibold text-on-surface">{bundle.name}</h1>
        </div>
        <div className="flex items-center gap-space-sm self-end md:self-auto">
          <Button
            variant="primary"
            size="sm"
            icon="save"
            loading={submitting}
            disabled={submitting}
            onClick={handleUpdateBundle}
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
              value={bundle.name}
              onChange={(e) => setBundle({ ...bundle, name: e.target.value })}
              placeholder="组合名称"
              className="w-full bg-transparent text-sm text-[var(--color-on-surface,#111827)] outline-none placeholder:text-[var(--color-outline,#94a3b8)]"
            />
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant,#4b5563)]">组合描述</span>
          <textarea
            value={bundle.description}
            onChange={(e) => setBundle({ ...bundle, description: e.target.value })}
            rows={2}
            placeholder="简要说明用途"
            className="resize-none rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--color-on-surface,#111827)] outline-none placeholder:text-[var(--color-outline,#94a3b8)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]"
          />
        </label>
      </section>

      <div className="grid grid-cols-1 items-start gap-space-md lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SkillPicker
            skills={allSkills}
            selected={selectedSet}
            onSelect={(skillName) => void handleAddSkill(skillName)}
            disabled={submitting}
          />
        </div>

        <section className="flex flex-col gap-4 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-surface-container-low,#fbfcfd)] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-[var(--color-primary,#2563eb)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-primary,#2563eb)]" />
                {bundle.skillNames.length} 个技能已纳入
              </span>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant,#4b5563)]">
            <div className="col-span-1 text-center">序号</div>
            <div className="col-span-7">技能项</div>
            <div className="col-span-3 text-center">部署状态</div>
            <div className="col-span-1 text-right">操作</div>
          </div>

          <div className="flex flex-col gap-2">
            {bundleSkills.map((skill, index) => {
              const installed = skill.badges.filter((badge) => badge.state === 'installed').length;
              return (
                <div
                  key={skill.id}
                  className="grid grid-cols-12 items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)] bg-[var(--color-surface-container-lowest)] p-3 shadow-sm transition-colors hover:bg-[var(--color-surface-container-low,#fbfcfd)]"
                >
                  <div className="col-span-1 text-center font-mono text-sm font-semibold text-[var(--color-on-surface,#111827)]">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="col-span-7 flex min-w-0 flex-col pr-2">
                    <span className="truncate text-sm font-medium text-[var(--color-on-surface,#111827)]">{skill.name}</span>
                    <span className="line-clamp-1 text-xs text-[var(--color-on-surface-variant,#6b7280)]">
                      {skill.description || '暂无描述'}
                    </span>
                  </div>
                  <div className="col-span-3 flex justify-center">
                    <span
                      className={
                        installed > 0
                          ? 'rounded-md bg-[var(--color-success-container,#d1fae5)] px-2 py-0.5 text-xs font-medium text-[var(--color-on-success-container,#065f46)]'
                          : 'rounded-md bg-[var(--color-surface-container,#eaf0f6)] px-2 py-0.5 text-xs text-[var(--color-on-surface-variant,#4b5563)]'
                      }
                    >
                      {installed > 0 ? `已安装 ${installed}` : '未安装'}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleRemoveSkill(skill.name)}
                      className="rounded-md p-1.5 text-[var(--color-on-surface-variant,#6b7280)] transition-colors hover:bg-[var(--color-error-container,#fee2e2)] hover:text-[var(--color-on-error-container,#991b1b)] disabled:opacity-40"
                      title="移出组合"
                    >
                      <Icon name="delete" size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
            {bundleSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-low,#fbfcfd)] py-8 text-[var(--color-on-surface-variant,#6b7280)]">
                <Icon name="playlist_add" size={28} className="opacity-60" />
                <p className="text-sm">尚未添加技能，从左栏挑选</p>
              </div>
            ) : null}
          </div>

        </section>
      </div>
    </div>
  );
}

export function BundleEditPage() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const scan = useAppStore((state) => state.globalScan);
  const pushToast = useAppStore((state) => state.pushToast);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const scanning = useAppStore((state) => state.globalScanning);
  const refresh = useAppStore((state) => state.refreshGlobal);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      void refresh({ announce: false });
    }
  }, [bootstrap, scan, scanning, refresh]);

  if (!bundleId) return null;

  return <BundleEditForm key={bundleId} bundleId={bundleId} scan={scan} pushToast={pushToast} />;
}
