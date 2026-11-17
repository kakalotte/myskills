use crate::error::{CmdError, CmdResult};
use crate::model::AgentInfo;
use crate::paths::{AppPaths, clean_path};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Debug, Clone, Deserialize)]
pub struct AdapterConfig {
    #[allow(dead_code)]
    pub schema: u32,
    pub adapters: Vec<AdapterDef>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdapterDef {
    pub id: String,
    pub name: String,
    #[allow(dead_code)]
    pub category: String,
    pub global_dir: String,
    pub detect_dir: String,
    pub project_dir: String,
    #[serde(default)]
    pub extra_scan_dirs: Vec<String>,
    #[serde(default)]
    pub recursive_scan: bool,
    #[serde(default)]
    pub windows_global_dir: Option<String>,
    #[serde(default)]
    pub shared_discovery_only: bool,
    #[serde(default)]
    pub scopes: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub deploy_mode: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub notes: String,
}

impl AdapterDef {
    pub fn supports_global(&self) -> bool {
        self.scopes.is_empty() || self.scopes.iter().any(|s| s == "global")
    }

    pub fn supports_project(&self) -> bool {
        self.scopes.is_empty() || self.scopes.iter().any(|s| s == "project")
    }

    /// Resolve the primary global skills root for this adapter.
    /// On Windows, `windows_global_dir` (e.g. `APPDATA/opencode/skills`) takes precedence.
    pub fn resolve_global_path(&self, paths: &AppPaths) -> PathBuf {
        #[cfg(windows)]
        {
            if let Some(win) = self.windows_global_dir.as_deref()
                && let Some(rest) = win
                    .strip_prefix("APPDATA/")
                    .or_else(|| win.strip_prefix("APPDATA\\"))
            {
                if let Some(base) = std::env::var_os("APPDATA").filter(|v| !v.is_empty()) {
                    return clean_path(&PathBuf::from(base).join(rest));
                }
                // Fallback: %USERPROFILE%\AppData\Roaming
                return clean_path(&paths.home.join("AppData").join("Roaming").join(rest));
            }
        }
        clean_path(&paths.home.join(&self.global_dir))
    }

    pub fn resolve_project_path(&self, project_path: &Path) -> PathBuf {
        clean_path(&project_path.join(&self.project_dir))
    }

    /// Legacy compatibility paths that may contain existing installs outside the canonical path.
    pub fn legacy_global_paths(&self, paths: &AppPaths) -> Vec<PathBuf> {
        let mut out = Vec::new();
        // Cursor moved global root in older mySkills builds.
        if self.id == "cursor" {
            let legacy = clean_path(&paths.home.join(".cursor/extensions/skills"));
            if legacy != self.resolve_global_path(paths) {
                out.push(legacy);
            }
        }
        out
    }

    /// Additional global directories to scan (read-only discovery), if any.
    pub fn extra_global_scan_paths(&self, paths: &AppPaths) -> Vec<(PathBuf, bool)> {
        self.extra_scan_dirs
            .iter()
            .map(|dir| {
                (
                    clean_path(&paths.home.join(dir)),
                    self.shared_discovery_only,
                )
            })
            .collect()
    }
}

static CONFIG: OnceLock<AdapterConfig> = OnceLock::new();

fn load_config() -> &'static AdapterConfig {
    CONFIG.get_or_init(|| {
        let raw = include_str!("../resources/adapters.json");
        serde_json::from_str::<AdapterConfig>(raw).unwrap_or(AdapterConfig {
            schema: 1,
            adapters: Vec::new(),
        })
    })
}

pub fn all_adapters() -> &'static [AdapterDef] {
    &load_config().adapters
}

pub fn find_adapter(id: &str) -> Option<&'static AdapterDef> {
    // Accept legacy ids for migration/compat lookups.
    let canonical = canonical_agent_id(id);
    all_adapters().iter().find(|a| a.id == canonical)
}

pub fn agent_info() -> Vec<AgentInfo> {
    all_adapters()
        .iter()
        .map(|a| AgentInfo {
            id: a.id.clone(),
            name: a.name.clone(),
            icon: a.id.clone(),
            accent: accent_for(&a.id).to_string(),
        })
        .collect()
}

pub fn global_root_id(agent_id: &str) -> String {
    format!("agent:{agent_id}:global")
}

pub fn project_root_id(agent_id: &str, project_id: &str) -> String {
    format!("agent:{agent_id}:project:{project_id}")
}

/// Map legacy mySkills agent ids/root-id fragments to adapters.json ids.
pub fn canonical_agent_id(id: &str) -> &str {
    match id {
        "claude" => "claude_code",
        other => other,
    }
}

/// Map a legacy root id to the canonical adapters-based root id.
pub fn canonical_root_id(root_id: &str) -> String {
    // forms: agent:<agent>:global | agent:<agent>:project:<projectId>
    let Some(rest) = root_id.strip_prefix("agent:") else {
        return root_id.to_string();
    };
    let parts: Vec<&str> = rest.split(':').collect();
    if parts.len() == 2 && parts[1] == "global" {
        return format!("agent:{}:global", canonical_agent_id(parts[0]));
    }
    if parts.len() >= 3 && parts[1] == "project" {
        let project = parts[2..].join(":");
        return format!("agent:{}:project:{}", canonical_agent_id(parts[0]), project);
    }
    root_id.to_string()
}

fn accent_for(id: &str) -> &'static str {
    match id {
        "claude_code" => "primary",
        "cursor" => "tertiary",
        "workbuddy" | "workbuddy_overseas" => "secondary",
        _ => "primary",
    }
}

/// Validate that adapters config is available and non-empty.
pub fn ensure_loaded() -> CmdResult<()> {
    if all_adapters().is_empty() {
        return Err(CmdError::new(
            "ADAPTERS_EMPTY",
            "未能加载 Agent 路径配置（adapters.json）",
        ));
    }
    Ok(())
}
