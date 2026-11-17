import { create } from 'zustand';
import { api, normalizeError } from '../lib/bridge';
import { mountLabel } from '../lib/format';
import { readThemeCache, writeThemeCache } from '../lib/theme';
import type {
  Bootstrap,
  CmdError,
  ImportOutcome,
  ImportSkillPayload,
  InstallSkillPayload,
  MountOutcome,
  Project,
  PreviewSkillPayload,
  ScanPayload,
  ScanResult,
  SkillPreview,
  ThemePreference,
  ToastMessage,
  UninstallSkillPayload,
} from '../lib/types';

interface RefreshOptions {
  announce?: boolean;
}

export interface AppState {
  bootstrap: Bootstrap | null;
  loading: boolean;
  fatal: CmdError | null;
  /** Global module scan (skills library `/` and global Agents page). */
  globalScan: ScanResult | null;
  globalScanning: boolean;
  globalScanError: CmdError | null;
  /** Per-project module scans, keyed by projectId. */
  projectScans: Record<string, ScanResult>;
  projectScanning: Record<string, boolean>;
  projectScanErrors: Record<string, CmdError | null>;
  toasts: ToastMessage[];
  /** UI color scheme, mirroring `settings.theme` after bootstrap. */
  theme: ThemePreference;
  initialize: () => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  refreshBootstrap: () => Promise<Bootstrap | null>;
  refreshGlobal: (options?: RefreshOptions) => Promise<ScanResult | null>;
  refreshProject: (projectId: string, options?: RefreshOptions) => Promise<ScanResult | null>;
  scanContext: (payload: ScanPayload, options?: RefreshOptions) => Promise<ScanResult | null>;
  authorizeRoot: (rootId: string, authorized: boolean) => Promise<void>;
  addProject: (name: string | undefined, path: string) => Promise<Project>;
  removeProject: (projectId: string) => Promise<void>;
  install: (payload: InstallSkillPayload, agentName: string) => Promise<MountOutcome>;
  uninstall: (payload: UninstallSkillPayload, agentName: string) => Promise<MountOutcome>;
  importSkill: (payload: ImportSkillPayload) => Promise<ImportOutcome>;
  preview: (payload: PreviewSkillPayload) => Promise<SkillPreview>;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => string;
  dismissToast: (id: string) => void;
}

let toastSequence = 0;

function toastId(): string {
  toastSequence += 1;
  return `toast-${Date.now()}-${toastSequence}`;
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrap: null,
  loading: true,
  fatal: null,
  globalScan: null,
  globalScanning: false,
  globalScanError: null,
  projectScans: {},
  projectScanning: {},
  projectScanErrors: {},
  toasts: [],
  theme: readThemeCache(),

  initialize: async () => {
    set({ loading: true, fatal: null });
    try {
      const bootstrap = await api.bootstrap();
      const theme = bootstrap.settings.theme ?? 'system';
      writeThemeCache(theme);
      set({ bootstrap, loading: false, theme });
      await get().refreshGlobal({ announce: false });
    } catch (error) {
      set({ loading: false, fatal: normalizeError(error) });
    }
  },

  setTheme: async (theme) => {
    const previous = get().theme;
    if (previous === theme) return;
    writeThemeCache(theme);
    set({ theme });
    try {
      const settings = await api.setTheme(theme);
      const bootstrap = get().bootstrap;
      if (bootstrap) set({ bootstrap: { ...bootstrap, settings } });
    } catch (error) {
      writeThemeCache(previous);
      set({ theme: previous });
      throw normalizeError(error);
    }
  },

  refreshBootstrap: async () => {
    try {
      const bootstrap = await api.bootstrap();
      const theme = bootstrap.settings.theme ?? 'system';
      writeThemeCache(theme);
      set({ bootstrap, theme });
      return bootstrap;
    } catch (error) {
      get().pushToast({
        tone: 'error',
        title: '刷新状态失败',
        description: normalizeError(error).message,
      });
      return null;
    }
  },

  refreshGlobal: async (options = {}) => {
    const { announce = true } = options;
    if (!get().bootstrap) {
      return null;
    }
    set({ globalScanning: true, globalScanError: null });
    try {
      const scan = await api.scanSkills({ scope: 'global' });
      set({ globalScan: scan, globalScanning: false });
      if (announce) {
        if (scan.diff.firstScan) {
          get().pushToast({
            tone: 'success',
            title: `扫描完成：${scan.stats.skillCount} 个技能`,
            description: `中央库 ${scan.stats.skillCount - scan.stats.externalCount} · 外部 ${scan.stats.externalCount} · 安装 ${scan.stats.installedMounts}`,
          });
        } else {
          const changes =
            scan.diff.added.length + scan.diff.removed.length + scan.diff.changed.length;
          if (changes === 0) {
            get().pushToast({
              tone: 'info',
              title: '扫描完成',
              description: '未发现变化',
            });
          } else {
            get().pushToast({
              tone: changes > 0 && scan.diff.removed.length > 0 ? 'warning' : 'info',
              title: `发现 ${changes} 项变化`,
              description: `新增 ${scan.diff.added.length} · 移除 ${scan.diff.removed.length} · 变更 ${scan.diff.changed.length}`,
            });
          }
        }
      }
      return scan;
    } catch (error) {
      const normalized = normalizeError(error);
      set({ globalScanning: false, globalScanError: normalized });
      get().pushToast({
        tone: 'error',
        title: '扫描未完成',
        description: normalized.message,
      });
      return null;
    }
  },

  refreshProject: async (projectId, options = {}) => {
    const { announce = false } = options;
    if (!get().bootstrap) {
      return null;
    }
    set((state) => ({
      projectScanning: { ...state.projectScanning, [projectId]: true },
      projectScanErrors: { ...state.projectScanErrors, [projectId]: null },
    }));
    try {
      const scan = await api.scanSkills({ scope: 'project', projectId });
      set((state) => ({
        projectScans: { ...state.projectScans, [projectId]: scan },
        projectScanning: { ...state.projectScanning, [projectId]: false },
      }));
      if (announce) {
        get().pushToast({
          tone: 'success',
          title: '项目扫描完成',
          description: `${scan.stats.skillCount} 个技能`,
        });
      }
      return scan;
    } catch (error) {
      const normalized = normalizeError(error);
      set((state) => ({
        projectScanning: { ...state.projectScanning, [projectId]: false },
        projectScanErrors: { ...state.projectScanErrors, [projectId]: normalized },
      }));
      if (announce) {
        get().pushToast({
          tone: 'error',
          title: '项目扫描未完成',
          description: normalized.message,
        });
      }
      return null;
    }
  },

  scanContext: async (payload, options) => {
    if (payload.scope === 'global') return get().refreshGlobal(options);
    if (!payload.projectId) return null;
    return get().refreshProject(payload.projectId, options);
  },



  authorizeRoot: async (rootId, authorized) => {
    const bootstrap = await api.authorizeRoot(rootId, authorized);
    set({ bootstrap });
    const root = bootstrap.roots.find((item) => item.id === rootId);
    if (root?.scope === 'project' && root.projectId) {
      await get().refreshProject(root.projectId, { announce: false });
    } else {
      await get().refreshGlobal({ announce: false });
    }
    get().pushToast({
      tone: authorized ? 'success' : 'info',
      title: authorized ? '目录已授权' : '已撤销目录授权',
      description: `${root?.agentName ?? 'Agent'} · ${root?.displayPath ?? rootId}`,
    });
  },

  addProject: async (name, path) => {
    const project = await api.registerProject({ name: name || undefined, path });
    const bootstrap = await api.bootstrap();
    set({ bootstrap });
    get().pushToast({
      tone: 'success',
      title: '项目已登记',
      description: `${project.name} · ${project.path}`,
    });
    return project;
  },

  removeProject: async (projectId) => {
    const bootstrap = await api.removeProject(projectId);
    set((state) => {
      const projectScans = { ...state.projectScans };
      const projectScanning = { ...state.projectScanning };
      const projectScanErrors = { ...state.projectScanErrors };
      delete projectScans[projectId];
      delete projectScanning[projectId];
      delete projectScanErrors[projectId];
      return { bootstrap, projectScans, projectScanning, projectScanErrors };
    });
    await get().refreshGlobal({ announce: false });
    get().pushToast({
      tone: 'info',
      title: '项目登记已移除',
      description: '磁盘文件未删除',
    });
  },

  install: async (payload, agentName) => {
    const outcome = await api.installSkill(payload);
    await get().scanContext(
      { scope: payload.scope, projectId: payload.projectId ?? null },
      { announce: false },
    );
    if (outcome.replaced) {
      get().pushToast({
        tone: 'warning',
        title: `已覆盖同名内容并安装到 ${agentName}`,
        description: `${outcome.replacedDisplay ?? payload.skillName} 已删除 · ${mountLabel(outcome.mountType)}`,
      });
      return outcome;
    }
    get().pushToast({
      tone: outcome.mountType === 'copy' ? 'warning' : 'success',
      title: outcome.mountType === 'copy' ? '已安装（副本）' : `已安装到 ${agentName}`,
      description:
        outcome.mountType === 'copy'
          ? '系统不允许软链，已自动复制'
          : `${payload.skillName} · ${mountLabel(outcome.mountType)}`,
    });
    return outcome;
  },

  uninstall: async (payload, agentName) => {
    const outcome = await api.uninstallSkill(payload);
    await get().scanContext(
      { scope: payload.scope, projectId: payload.projectId ?? null },
      { announce: false },
    );
    get().pushToast({
      tone: 'success',
      title: `已从 ${agentName} 卸载`,
      description: outcome.message,
    });
    return outcome;
  },

  importSkill: async (payload) => {
    const outcome = await api.importSkill(payload);
    await get().refreshGlobal({ announce: false });
    if (payload.scope === 'project' && payload.projectId) {
      await get().refreshProject(payload.projectId, { announce: false });
    }
    get().pushToast({
      tone: 'success',
      title: '已纳入中央库',
      description: `${outcome.targetDisplay} · ${outcome.message}`,
    });
    return outcome;
  },

  preview: (payload) => api.previewSkill(payload),

  pushToast: (toast) => {
    const id = toastId();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    window.setTimeout(
      () => {
        get().dismissToast(id);
      },
      toast.tone === 'error' ? 6500 : 4200,
    );
    return id;
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
