import { create } from 'zustand';
import { api, normalizeError } from '../lib/bridge';
import { mountLabel } from '../lib/format';
import { readThemeCache, writeThemeCache } from '../lib/theme';
import { RELEASES_PAGE, checkForUpdates as runUpdateCheck, isNewerVersion } from '../lib/update';
import type {
  AddCustomAgentPayload,
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
  UpdateCheck,
  UpdateSettings,
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
  /** Latest update check result; restored from settings after a restart. */
  updateInfo: UpdateCheck | null;
  updateChecking: boolean;
  updateError: CmdError | null;
  initialize: () => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  checkForUpdates: (options?: { manual?: boolean }) => Promise<void>;
  maybeAutoCheckUpdates: () => void;
  skipUpdateVersion: (version: string) => Promise<void>;
  resumeUpdateReminders: () => Promise<void>;
  setAutoCheckUpdates: (enabled: boolean) => Promise<void>;
  refreshBootstrap: () => Promise<Bootstrap | null>;
  refreshGlobal: (options?: RefreshOptions) => Promise<ScanResult | null>;
  refreshProject: (projectId: string, options?: RefreshOptions) => Promise<ScanResult | null>;
  scanContext: (payload: ScanPayload, options?: RefreshOptions) => Promise<ScanResult | null>;
  authorizeRoot: (rootId: string, authorized: boolean) => Promise<void>;
  addCustomAgent: (payload: AddCustomAgentPayload) => Promise<void>;
  removeCustomAgent: (id: string) => Promise<void>;
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

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const useAppStore = create<AppState>((set, get) => {
  /** Persist update preferences and mirror the returned settings into bootstrap. */
  const persistUpdate = async (patch: Partial<UpdateSettings>) => {
    const bootstrap = get().bootstrap;
    if (!bootstrap) return;
    try {
      const settings = await api.saveUpdateSettings({
        ...bootstrap.settings.update,
        ...patch,
      });
      const current = get().bootstrap;
      if (current) set({ bootstrap: { ...current, settings } });
    } catch (error) {
      get().pushToast({
        tone: 'error',
        title: '保存更新设置失败',
        description: normalizeError(error).message,
      });
    }
  };

  return {
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
    updateInfo: null,
    updateChecking: false,
    updateError: null,

    initialize: async () => {
      set({ loading: true, fatal: null });
      try {
        const bootstrap = await api.bootstrap();
        const theme = bootstrap.settings.theme ?? 'system';
        writeThemeCache(theme);
        set({ bootstrap, loading: false, theme });
        // Restore the last known release so the sidebar badge survives a restart
        // even when the 24-hour auto-check window has not elapsed yet.
        const knownLatest = bootstrap.settings.update.latestVersion;
        if (knownLatest && isNewerVersion(knownLatest, bootstrap.appVersion)) {
          set({
            updateInfo: {
              currentVersion: bootstrap.appVersion,
              latestVersion: knownLatest,
              updateAvailable: true,
              releaseUrl: RELEASES_PAGE,
              publishedAt: null,
              checkedAt: bootstrap.settings.update.lastCheckedAt ?? '',
            },
          });
        }
        await get().refreshGlobal({ announce: false });
        get().maybeAutoCheckUpdates();
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

    addCustomAgent: async (payload) => {
      const bootstrap = await api.addCustomAgent(payload);
      set({ bootstrap });
      await get().refreshGlobal({ announce: false });
      const root = bootstrap.roots.find((item) => item.isCustom && item.agentName === payload.name);
      get().pushToast({
        tone: 'success',
        title: '自定义 Agent 已添加',
        description: root ? `${payload.name} · ${root.displayPath}` : payload.name,
      });
    },

    removeCustomAgent: async (id) => {
      const before = get().bootstrap?.roots.find((root) => root.agentId === id)?.agentName ?? id;
      const bootstrap = await api.removeCustomAgent(id);
      set({ bootstrap });
      await get().refreshGlobal({ announce: false });
      get().pushToast({
        tone: 'info',
        title: '已移除自定义 Agent',
        description: `${before} · 仅移除配置，磁盘目录未删除`,
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

    checkForUpdates: async (options = {}) => {
      const { manual = false } = options;
      const bootstrap = get().bootstrap;
      if (!bootstrap || get().updateChecking) return;
      set({ updateChecking: true, updateError: null });
      try {
        const info = await runUpdateCheck(bootstrap.appVersion);
        set({ updateInfo: info, updateChecking: false });
        const settings = get().bootstrap?.settings.update;
        const skipped = settings?.skippedVersion === info.latestVersion;
        const notified = settings?.lastNotifiedVersion === info.latestVersion;
        const shouldNotify = info.updateAvailable && !skipped && !notified;
        await persistUpdate({
          lastCheckedAt: info.checkedAt,
          latestVersion: info.latestVersion,
          ...(shouldNotify ? { lastNotifiedVersion: info.latestVersion } : {}),
        });
        if (shouldNotify) {
          get().pushToast({
            tone: 'info',
            title: `发现新版本 v${info.latestVersion}`,
            description: '前往「设置 → 关于」下载新版本',
          });
        } else if (manual && !info.updateAvailable) {
          get().pushToast({
            tone: 'success',
            title: '已是最新版本',
            description: `当前 v${info.currentVersion}`,
          });
        }
      } catch (error) {
        const normalized = normalizeError(error);
        set({ updateChecking: false, updateError: normalized });
        if (manual) {
          get().pushToast({
            tone: 'error',
            title: '检查更新失败',
            description: normalized.message,
          });
        }
      }
    },

    maybeAutoCheckUpdates: () => {
      const bootstrap = get().bootstrap;
      if (!bootstrap || !bootstrap.settings.update.autoCheck) return;
      const lastCheckedAt = bootstrap.settings.update.lastCheckedAt;
      if (lastCheckedAt) {
        const last = Date.parse(lastCheckedAt);
        const elapsed = Date.now() - last;
        if (Number.isFinite(last) && elapsed >= 0 && elapsed < AUTO_CHECK_INTERVAL_MS) return;
      }
      void get().checkForUpdates({ manual: false });
    },

    skipUpdateVersion: async (version) => {
      await persistUpdate({ skippedVersion: version });
      get().pushToast({
        tone: 'info',
        title: `已忽略 v${version}`,
        description: '有新版本时仍可在「设置 → 关于」查看',
      });
    },

    resumeUpdateReminders: async () => {
      await persistUpdate({ skippedVersion: null });
      get().pushToast({
        tone: 'info',
        title: '已恢复更新提醒',
        description: '发现新版本时会再次提示',
      });
    },

    setAutoCheckUpdates: async (enabled) => {
      await persistUpdate({ autoCheck: enabled });
      get().pushToast({
        tone: 'info',
        title: enabled ? '已开启自动检查更新' : '已关闭自动检查更新',
        description: enabled ? '启动后检查，每 24 小时最多一次' : '仍可在「设置 → 关于」手动检查',
      });
    },

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
  };
});
