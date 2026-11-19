import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AgentMark } from '../../components/agents/AgentMark';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { AGENT_ICON_DIR, AGENT_ICON_FILES } from '../../lib/agentIcons';
import { LOBE_ICONS } from '../../lib/lobeIcons.generated';
import { cn } from '../../lib/format';
import { pickDirectory } from '../../lib/platform';
import type { RootInfo } from '../../lib/types';
import { useAppStore } from '../../store/app-store';

type IconOption = { file: string; name: string };

const coreIcons: IconOption[] = Array.from(new Set(Object.values(AGENT_ICON_FILES))).map((file) => ({
  file,
  name: file.replace(/\.(svg|png)$/, ''),
}));
const extraIcons: IconOption[] = LOBE_ICONS.map((icon) => ({ file: icon.file, name: icon.name }));
const defaultIcon = AGENT_ICON_FILES.workbuddy ?? coreIcons[0]?.file ?? '';

function RootRow({
  root,
  pending,
  onToggle,
  onRemove,
}: {
  root: RootInfo;
  pending: boolean;
  onToggle: (authorized: boolean) => Promise<void>;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex items-center justify-between gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] px-3 py-3 shadow-sm transition-colors hover:bg-[var(--color-surface-container-low,#fbfcfd)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center">
          <AgentMark
            agentId={root.agentId}
            agentName={root.agentName}
            size={28}
            src={root.iconSrc}
          />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-space-xs">
            <span className="truncate text-sm font-semibold text-[var(--color-on-surface,#111827)]">
              {root.agentName}
            </span>
            {root.isCustom ? (
              <span className="shrink-0 rounded-pill bg-secondary-container px-1.5 py-0.5 text-caption-caps uppercase text-on-secondary-container">
                自定义
              </span>
            ) : null}
          </span>
          <span
            className="truncate font-mono text-xs text-[var(--color-on-surface-variant,#6b7280)]"
            title={root.path}
          >
            {root.displayPath}
          </span>
        </div>
      </div>
      <div className="ml-space-xs flex shrink-0 items-center">
        {root.isCustom && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            title="移除自定义 Agent（仅移除配置，不删除磁盘目录）"
            aria-label={`移除 ${root.agentName}`}
            className="mr-1 rounded p-1 text-outline transition-colors hover:bg-error-container/60 hover:text-on-error-container disabled:opacity-40"
          >
            <Icon name="delete" size={16} />
          </button>
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={root.authorized}
          disabled={pending || !root.exists}
          onClick={() => void onToggle(!root.authorized)}
          title={
            root.exists
              ? root.authorized
                ? '已授权（默认随检测开启，可手动关闭）'
                : '未授权（已手动关闭）'
              : '未检测到目录，无法授权'
          }
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform disabled:cursor-not-allowed disabled:opacity-40',
            root.authorized && root.exists
              ? 'bg-[var(--color-primary,#2563eb)] after:translate-x-5'
              : 'bg-[var(--color-outline,#94a3b8)]',
            !root.exists && root.authorized
              ? 'bg-[var(--color-outline,#94a3b8)] after:translate-x-5 opacity-60'
              : '',
          )}
        >
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Icon name="progress_activity" size={12} className="animate-spin text-primary" />
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function AddAgentForm({ onClose }: { onClose: () => void }) {
  const addCustomAgent = useAppStore((state) => state.addCustomAgent);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [iconKind, setIconKind] = useState<'builtin' | 'uploaded' | 'none'>('none');
  const [iconValue, setIconValue] = useState('');
  const [iconBase64, setIconBase64] = useState<string | null>(null);
  const [showBuiltinPicker, setShowBuiltinPicker] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [authorized, setAuthorized] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const previewSrc =
    iconKind === 'builtin'
      ? `${AGENT_ICON_DIR}${iconValue}`
      : iconKind === 'uploaded'
        ? iconBase64
        : null;

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('仅支持 PNG、JPG、WEBP 格式的图标');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('图标大小需在 2 MB 以内');
      return;
    }
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const reader = new FileReader();
    reader.onload = () => {
      setIconBase64(String(reader.result));
      setIconValue(extension);
      setIconKind('uploaded');
      setShowBuiltinPicker(false);
      setError(null);
    };
    reader.onerror = () => setError('读取图标失败');
    reader.readAsDataURL(file);
  }

  async function handlePickDirectory() {
    const picked = await pickDirectory('选择 Agent 技能目录');
    if (picked) {
      setPath(picked);
      setError(null);
    }
  }

  function toggleBuiltinPicker() {
    if (showBuiltinPicker) {
      // Closing the picker falls back to the default: no icon, show initials.
      setShowBuiltinPicker(false);
      setIconKind('none');
      setIconValue('');
      setIconBase64(null);
      return;
    }
    setShowBuiltinPicker(true);
    setIconKind('builtin');
    setIconBase64(null);
    if (!iconValue || iconKind === 'uploaded') setIconValue(defaultIcon);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('请输入 Agent 名称');
      return;
    }
    if (!path.trim()) {
      setError('请选择或输入目录路径');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addCustomAgent({
        name: name.trim(),
        path: path.trim(),
        iconKind,
        iconValue,
        iconBase64,
        authorized,
      });
      onClose();
    } catch (caught) {
      setError((caught as { message?: string }).message ?? '添加失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="添加自定义 Agent"
      description="登记一个本地 Agent 技能目录，可设置名称、图标与授权状态。"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex items-center gap-space-sm border-b border-outline-variant/40 px-space-xl py-space-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-secondary-container">
            <Icon name="add" size={20} className="text-secondary" />
          </span>
          <div className="flex flex-col gap-space-2xs">
            <h2 className="text-headline-md text-on-surface">添加自定义 Agent</h2>
            <p className="text-body-sm text-on-surface-variant">
              登记一个本机已有的技能目录，添加后即可在技能库中部署。
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-space-md overflow-y-auto p-space-xl">
          {error ? (
            <p className="rounded-control bg-error-container/60 px-space-md py-space-sm text-body-sm text-on-error-container">
              {error}
            </p>
          ) : null}

          <label className="flex flex-col gap-space-xs">
            <span className="text-body-sm font-semibold text-on-surface">名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：我的私有 Agent"
              maxLength={60}
              className="h-9 w-full rounded-control border border-outline-variant/60 bg-surface-container-lowest px-space-sm text-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-space-xs">
            <span className="text-body-sm font-semibold text-on-surface">技能目录路径</span>
            <span className="flex gap-space-sm">
              <input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="例如：~/.my-agent/skills"
                className="h-9 min-w-0 flex-1 rounded-control border border-outline-variant/60 bg-surface-container-lowest px-space-sm font-mono text-xs text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
              />
              <Button size="sm" variant="outline" icon="folder_open" onClick={handlePickDirectory}>
                选择目录
              </Button>
            </span>
            <span className="text-body-sm text-on-surface-variant">
              目录需在本机已存在；添加后仅保存配置，不会修改该目录内容。
            </span>
          </label>

          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <span className="text-body-sm font-semibold text-on-surface">图标</span>
              <span className="text-body-sm text-on-surface-variant">
                不选图标时以名称首字母显示
              </span>
            </div>
            <div className="flex items-center gap-space-md">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-surface-container-low">
                <AgentMark
                  agentId={iconKind === 'builtin' ? iconValue.replace(/\.(svg|png)$/, '') : 'custom'}
                  agentName={name || '自定义'}
                  size={36}
                  src={previewSrc}
                />
              </span>
              <div className="flex flex-wrap items-center gap-space-xs">
                <Button
                  size="sm"
                  variant={showBuiltinPicker ? 'soft' : 'outline'}
                  icon="grid_view"
                  onClick={toggleBuiltinPicker}
                >
                  内置图标
                </Button>
                <Button
                  size="sm"
                  variant={iconKind === 'uploaded' ? 'soft' : 'outline'}
                  icon="upload"
                  onClick={() => fileInput.current?.click()}
                >
                  上传图标
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
            </div>
            {showBuiltinPicker ? (
              <div className="flex flex-col gap-space-sm">
                <input
                  value={iconSearch}
                  onChange={(event) => setIconSearch(event.target.value)}
                  placeholder="搜索图标名称…"
                  className="h-8 w-full rounded-control border border-outline-variant/60 bg-surface-container-lowest px-space-sm text-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
                />
                <div className="flex max-h-56 flex-col gap-space-sm overflow-y-auto rounded-card bg-surface-container-low p-space-sm">
                  {(() => {
                    const q = iconSearch.trim().toLowerCase();
                    const match = (option: IconOption) =>
                      !q || option.name.toLowerCase().includes(q) || option.file.toLowerCase().includes(q);
                    const core = coreIcons.filter(match);
                    const extra = extraIcons.filter(match);
                    const renderGroup = (label: string, options: IconOption[]) =>
                      options.length > 0 ? (
                        <div className="flex flex-col gap-space-xs">
                          <span className="font-caption-caps uppercase text-on-surface-variant">{label}</span>
                          <div className="grid grid-cols-8 gap-1">
                            {options.map((option) => (
                              <button
                                key={option.file}
                                type="button"
                                onClick={() => {
                                  setIconValue(option.file);
                                  setIconBase64(null);
                                }}
                                title={option.name}
                                aria-label={`选择图标 ${option.file}`}
                                className={cn(
                                  'flex h-9 w-9 items-center justify-center rounded-control transition-colors',
                                  iconValue === option.file
                                    ? 'bg-primary-fixed ring-1 ring-primary'
                                    : 'hover:bg-surface-container',
                                )}
                              >
                                <img src={`${AGENT_ICON_DIR}${option.file}`} alt="" className="h-6 w-6 object-contain" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    if (core.length === 0 && extra.length === 0) {
                      return <p className="py-space-md text-center text-body-sm text-on-surface-variant">未找到匹配的图标</p>;
                    }
                    return (
                      <>
                        {renderGroup('内置图标', core)}
                        {renderGroup('更多 Lobe Icons', extra)}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-space-md rounded-card bg-surface-container-low px-space-md py-space-sm">
            <div className="flex flex-col gap-space-2xs">
              <span className="text-body-sm font-semibold text-on-surface">授权访问</span>
              <span className="text-body-sm text-on-surface-variant">
                授权后该 Agent 才会在技能库中显示并可用于安装技能。
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={authorized}
              aria-label="授权访问"
              onClick={() => setAuthorized((value) => !value)}
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform',
                authorized ? 'bg-primary after:translate-x-5' : 'bg-outline',
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-space-sm border-t border-outline-variant/40 px-space-xl py-space-md">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
            添加 Agent
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function SettingsRootsPage() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const authorizeRoot = useAppStore((state) => state.authorizeRoot);
  const removeCustomAgent = useAppStore((state) => state.removeCustomAgent);
  const pushToast = useAppStore((state) => state.pushToast);
  const scan = useAppStore((state) => state.globalScan);
  const refresh = useAppStore((state) => state.refreshGlobal);
  const scanning = useAppStore((state) => state.globalScanning);

  const [pendingRoot, setPendingRoot] = useState<string | null>(null);
  const [showUndetectedRoots, setShowUndetectedRoots] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    if (bootstrap && !scan && !scanning) {
      void refresh({ announce: false });
    }
  }, [bootstrap, scan, scanning, refresh]);

  const roots = (bootstrap?.roots ?? []).filter((root) => root.scope === 'global');
  const detectedRoots = roots.filter((root) => root.exists);
  const undetectedRoots = roots.filter((root) => !root.exists);

  async function handleToggle(rootId: string, authorized: boolean) {
    setPendingRoot(rootId);
    try {
      await authorizeRoot(rootId, authorized);
    } catch (error) {
      pushToast({
        tone: 'error',
        title: '授权状态未更新',
        description: (error as { message?: string }).message ?? String(error),
      });
    } finally {
      setPendingRoot(null);
    }
  }

  async function handleRemove(root: RootInfo) {
    if (!window.confirm(`确定移除「${root.agentName}」吗？仅移除配置与图标，不会删除磁盘目录。`)) {
      return;
    }
    setPendingRoot(root.id);
    try {
      await removeCustomAgent(root.agentId);
    } catch (error) {
      pushToast({
        tone: 'error',
        title: '移除自定义 Agent 失败',
        description: (error as { message?: string }).message ?? String(error),
      });
    } finally {
      setPendingRoot(null);
    }
  }

  return (
    <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-md shadow-card">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-space-2xs">
          <h2 className="text-headline-md font-semibold text-on-surface">Agent 路径</h2>
          <p className="text-body-sm text-on-surface-variant">
            管理全局 Agent 的扫描目录与读取权限。已安装/已探测默认开启，可手动开启未安装或关闭已安装；授权影响 Agent 在其他模块的显示。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-space-xs">
          <Button
            size="sm"
            variant="primary"
            icon="add"
            onClick={() => setShowAddDialog(true)}
          >
            添加 Agent
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon="sync"
            loading={scanning}
            onClick={() => void refresh({ announce: true })}
          >
            重新探测
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-space-xs">
        <h3 className="text-headline-sm font-semibold text-on-surface">全局 Agent 路径</h3>
        {detectedRoots.length === 0 ? (
          <p className="rounded-card bg-surface-container-low px-space-sm py-space-sm text-body-sm text-on-surface-variant">
            未检测到已存在的全局 Agent 目录。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {detectedRoots.map((root) => (
              <RootRow
                key={root.id}
                root={root}
                pending={pendingRoot === root.id}
                onToggle={(authorized) => handleToggle(root.id, authorized)}
                onRemove={() => void handleRemove(root)}
              />
            ))}
          </div>
        )}
      </div>

      {undetectedRoots.length > 0 ? (
        <div className="flex flex-col gap-space-xs">
          <button
            type="button"
            onClick={() => setShowUndetectedRoots((value) => !value)}
            className="flex w-full items-center justify-between rounded-card bg-surface-container-low px-space-sm py-space-xs text-left transition-colors hover:bg-surface-container"
          >
            <span className="font-caption-caps uppercase text-on-surface-variant">
              未探测到的全局 Agent（{undetectedRoots.length}）
            </span>
            <Icon
              name={showUndetectedRoots ? 'expand_less' : 'expand_more'}
              size={18}
              className="text-on-surface-variant"
            />
          </button>
          {showUndetectedRoots ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {undetectedRoots.map((root) => (
                <RootRow
                  key={root.id}
                  root={root}
                  pending={pendingRoot === root.id}
                  onToggle={(authorized) => handleToggle(root.id, authorized)}
                  onRemove={() => void handleRemove(root)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showAddDialog ? <AddAgentForm onClose={() => setShowAddDialog(false)} /> : null}
    </section>
  );
}
