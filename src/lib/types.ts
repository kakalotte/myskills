export type ScopeKind = 'global' | 'project';
export type MountType = 'symlink' | 'copy';
export type SkillSource = 'builtin' | 'imported' | 'external';
export type BadgeState = 'installed' | 'available' | 'origin' | 'conflict' | 'locked' | 'external';
/** UI color scheme. `system` follows the operating system. */
export type ThemePreference = 'light' | 'dark' | 'system';

export interface CmdError {
  code: string;
  message: string;
  detail?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

export interface Settings {
  schemaVersion: number;
  /** @deprecated No onboarding flow; kept for backward compatibility. */
  onboardingCompleted: boolean;
  /** UI color scheme; persisted in ~/.myskills/settings.json. */
  theme: ThemePreference;
  /** Explicit authorization overrides. Missing => follow default (authorized when root exists/detected). */
  authorizedRoots: Record<string, boolean>;
  projects: Project[];
  /** User-registered Agents (global scope only). */
  customAgents: CustomAgent[];
  /** @deprecated Not used as business state. */
  activeScope: ScopeKind;
  /** @deprecated Not used as business state. */
  activeProjectId: string | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  accent: string;
}

export interface RootInfo {
  id: string;
  agentId: string;
  agentName: string;
  scope: ScopeKind;
  projectId: string | null;
  projectName: string | null;
  path: string;
  displayPath: string;
  exists: boolean;
  authorized: boolean;
  skillCount: number;
  /** User-registered Agent rather than one from adapters.json. */
  isCustom: boolean;
  /** Asset path or data URL for a custom icon; null uses the built-in mapping. */
  iconSrc: string | null;
}

/** A user-registered Agent, stored in ~/.myskills/settings.json. */
export interface CustomAgent {
  id: string;
  name: string;
  path: string;
  /** 'builtin' | 'uploaded' | 'none'. */
  iconKind: string;
  /** Built-in icon filename, uploaded file extension, or empty. */
  iconValue: string;
  addedAt: string;
}

export interface AddCustomAgentPayload {
  name: string;
  path: string;
  iconKind: string;
  iconValue: string;
  /** Full data URL for an uploaded icon. */
  iconBase64: string | null;
  authorized: boolean;
}

export interface Bootstrap {
  settings: Settings;
  roots: RootInfo[];
  agents: AgentInfo[];
  centralStorePath: string;
  centralStoreDisplay: string;
  appVersion: string;
}

export interface AgentBadge {
  agentId: string;
  agentName: string;
  rootId: string;
  scope: ScopeKind;
  state: BadgeState;
  mountType: MountType | null;
  targetPath: string;
  targetDisplay: string;
  authorized: boolean;
  rootExists: boolean;
  detail: string | null;
}

export interface Occurrence {
  rootId: string;
  agentId: string;
  agentName: string;
  scope: ScopeKind;
  path: string;
  displayPath: string;
  mountType: MountType | null;
  isOrigin: boolean;
}

export interface SkillView {
  id: string;
  name: string;
  dirName: string;
  description: string;
  source: SkillSource;
  version: string | null;
  path: string;
  displayPath: string;
  isExternal: boolean;
  occurrences: Occurrence[];
  badges: AgentBadge[];
}

export interface ScanStats {
  skillCount: number;
  externalCount: number;
  installedMounts: number;
  conflictCount: number;
  agentCount: number;
  authorizedRootCount: number;
  rootCount: number;
}

export interface ScanDiff {
  firstScan: boolean;
  added: string[];
  removed: string[];
  changed: string[];
}

export interface ScanResult {
  skills: SkillView[];
  roots: RootInfo[];
  stats: ScanStats;
  diff: ScanDiff;
  centralStoreDisplay: string;
  scannedAt: string;
  scope: ScopeKind;
  activeProjectId: string | null;
}

export interface ScanPayload {
  scope: ScopeKind;
  projectId?: string | null;
}

export interface SkillPreview {
  name: string;
  raw: string;
  body: string;
  frontmatter: Record<string, unknown>;
  path: string;
  displayPath: string;
  isExternal: boolean;
  source: SkillSource;
}

export interface PreviewSkillPayload {
  skillName: string;
  scope?: ScopeKind | null;
  projectId?: string | null;
}

export interface MountOutcome {
  skillName: string;
  agentId: string;
  action: string;
  mountType: MountType;
  targetDisplay: string;
  alreadyInstalled: boolean;
  message: string;
  /** True when an existing same-name entry was deleted to make room for this mount. */
  replaced: boolean;
  /** Display path of the deleted entry, when `replaced` is true. */
  replacedDisplay: string | null;
}

export interface ImportOutcome {
  skillName: string;
  targetDisplay: string;
  message: string;
}

export interface InstallSkillPayload {
  skillName: string;
  agentId: string;
  scope: ScopeKind;
  projectId?: string | null;
  /** Delete an existing same-name entry in the target workspace before mounting. */
  force?: boolean;
}

export interface UninstallSkillPayload {
  skillName: string;
  agentId: string;
  scope: ScopeKind;
  projectId?: string | null;
  force?: boolean;
}

export interface ImportSkillPayload {
  skillName: string;
  scope: ScopeKind;
  projectId?: string | null;
}

export interface InstallSkillsOutcome {
  results: InstallMountResult[];
  succeeded: number;
  skipped: number;
  failed: number;
  message: string;
  /** How many of `succeeded` replaced a same-name entry. */
  replaced: number;
}

export interface InstallMountResult {
  skillName: string;
  agentId: string;
  agentName: string;
  state: string;
  mountType: string | null;
  targetDisplay: string;
  message: string;
  /** True when a same-name entry was deleted to make room for this mount. */
  replaced: boolean;
}

export interface InstallSkillItem {
  skillName: string;
  agentId: string;
}

export interface InstallSkillsPayload {
  items: InstallSkillItem[];
  scope: ScopeKind;
  projectId?: string | null;
  /** Delete same-name entries in target workspaces before mounting. */
  force?: boolean;
}

export interface DistributeBundlePayload {
  bundleId: string;
  targetAgentIds: string[];
  conflictStrategy?: string;
  scope: ScopeKind;
  projectId?: string | null;
}

export interface RegisterProjectPayload {
  name?: string;
  path: string;
}

export interface CreateSkillPayload {
  name: string;
  raw: string;
}

export interface CreateSkillOutcome {
  skillName: string;
  dirName: string;
  displayPath: string;
  message: string;
}

export interface Bundle {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  skillNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBundlePayload {
  name: string;
  slug: string;
  version: string;
  description: string;
}

export interface BundleOutcome {
  bundle: Bundle;
  message: string;
}

export interface UpdateBundlePayload {
  id: string;
  name?: string;
  slug?: string;
  version?: string;
  description?: string;
}

export interface BundleSkillPayload {
  bundleId: string;
  skillName: string;
}

export interface BundlesOutcome {
  bundles: Bundle[];
  message: string;
}

export interface SaveSkillPayload {
  skillName: string;
  raw: string;
}

export interface SaveSkillOutcome {
  skillName: string;
  displayPath: string;
  message: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: 'success' | 'error' | 'info' | 'warning';
}

export interface ExportBackupOutcome {
  backupName: string;
  filePath: string;
  fileSize: number;
  skillCount: number;
  installationCount: number;
  message: string;
}

export interface ExportBackupPayload {
  targetPath: string;
}

export interface ImportConflict {
  skillName: string;
  localVersion: string | null;
  localModifiedAt: string | null;
  inboundVersion: string | null;
  inboundPackagedAt: string | null;
  diff: string;
}

export interface ImportBackupOutcome {
  importedCount: number;
  skippedCount: number;
  conflicts: ImportConflict[];
  message: string;
}

export interface ImportBackupPayload {
  archivePath: string;
  conflictStrategy: string;
}

export interface DistributeResult {
  agentId: string;
  agentName: string;
  scope: string;
  state: string;
  mountType: string | null;
  targetDisplay: string;
  message: string;
}

export interface DistributeBundleOutcome {
  results: DistributeResult[];
  succeeded: number;
  skipped: number;
  failed: number;
  message: string;
}
