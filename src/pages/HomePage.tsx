import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImportDialog } from '../components/home/ImportDialog';
import { SkillCard } from '../components/home/SkillCard';
import { SkillPreviewDialog } from '../components/home/SkillPreviewDialog';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Select } from '../components/ui/Select';
import { useAppStore } from '../store/app-store';
import type { SkillView } from '../lib/types';

type SourceFilter = 'all' | 'central' | 'external' | 'conflict';
type SortKey = 'name' | 'mounts' | 'source';

export function HomePage() {
  const scan = useAppStore((state) => state.globalScan);
  const scanning = useAppStore((state) => state.globalScanning);
  const scanError = useAppStore((state) => state.globalScanError);
  const refresh = useAppStore((state) => state.refreshGlobal);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [showExternal, setShowExternal] = useState(false);
  const [sort, setSort] = useState<SortKey>('name');
  const [previewSkill, setPreviewSkill] = useState<SkillView | null>(null);
  const [importTarget, setImportTarget] = useState<SkillView | null>(null);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      void refresh({ announce: false });
    }
  }, [bootstrap, scan, scanning, refresh]);

  const skills = useMemo(() => scan?.skills ?? [], [scan]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = skills.filter((skill) => {
      if (!showExternal && skill.isExternal) return false;
      if (sourceFilter === 'central' && skill.isExternal) return false;
      if (sourceFilter === 'external' && !skill.isExternal) return false;
      if (sourceFilter === 'conflict') {
        if (!skill.badges.some((badge) => badge.state === 'conflict')) return false;
      }
      if (needle) {
        const haystack = [skill.name, skill.dirName, skill.description].join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sort === 'mounts') {
        const mounts = (item: SkillView) =>
          item.badges.filter((badge) => badge.state === 'installed').length;
        return mounts(b) - mounts(a) || a.name.localeCompare(b.name, 'zh-CN');
      }
      if (sort === 'source') {
        return a.source.localeCompare(b.source) || a.name.localeCompare(b.name, 'zh-CN');
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    return result;
  }, [skills, sourceFilter, query, sort, showExternal]);

  function open(source: SkillView, target: 'preview' | 'import') {
    if (target === 'preview') setPreviewSkill(source);
    if (target === 'import') setImportTarget(source);
  }

  return (
    <div className="flex flex-col gap-space-md p-space-md">
      <div className="flex min-w-0 flex-col gap-space-md">
        <div className="flex flex-wrap items-center gap-space-sm rounded-card bg-surface-container-lowest px-space-sm py-space-xs shadow-card">
          <label className="relative flex h-8 min-w-[180px] flex-1 items-center rounded-control bg-surface-container-low focus-within:ring-1 focus-within:ring-primary/25 sm:max-w-sm">
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

          <Select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
            icon="filter_alt"
            aria-label="来源筛选"
          >
            <option value="all">全部来源</option>
            <option value="central">仅中央库</option>
            <option value="external">仅外部原件</option>
            <option value="conflict">仅目标已占用</option>
          </Select>

          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            icon="sort"
            aria-label="排序"
          >
            <option value="name">按名称</option>
            <option value="mounts">按安装数</option>
            <option value="source">按来源</option>
          </Select>

          <label className="flex h-8 cursor-pointer select-none items-center gap-space-xs rounded-control px-space-xs text-body-sm text-on-surface-variant transition-colors hover:text-on-surface">
            <input
              type="checkbox"
              checked={showExternal}
              onChange={(event) => {
                const checked = event.target.checked;
                setShowExternal(checked);
                if (!checked && sourceFilter === 'external') {
                  setSourceFilter('all');
                }
              }}
              className="h-3.5 w-3.5 accent-primary"
            />
            <span>加载外部 skill</span>
          </label>

          <span className="ml-auto" />
          <Button
            variant="outline"
            size="sm"
            icon="refresh"
            loading={scanning}
            onClick={() => void refresh({ announce: true })}
            title="重新扫描"
          >
            <span className="sr-only">重新扫描</span>
          </Button>
          <Button variant="primary" size="sm" icon="add" onClick={() => navigate('/skills/new')}>
            新建技能
          </Button>
        </div>

        {scanError && !scan ? (
          <ErrorState
            title="扫描没有完成"
            description={scanError.message}
            detail={scanError.detail}
            onRetry={() => void refresh({ announce: true })}
          />
        ) : scanning && !scan ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            hasQuery={Boolean(query) || sourceFilter !== 'all' || showExternal}
            onReset={() => {
              setQuery('');
              setSourceFilter('all');
              setShowExternal(false);
            }}
            onNew={() => navigate('/skills/new')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                context={{ scope: 'global' }}
                onPreview={(item) => open(item, 'preview')}
                onEdit={(item) => navigate(`/skills/${encodeURIComponent(item.name)}/edit`)}
                onOpen={(item) => navigate(`/skills/${encodeURIComponent(item.name)}`)}
                onImport={(item) => open(item, 'import')}
              />
            ))}
          </div>
        )}
      </div>

      <SkillPreviewDialog
        skill={previewSkill}
        context={{ scope: 'global' }}
        onClose={() => setPreviewSkill(null)}
      />
      <ImportDialog
        skill={importTarget}
        context={{ scope: 'global' }}
        onClose={() => setImportTarget(null)}
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest text-on-surface-variant shadow-card">
      <Icon name="progress_activity" size={26} className="animate-spin text-primary" />
      <p className="text-body-md">正在扫描本地目录</p>
    </div>
  );
}

function ErrorState({
  title,
  description,
  detail,
  onRetry,
}: {
  title: string;
  description: string;
  detail?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
      <Icon name="error" size={26} className="text-error" />
      <p className="text-body-md font-medium text-on-surface">{title}</p>
      <p className="max-w-md text-body-sm text-on-surface-variant">{description}</p>
      {detail ? (
        <pre className="max-w-lg overflow-x-auto rounded bg-error-container/40 px-2 py-1 font-mono text-[10px] text-on-error-container">
          {detail}
        </pre>
      ) : null}
      <Button variant="outline" size="sm" icon="refresh" onClick={onRetry}>
        重试扫描
      </Button>
    </div>
  );
}

function EmptyState({
  hasQuery,
  onReset,
  onNew,
}: {
  hasQuery: boolean;
  onReset: () => void;
  onNew: () => void;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-surface-container-lowest px-6 text-center shadow-card">
      <Icon name={hasQuery ? 'search_off' : 'inventory_2'} size={28} className="text-outline" />
      <p className="text-body-md font-medium text-on-surface">
        {hasQuery ? '没有匹配的技能' : '中央库还没有技能'}
      </p>
      <p className="max-w-md text-body-sm text-on-surface-variant">
        {hasQuery ? '调整筛选条件再试' : '从 Agent 工作区纳入，或新建技能'}
      </p>
      <div className="mt-1 flex gap-1.5">
        {hasQuery ? (
          <Button variant="outline" size="sm" icon="filter_alt_off" onClick={onReset}>
            清除筛选
          </Button>
        ) : null}
        <Button variant="soft" size="sm" icon="add" onClick={onNew}>
          新建技能
        </Button>
      </div>
    </div>
  );
}
