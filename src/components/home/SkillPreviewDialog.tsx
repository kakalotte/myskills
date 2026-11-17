import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../store/app-store';
import { cn, sourceLabel } from '../../lib/format';
import type { ScopeKind, SkillPreview, SkillView } from '../../lib/types';
import { copyText } from '../../lib/platform';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';

type Tab = 'rendered' | 'source' | 'meta';

interface SkillPreviewDialogProps {
  skill: SkillView | null;
  context?: { scope: ScopeKind; projectId?: string | null };
  onClose: () => void;
}

export function SkillPreviewDialog({ skill, context, onClose }: SkillPreviewDialogProps) {
  if (!skill) return null;
  return <SkillPreviewInner key={skill.name} skill={skill} context={context} onClose={onClose} />;
}

function SkillPreviewInner({
  skill,
  context,
  onClose,
}: {
  skill: SkillView;
  context?: { scope: ScopeKind; projectId?: string | null };
  onClose: () => void;
}) {
  const preview = useAppStore((state) => state.preview);
  const pushToast = useAppStore((state) => state.pushToast);
  const [data, setData] = useState<SkillPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('rendered');

  useEffect(() => {
    let cancelled = false;
    preview({
      skillName: skill.name,
      scope: context?.scope,
      projectId: context?.projectId ?? null,
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(err.message ?? '无法读取 SKILL.md');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skill.name, preview, context?.scope, context?.projectId]);

  const frontmatterEntries = useMemo(() => {
    if (!data?.frontmatter || typeof data.frontmatter !== 'object') return [];
    return Object.entries(data.frontmatter as Record<string, unknown>);
  }, [data]);

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${skill.name} 预览`}
      size="3xl"
    >
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-3 pr-12">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-headline-md font-semibold text-on-surface">
              {skill.name}
            </h2>
            {data ? (
              <span className="rounded bg-primary-fixed px-1.5 py-px font-mono text-[10px] text-on-primary-fixed">
                {data.isExternal ? '外部' : sourceLabel(data.source)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-on-surface-variant">
            {data?.displayPath ?? skill.displayPath}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            icon="content_copy"
            onClick={() => {
              if (!data) return;
              void copyText(data.raw).then(
                () => pushToast({ tone: 'info', title: '已复制 SKILL.md 原文' }),
                () => pushToast({ tone: 'error', title: '复制失败', description: '剪贴板不可用' }),
              );
            }}
            disabled={!data}
          >
            复制原文
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-0.5 border-b border-outline-variant/30 bg-surface-container-low/50 px-3 py-1.5">
        {(
          [
            { id: 'rendered', label: '预览', icon: 'visibility' },
            { id: 'source', label: '源码', icon: 'code' },
            { id: 'meta', label: `元数据 (${frontmatterEntries.length})`, icon: 'data_object' },
          ] as Array<{ id: Tab; label: string; icon: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'flex items-center gap-1 rounded-control px-2 py-1 text-body-sm transition-colors',
              tab === item.id
                ? 'bg-surface-container-lowest font-medium text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            <Icon name={item.icon} size={14} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-container-lowest">
        {loading ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-on-surface-variant">
            <Icon name="progress_activity" size={24} className="animate-spin text-primary" />
            <span className="text-body-sm">正在读取文件</span>
          </div>
        ) : error ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 px-8 text-center">
            <Icon name="error" size={26} className="text-error" />
            <p className="text-body-md font-medium text-on-surface">读取失败</p>
            <p className="text-body-sm text-on-surface-variant">{error}</p>
          </div>
        ) : data ? (
          tab === 'rendered' ? (
            <div className="px-6 py-5">
              <div className="md-body">
                <Markdown remarkPlugins={[remarkGfm]}>{data.body || '_正文为空_'}</Markdown>
              </div>
            </div>
          ) : tab === 'source' ? (
            <pre className="whitespace-pre-wrap break-words px-5 py-4 font-mono text-[11.5px] leading-[1.65] text-on-surface">
              {data.raw}
            </pre>
          ) : (
            <div className="flex flex-col gap-3 px-5 py-4">
              {frontmatterEntries.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">没有 frontmatter。</p>
              ) : (
                <div className="overflow-hidden rounded-card border border-outline-variant/40">
                  <table className="w-full border-collapse text-body-sm">
                    <thead>
                      <tr className="bg-surface-container-low text-left text-on-surface">
                        <th className="border-b border-outline-variant/40 px-3 py-1.5 font-medium">字段</th>
                        <th className="border-b border-outline-variant/40 px-3 py-1.5 font-medium">值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frontmatterEntries.map(([key, value]) => (
                        <tr key={key} className="align-top">
                          <td className="border-b border-outline-variant/25 px-3 py-1.5 font-mono text-[11px] text-primary">
                            {key}
                          </td>
                          <td className="border-b border-outline-variant/25 px-3 py-1.5 font-mono text-[11px] text-on-surface-variant">
                            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] leading-4 text-on-surface-variant">
                未知字段会在保存时原样保留。
              </p>
            </div>
          )
        ) : null}
      </div>
    </Modal>
  );
}
