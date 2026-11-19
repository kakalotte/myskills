import { invoke } from '@tauri-apps/api/core';
import { demoApi } from './demo';
import type {
  Bootstrap,
  AddCustomAgentPayload,
  BundleOutcome,
  BundleSkillPayload,
  BundlesOutcome,
  CmdError,
  CreateBundlePayload,
  CreateSkillOutcome,
  CreateSkillPayload,
  DistributeBundleOutcome,
  DistributeBundlePayload,
  ExportBackupOutcome,
  ExportBackupPayload,
  ImportBackupOutcome,
  ImportBackupPayload,
  ImportOutcome,
  ImportSkillPayload,
  InstallSkillPayload,
  InstallSkillsOutcome,
  InstallSkillsPayload,
  MountOutcome,
  PreviewSkillPayload,
  Project,
  RegisterProjectPayload,
  SaveSkillOutcome,
  SaveSkillPayload,
  ScanPayload,
  ScanResult,
  Settings,
  SkillPreview,
  ThemePreference,
  UninstallSkillPayload,
  UpdateBundlePayload,
} from './types';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Browser-only preview with in-memory data. Never active inside the Tauri webview. */
export function isDemoMode(): boolean {
  if (isTauri()) return false;
  if (import.meta.env.VITE_DEMO === '1') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

export function normalizeError(error: unknown): CmdError {
  if (typeof error === 'string') {
    return { code: 'UNKNOWN', message: error };
  }
  if (error && typeof error === 'object') {
    const candidate = error as Partial<CmdError> & { detail?: unknown };
    if (typeof candidate.message === 'string') {
      return {
        code: typeof candidate.code === 'string' ? candidate.code : 'UNKNOWN',
        message: candidate.message,
        detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
      };
    }
  }
  return { code: 'UNKNOWN', message: '发生未知错误，请重试' };
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isDemoMode()) {
    return demoCall<T>(command, args);
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

async function demoCall<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const payload = (args.payload ?? args) as Record<string, unknown>;
  switch (command) {
    case 'bootstrap':
      return (await demoApi.bootstrap()) as T;
    case 'authorize_root':
      return (await demoApi.authorizeRoot(args.rootId as string, args.authorized as boolean)) as T;
    case 'add_custom_agent':
      return (await demoApi.addCustomAgent(payload as unknown as AddCustomAgentPayload)) as T;
    case 'remove_custom_agent':
      return (await demoApi.removeCustomAgent(args.id as string)) as T;
    case 'set_theme':
      return (await demoApi.setTheme(args.theme as ThemePreference)) as T;
    case 'register_project':
      return (await demoApi.registerProject(payload as unknown as RegisterProjectPayload)) as T;
    case 'remove_project':
      return (await demoApi.removeProject(args.projectId as string)) as T;
    case 'scan_skills':
      return (await demoApi.scanSkills(payload as unknown as ScanPayload)) as T;
    case 'preview_skill':
      return (await demoApi.previewSkill(payload as unknown as PreviewSkillPayload)) as T;
    case 'install_skill':
      return (await demoApi.installSkill(payload as unknown as InstallSkillPayload)) as T;
    case 'uninstall_skill':
      return (await demoApi.uninstallSkill(payload as unknown as UninstallSkillPayload)) as T;
    case 'import_skill':
      return (await demoApi.importSkill(payload as unknown as ImportSkillPayload)) as T;
    case 'save_skill':
      return (await demoApi.saveSkill(payload as unknown as SaveSkillPayload)) as T;
    case 'create_skill':
      return (await demoApi.createSkill(payload as unknown as CreateSkillPayload)) as T;
    case 'install_skills':
      return (await demoApi.installSkills(payload as unknown as InstallSkillsPayload)) as T;
    case 'list_bundles':
      return (await demoApi.listBundles()) as T;
    case 'create_bundle':
      return (await demoApi.createBundle(payload as unknown as CreateBundlePayload)) as T;
    case 'update_bundle':
      return (await demoApi.updateBundle(payload as unknown as UpdateBundlePayload)) as T;
    case 'delete_bundle':
      return (await demoApi.deleteBundle(args.bundleId as string)) as T;
    case 'add_skill_to_bundle':
      return (await demoApi.addSkillToBundle(payload as unknown as BundleSkillPayload)) as T;
    case 'remove_skill_from_bundle':
      return (await demoApi.removeSkillFromBundle(payload as unknown as BundleSkillPayload)) as T;
    case 'distribute_bundle':
      return (await demoApi.distributeBundle(
        payload as unknown as DistributeBundlePayload,
      )) as T;
    default:
      throw normalizeError({ code: 'DEMO_UNSUPPORTED', message: `演示模式不支持：${command}` });
  }
}

export const api = {
  bootstrap: () => call<Bootstrap>('bootstrap'),
  authorizeRoot: (rootId: string, authorized: boolean) =>
    call<Bootstrap>('authorize_root', { rootId, authorized }),
  addCustomAgent: (payload: AddCustomAgentPayload) =>
    call<Bootstrap>('add_custom_agent', { payload }),
  removeCustomAgent: (id: string) => call<Bootstrap>('remove_custom_agent', { id }),
  setTheme: (theme: ThemePreference) => call<Settings>('set_theme', { theme }),
  registerProject: (payload: RegisterProjectPayload) =>
    call<Project>('register_project', { payload }),
  removeProject: (projectId: string) => call<Bootstrap>('remove_project', { projectId }),
  scanSkills: (payload: ScanPayload) => call<ScanResult>('scan_skills', { payload }),
  previewSkill: (payload: PreviewSkillPayload) => call<SkillPreview>('preview_skill', { payload }),
  installSkill: (payload: InstallSkillPayload) => call<MountOutcome>('install_skill', { payload }),
  uninstallSkill: (payload: UninstallSkillPayload) =>
    call<MountOutcome>('uninstall_skill', { payload }),
  importSkill: (payload: ImportSkillPayload) => call<ImportOutcome>('import_skill', { payload }),
  saveSkill: (payload: SaveSkillPayload) => call<SaveSkillOutcome>('save_skill', { payload }),
  createSkill: (payload: CreateSkillPayload) =>
    call<CreateSkillOutcome>('create_skill', { payload }),
  installSkills: (payload: InstallSkillsPayload) =>
    call<InstallSkillsOutcome>('install_skills', { payload }),
  listBundles: () => call<BundlesOutcome>('list_bundles'),
  createBundle: (payload: CreateBundlePayload) => call<BundleOutcome>('create_bundle', { payload }),
  updateBundle: (payload: UpdateBundlePayload) => call<BundleOutcome>('update_bundle', { payload }),
  deleteBundle: (bundleId: string) => call<void>('delete_bundle', { bundleId }),
  addSkillToBundle: (payload: BundleSkillPayload) =>
    call<BundleOutcome>('add_skill_to_bundle', { payload }),
  removeSkillFromBundle: (payload: BundleSkillPayload) =>
    call<BundleOutcome>('remove_skill_from_bundle', { payload }),
  distributeBundle: (payload: DistributeBundlePayload) =>
    call<DistributeBundleOutcome>('distribute_bundle', { payload }),
  exportBackup: (payload: ExportBackupPayload) =>
    call<ExportBackupOutcome>('export_backup', { payload }),
  importBackup: (payload: ImportBackupPayload) =>
    call<ImportBackupOutcome>('import_backup', { payload }),
};
