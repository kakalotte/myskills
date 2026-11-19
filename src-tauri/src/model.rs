use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SETTINGS_SCHEMA_VERSION: u32 = 2;
pub const MANIFEST_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ScopeKind {
    #[default]
    Global,
    Project,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MountType {
    Symlink,
    Copy,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillSource {
    Builtin,
    Imported,
    External,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub added_at: String,
}

/// UI color scheme preference. Persisted so the app opens in the same mode.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    Light,
    Dark,
    /// Follow the operating system.
    #[default]
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: u32,
    pub onboarding_completed: bool,
    #[serde(default)]
    pub theme: ThemePreference,
    /// Explicit authorization overrides. Missing => follow default (authorized when root exists/detected).
    #[serde(default)]
    pub authorized_roots: BTreeMap<String, bool>,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub active_scope: ScopeKind,
    #[serde(default)]
    pub active_project_id: Option<String>,
    /// User-defined Agent directories. Global scope only; not part of adapters.json.
    #[serde(default)]
    pub custom_agents: Vec<CustomAgent>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            onboarding_completed: false,
            theme: ThemePreference::System,
            authorized_roots: BTreeMap::new(),
            projects: Vec::new(),
            active_scope: ScopeKind::Global,
            active_project_id: None,
            custom_agents: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMeta {
    pub name: String,
    pub source: SkillSource,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub id: String,
    pub skill_name: String,
    pub agent_id: String,
    pub root_id: String,
    pub scope: ScopeKind,
    pub mount_type: MountType,
    pub target_path: String,
    #[serde(default)]
    pub target_fingerprint: Option<String>,
    pub installed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: u32,
    #[serde(default)]
    pub exported_at: Option<String>,
    #[serde(default)]
    pub skills: Vec<SkillMeta>,
    #[serde(default)]
    pub installations: Vec<Installation>,
    #[serde(default)]
    pub bundles: Vec<Bundle>,
}

impl Default for Manifest {
    fn default() -> Self {
        Self {
            schema_version: MANIFEST_SCHEMA_VERSION,
            exported_at: None,
            skills: Vec::new(),
            installations: Vec::new(),
            bundles: Vec::new(),
        }
    }
}

impl Manifest {
    pub fn skill(&self, name: &str) -> Option<&SkillMeta> {
        self.skills.iter().find(|skill| skill.name == name)
    }

    pub fn skill_mut(&mut self, name: &str) -> Option<&mut SkillMeta> {
        self.skills.iter_mut().find(|skill| skill.name == name)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub accent: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootInfo {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub scope: ScopeKind,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub path: String,
    pub display_path: String,
    pub exists: bool,
    pub authorized: bool,
    pub skill_count: usize,
    /// True for an Agent registered by the user rather than by adapters.json.
    #[serde(default)]
    pub is_custom: bool,
    /// Image URL for a custom icon (asset path or data URL); None uses the built-in mapping.
    #[serde(default)]
    pub icon_src: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub roots: Vec<RootInfo>,
    pub agents: Vec<AgentInfo>,
    pub central_store_path: String,
    pub central_store_display: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BadgeState {
    Installed,
    Available,
    Origin,
    Conflict,
    Locked,
    External,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBadge {
    pub agent_id: String,
    pub agent_name: String,
    pub root_id: String,
    pub scope: ScopeKind,
    pub state: BadgeState,
    pub mount_type: Option<MountType>,
    pub target_path: String,
    pub target_display: String,
    pub authorized: bool,
    pub root_exists: bool,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Occurrence {
    pub root_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub scope: ScopeKind,
    pub path: String,
    pub display_path: String,
    pub mount_type: Option<MountType>,
    pub is_origin: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillView {
    pub id: String,
    pub name: String,
    pub dir_name: String,
    pub description: String,
    pub source: SkillSource,
    pub version: Option<String>,
    pub path: String,
    pub display_path: String,
    pub is_external: bool,
    pub occurrences: Vec<Occurrence>,
    pub badges: Vec<AgentBadge>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStats {
    pub skill_count: usize,
    pub external_count: usize,
    pub installed_mounts: usize,
    pub conflict_count: usize,
    pub agent_count: usize,
    pub authorized_root_count: usize,
    pub root_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDiff {
    pub first_scan: bool,
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub changed: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub skills: Vec<SkillView>,
    pub roots: Vec<RootInfo>,
    pub stats: ScanStats,
    pub diff: ScanDiff,
    pub central_store_display: String,
    pub scanned_at: String,
    pub scope: ScopeKind,
    pub active_project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPreview {
    pub name: String,
    pub raw: String,
    pub body: String,
    pub frontmatter: serde_json::Value,
    pub path: String,
    pub display_path: String,
    pub is_external: bool,
    pub source: SkillSource,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MountOutcome {
    pub skill_name: String,
    pub agent_id: String,
    pub action: String,
    pub mount_type: MountType,
    pub target_display: String,
    pub already_installed: bool,
    pub message: String,
    /// True when an existing same-name entry was deleted to make room for this mount.
    #[serde(default)]
    pub replaced: bool,
    /// Display path of the deleted entry, when `replaced` is true.
    #[serde(default)]
    pub replaced_display: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillItem {
    pub skill_name: String,
    pub agent_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillsPayload {
    pub items: Vec<InstallSkillItem>,
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
    /// Delete same-name entries in target workspaces before mounting.
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallMountResult {
    pub skill_name: String,
    pub agent_id: String,
    pub agent_name: String,
    pub state: String,
    pub mount_type: Option<String>,
    pub target_display: String,
    pub message: String,
    /// True when a same-name entry was deleted to make room for this mount.
    #[serde(default)]
    pub replaced: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillsOutcome {
    pub results: Vec<InstallMountResult>,
    pub succeeded: usize,
    pub skipped: usize,
    pub failed: usize,
    pub message: String,
    /// How many of `succeeded` replaced a same-name entry.
    #[serde(default)]
    pub replaced: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub skill_name: String,
    pub target_display: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterProjectPayload {
    #[serde(default)]
    pub name: Option<String>,
    pub path: String,
}

/// A user-registered Agent. Icons are either a built-in asset filename
/// (`builtin`), an uploaded file extension stored under `custom-icons/`
/// (`uploaded`), or unset (`none`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgent {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon_kind: String,
    #[serde(default)]
    pub icon_value: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddCustomAgentPayload {
    pub name: String,
    pub path: String,
    pub icon_kind: String,
    #[serde(default)]
    pub icon_value: String,
    /// Full `data:` URL for an uploaded icon; the backend decodes the base64 part.
    #[serde(default)]
    pub icon_base64: Option<String>,
    pub authorized: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPayload {
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeContextPayload {
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillContextPayload {
    pub skill_name: String,
    pub agent_id: String,
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillPayload {
    pub skill_name: String,
    pub agent_id: String,
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
    /// Delete an existing same-name entry in the target workspace before mounting.
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallSkillPayload {
    pub skill_name: String,
    pub agent_id: String,
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSkillPayload {
    pub skill_name: String,
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSkillPayload {
    pub skill_name: String,
    #[serde(default)]
    pub scope: Option<ScopeKind>,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSkillPayload {
    pub skill_name: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSkillOutcome {
    pub skill_name: String,
    pub display_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillPayload {
    pub name: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillOutcome {
    pub skill_name: String,
    pub dir_name: String,
    pub display_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub version: String,
    pub description: String,
    #[serde(default)]
    pub skill_names: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBundlePayload {
    pub name: String,
    pub slug: String,
    pub version: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleOutcome {
    pub bundle: Bundle,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBundlePayload {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleSkillPayload {
    pub bundle_id: String,
    pub skill_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundlesOutcome {
    pub bundles: Vec<Bundle>,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBackupPayload {
    pub target_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBackupOutcome {
    pub backup_name: String,
    pub file_path: String,
    pub file_size: usize,
    pub skill_count: usize,
    pub installation_count: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConflict {
    pub skill_name: String,
    pub local_version: Option<String>,
    pub local_modified_at: Option<String>,
    pub inbound_version: Option<String>,
    pub inbound_packaged_at: Option<String>,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupOutcome {
    pub imported_count: usize,
    pub skipped_count: usize,
    pub conflicts: Vec<ImportConflict>,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupPayload {
    pub archive_path: String,
    pub conflict_strategy: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributeBundlePayload {
    pub bundle_id: String,
    #[serde(default)]
    pub target_agent_ids: Vec<String>,
    #[serde(default)]
    pub conflict_strategy: String,
    pub scope: ScopeKind,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributeResult {
    pub agent_id: String,
    pub agent_name: String,
    pub scope: String,
    pub state: String,
    pub mount_type: Option<String>,
    pub target_display: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributeBundleOutcome {
    pub results: Vec<DistributeResult>,
    pub succeeded: usize,
    pub skipped: usize,
    pub failed: usize,
    pub message: String,
}
