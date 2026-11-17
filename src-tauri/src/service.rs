use crate::adapters::{self, AdapterDef};
use crate::error::{CmdError, CmdResult};
use crate::fsutil::{
    copy_dir_all, create_dir_symlink, create_zip_archive, extract_zip_archive, read_json_or,
    remove_symlink, write_file, write_json,
};
use crate::model::*;
use crate::paths::{AppPaths, clean_path, is_under, path_key, short_hash};
use crate::skill::{ParsedSkill, dir_fingerprint, parse_skill_text, read_skill_dir};
use chrono::{Local, SecondsFormat};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LastScanFile {
    #[serde(default)]
    scopes: BTreeMap<String, BTreeMap<String, String>>,
}

pub struct AppService {
    pub paths: AppPaths,
    lock: Mutex<()>,
}

struct RootTarget<'a> {
    id: String,
    adapter: &'a AdapterDef,
    scope: ScopeKind,
    project_id: Option<String>,
    project_name: Option<&'a str>,
    path: PathBuf,
}

impl AppService {
    pub fn new(paths: AppPaths) -> CmdResult<Self> {
        paths
            .ensure()
            .map_err(|error| CmdError::io("无法初始化应用数据目录", error))?;
        let service = Self {
            paths,
            lock: Mutex::new(()),
        };

        adapters::ensure_loaded()?;

        let mut settings: Settings = read_json_or(&service.paths.settings, Settings::default())?;
        let mut manifest: Manifest = read_json_or(&service.paths.manifest, Manifest::default())?;
        let mut dirty_settings = service.repair_scope(&mut settings);
        let mut dirty_manifest = !service.paths.manifest.exists();
        let migrated = service.migrate_legacy_agent_ids(&mut settings, &mut manifest);
        dirty_settings |= migrated;
        dirty_manifest |= migrated;
        dirty_settings |= service.migrate_authorization_model(&mut settings);
        dirty_settings |= service.normalize_authorization_overrides(&mut settings);

        if dirty_settings || !service.paths.settings.exists() {
            write_json(&service.paths.settings, &settings)?;
        }
        if dirty_manifest {
            write_json(&service.paths.manifest, &manifest)?;
        }

        Ok(service)
    }

    pub fn bootstrap(&self) -> CmdResult<Bootstrap> {
        let _guard = self.lock()?;
        let mut settings = self.load_settings()?;
        let mut manifest = self.load_manifest()?;
        let mut dirty_settings = self.repair_scope(&mut settings);
        let migrated = self.migrate_legacy_agent_ids(&mut settings, &mut manifest);
        dirty_settings |= migrated;
        dirty_settings |= self.migrate_authorization_model(&mut settings);
        dirty_settings |= self.normalize_authorization_overrides(&mut settings);
        if dirty_settings {
            self.save_settings(&settings)?;
        }
        if migrated {
            self.save_manifest(&manifest)?;
        }
        Ok(self.bootstrap_value(&settings))
    }

    pub fn authorize_root(&self, root_id: &str, authorized: bool) -> CmdResult<Bootstrap> {
        let _guard = self.lock()?;
        let mut settings = self.load_settings()?;
        let roots = self.all_roots(&settings);
        let root = roots
            .iter()
            .find(|root| root.id == root_id)
            .ok_or_else(|| CmdError::new("UNKNOWN_ROOT", "未找到该 Agent 目录"))?;
        let default_authorized = root.exists;
        if authorized == default_authorized {
            settings.authorized_roots.remove(root_id);
        } else {
            settings
                .authorized_roots
                .insert(root_id.to_string(), authorized);
        }
        self.save_settings(&settings)?;
        drop(_guard);
        self.bootstrap()
    }

    pub fn set_theme(&self, theme: ThemePreference) -> CmdResult<Settings> {
        let _guard = self.lock()?;
        let mut settings = self.load_settings()?;
        if settings.theme != theme {
            settings.theme = theme;
            self.save_settings(&settings)?;
        }
        Ok(settings)
    }

    pub fn register_project(&self, payload: RegisterProjectPayload) -> CmdResult<Project> {
        let _guard = self.lock()?;
        if payload.path.trim().is_empty() {
            return Err(CmdError::new("INVALID_PATH", "请选择项目根目录"));
        }
        let raw_path = self.paths.parse_project_path(&payload.path);
        let canonical = raw_path.canonicalize().map_err(|error| {
            CmdError::new("PATH_MISSING", "项目目录不存在或无法访问").with_detail(error.to_string())
        })?;
        let canonical = clean_path(&canonical);
        if !canonical.is_dir() {
            return Err(CmdError::new("INVALID_PATH", "项目路径必须是目录"));
        }
        fs::read_dir(&canonical).map_err(|error| {
            CmdError::new("PATH_UNREADABLE", "项目目录不可读").with_detail(error.to_string())
        })?;

        let mut settings = self.load_settings()?;
        let key = path_key(&canonical);
        if settings
            .projects
            .iter()
            .any(|project| path_key(Path::new(&project.path)) == key)
        {
            return Err(CmdError::new("PROJECT_EXISTS", "该项目目录已登记"));
        }

        let name = payload
            .name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| {
                canonical
                    .file_name()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or_else(|| "未命名项目".to_string())
            });

        let project = Project {
            id: format!("proj_{}", short_hash(&format!("{key}:{}", now()))),
            name,
            path: canonical.to_string_lossy().to_string(),
            added_at: now(),
        };
        settings.projects.push(project.clone());

        // Existing project roots are authorized by default when detected (exists => authorized).
        // Do not force overrides so explicit user choices remain consistent.

        self.save_settings(&settings)?;
        Ok(project)
    }

    pub fn remove_project(&self, project_id: &str) -> CmdResult<Bootstrap> {
        let _guard = self.lock()?;
        let mut settings = self.load_settings()?;
        let before = settings.projects.len();
        settings.projects.retain(|project| project.id != project_id);
        if settings.projects.len() == before {
            return Err(CmdError::new("UNKNOWN_PROJECT", "项目不存在"));
        }

        let prefix = format!(":project:{project_id}");
        settings
            .authorized_roots
            .retain(|root_id, _| !root_id.ends_with(&prefix));

        // active scope/project are not used as business state
        settings.active_scope = ScopeKind::Global;
        settings.active_project_id = None;
        self.save_settings(&settings)?;

        let mut manifest = self.load_manifest()?;
        let before_installations = manifest.installations.len();
        manifest
            .installations
            .retain(|installation| !installation.root_id.ends_with(&prefix));
        if manifest.installations.len() != before_installations {
            self.save_manifest(&manifest)?;
        }
        drop(_guard);
        self.bootstrap()
    }

    // ---------------------------------------------------------------------
    // Scan
    // ---------------------------------------------------------------------

    pub fn scan_skills(&self, payload: ScanPayload) -> CmdResult<ScanResult> {
        let _guard = self.lock()?;
        let mut settings = self.load_settings()?;
        if self.repair_scope(&mut settings) {
            self.save_settings(&settings)?;
        }

        let scope = payload.scope;
        let project_id = payload.project_id.clone();
        let context_roots = self.roots_for_context(&settings, scope, project_id.as_deref())?;

        let mut manifest = self.load_manifest()?;
        let mut manifest_dirty = false;

        // Authorization controls visibility in other modules. Filesystem scan/IO still requires exists.
        let active_roots: Vec<RootInfo> = context_roots
            .into_iter()
            .filter(|root| root.authorized)
            .collect();

        let mut root_counts: BTreeMap<String, usize> = BTreeMap::new();
        let mut fingerprints: BTreeMap<String, String> = BTreeMap::new();
        let mut central: Vec<SkillView> = Vec::new();
        let mut central_by_name: BTreeMap<String, usize> = BTreeMap::new();
        let mut external_by_name: BTreeMap<String, SkillView> = BTreeMap::new();
        let mut external_conflicts: BTreeSet<String> = BTreeSet::new();

        // --- central store -------------------------------------------------
        if self.paths.store.is_dir() {
            let mut entries: Vec<PathBuf> = fs::read_dir(&self.paths.store)
                .map_err(|error| CmdError::io("无法读取中央库目录", error))?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .collect();
            entries.sort_by_key(|path| path.file_name().map(|name| name.to_os_string()));

            for path in entries {
                let metadata = match fs::symlink_metadata(&path) {
                    Ok(metadata) => metadata,
                    Err(_) => continue,
                };
                if metadata.file_type().is_symlink() || !path.is_dir() {
                    continue;
                }
                let dir_name = path
                    .file_name()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or_default();
                if dir_name.starts_with('.') || !safe_component(&dir_name) {
                    continue;
                }
                let parsed = match read_skill_dir(&path, &dir_name) {
                    Ok(parsed) => parsed,
                    Err(_) => continue,
                };

                if central_by_name.contains_key(&parsed.name) {
                    continue;
                }

                let meta = match manifest.skill(&parsed.name).cloned() {
                    Some(meta) => meta,
                    None => {
                        let stamp = now();
                        let meta = SkillMeta {
                            name: parsed.name.clone(),
                            source: SkillSource::Builtin,
                            created_at: stamp.clone(),
                            updated_at: stamp,
                        };
                        manifest.skills.push(meta.clone());
                        manifest_dirty = true;
                        meta
                    }
                };

                let id = format!("central:{dir_name}");
                fingerprints.insert(id.clone(), parsed.fingerprint.clone());
                central_by_name.insert(parsed.name.clone(), central.len());
                central.push(SkillView {
                    id,
                    name: parsed.name.clone(),
                    dir_name,
                    description: parsed.description.clone(),
                    source: meta.source,
                    version: parsed.version.clone(),
                    path: path.to_string_lossy().to_string(),
                    display_path: self.paths.display(&path),
                    is_external: false,
                    occurrences: Vec::new(),
                    badges: Vec::new(),
                });
            }
        }

        // --- authorized Agent roots ---------------------------------------
        for root in &active_roots {
            if !root.exists {
                root_counts.insert(root.id.clone(), 0);
                continue;
            }
            let dir = PathBuf::from(&root.path);
            let mut entries: Vec<PathBuf> = match fs::read_dir(&dir) {
                Ok(entries) => entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path())
                    .collect(),
                Err(_) => {
                    root_counts.insert(root.id.clone(), 0);
                    continue;
                }
            };
            entries.sort_by_key(|path| path.file_name().map(|name| name.to_os_string()));

            let mut skill_count = 0usize;
            for path in entries {
                let dir_name = match path.file_name() {
                    Some(value) => value.to_string_lossy().to_string(),
                    None => continue,
                };
                if dir_name.starts_with('.') || !path.is_dir() {
                    continue;
                }
                if !path.join("SKILL.md").is_file() {
                    continue;
                }
                skill_count += 1;

                let link_metadata = fs::symlink_metadata(&path).ok();
                let is_link = link_metadata
                    .as_ref()
                    .map(|metadata| metadata.file_type().is_symlink())
                    .unwrap_or(false);
                if is_link
                    && path
                        .canonicalize()
                        .is_ok_and(|canonical| is_under(&self.paths.store, &canonical))
                {
                    // Managed symlink: badge comes from central skill.
                    continue;
                }

                let parsed = match read_skill_dir(&path, &dir_name) {
                    Ok(parsed) => parsed,
                    Err(_) => continue,
                };

                let managed_copy = manifest.installations.iter().any(|installation| {
                    installation.root_id == root.id
                        && installation.skill_name == parsed.name
                        && installation.mount_type == MountType::Copy
                        && path_key(Path::new(&installation.target_path)) == path_key(&path)
                });

                if let Some(index) = central_by_name.get(&parsed.name).copied() {
                    let occurrence = Occurrence {
                        root_id: root.id.clone(),
                        agent_id: root.agent_id.clone(),
                        agent_name: root.agent_name.clone(),
                        scope: root.scope,
                        path: path.to_string_lossy().to_string(),
                        display_path: self.paths.display(&path),
                        mount_type: if managed_copy {
                            Some(MountType::Copy)
                        } else {
                            None
                        },
                        is_origin: !managed_copy,
                    };
                    central[index].occurrences.push(occurrence);
                    if !managed_copy {
                        external_conflicts.insert(parsed.name.clone());
                    }
                    continue;
                }

                let id = format!("external:{}", short_hash(&path_key(&path)));
                let occurrence = Occurrence {
                    root_id: root.id.clone(),
                    agent_id: root.agent_id.clone(),
                    agent_name: root.agent_name.clone(),
                    scope: root.scope,
                    path: path.to_string_lossy().to_string(),
                    display_path: self.paths.display(&path),
                    mount_type: None,
                    is_origin: true,
                };
                if let Some(existing) = external_by_name.get_mut(&parsed.name) {
                    existing.occurrences.push(occurrence);
                } else {
                    fingerprints.insert(id.clone(), parsed.fingerprint.clone());
                    external_by_name.insert(
                        parsed.name.clone(),
                        SkillView {
                            id,
                            name: parsed.name.clone(),
                            dir_name,
                            description: parsed.description.clone(),
                            source: SkillSource::External,
                            version: parsed.version.clone(),
                            path: path.to_string_lossy().to_string(),
                            display_path: self.paths.display(&path),
                            is_external: true,
                            occurrences: vec![occurrence],
                            badges: Vec::new(),
                        },
                    );
                }
            }
            root_counts.insert(root.id.clone(), skill_count);
        }

        // --- reconcile installation records with the disk ------------------
        let before_reconcile = manifest.installations.len();
        manifest.installations.retain(|installation| {
            let target = Path::new(&installation.target_path);
            if !target.exists() {
                return false;
            }
            if installation.mount_type == MountType::Symlink {
                return target
                    .canonicalize()
                    .map(|canonical| is_under(&self.paths.store, &canonical))
                    .unwrap_or(false);
            }
            true
        });
        if manifest.installations.len() != before_reconcile {
            manifest_dirty = true;
        }

        // --- badges --------------------------------------------------------
        for skill in &mut central {
            let conflict_from_external = external_conflicts.contains(&skill.name);
            let badges: Vec<AgentBadge> = active_roots
                .iter()
                .map(|root| self.central_badge(skill, root, &manifest, conflict_from_external))
                .collect();
            skill.badges = badges;
            skill
                .occurrences
                .sort_by(|a, b| a.agent_name.cmp(&b.agent_name));
        }
        for skill in external_by_name.values_mut() {
            let badges: Vec<AgentBadge> = active_roots
                .iter()
                .map(|root| {
                    if let Some(occurrence) = skill
                        .occurrences
                        .iter()
                        .find(|occurrence| occurrence.root_id == root.id)
                    {
                        AgentBadge {
                            agent_id: root.agent_id.clone(),
                            agent_name: root.agent_name.clone(),
                            root_id: root.id.clone(),
                            scope: root.scope,
                            state: BadgeState::Origin,
                            mount_type: occurrence.mount_type,
                            target_path: occurrence.path.clone(),
                            target_display: occurrence.display_path.clone(),
                            authorized: root.authorized,
                            root_exists: root.exists,
                            detail: Some("外部原件（只读）".to_string()),
                        }
                    } else {
                        AgentBadge {
                            agent_id: root.agent_id.clone(),
                            agent_name: root.agent_name.clone(),
                            root_id: root.id.clone(),
                            scope: root.scope,
                            state: BadgeState::External,
                            mount_type: None,
                            target_path: root.path.clone(),
                            target_display: root.display_path.clone(),
                            authorized: root.authorized,
                            root_exists: root.exists,
                            detail: Some("外部原件：先纳入中央库后才能分发".to_string()),
                        }
                    }
                })
                .collect();
            skill.badges = badges;
        }

        let mut skills = central;
        skills.extend(external_by_name.into_values());
        skills.sort_by_key(|skill| skill.name.to_lowercase());

        // --- root counts in the response ----------------------------------
        let mut roots = active_roots;
        for root in &mut roots {
            root.skill_count = root_counts.get(&root.id).copied().unwrap_or(0);
        }

        // --- diff ----------------------------------------------------------
        let scope_key = if scope == ScopeKind::Global {
            "global".to_string()
        } else {
            format!("project:{}", project_id.as_deref().unwrap_or_default())
        };
        let mut last_scan: LastScanFile =
            read_json_or(&self.paths.last_scan, LastScanFile::default())?;
        let previous = last_scan.scopes.get(&scope_key).cloned();
        let first_scan = previous.is_none();
        let previous = previous.unwrap_or_default();
        let added = if first_scan {
            Vec::new()
        } else {
            fingerprints
                .keys()
                .filter(|key| !previous.contains_key(*key))
                .cloned()
                .collect()
        };
        let removed = if first_scan {
            Vec::new()
        } else {
            previous
                .keys()
                .filter(|key| !fingerprints.contains_key(*key))
                .cloned()
                .collect()
        };
        let changed = if first_scan {
            Vec::new()
        } else {
            fingerprints
                .iter()
                .filter(|(key, value)| previous.get(*key).map(|old| old != *value).unwrap_or(false))
                .map(|(key, _)| key.clone())
                .collect()
        };
        last_scan.scopes.insert(scope_key, fingerprints);
        write_json(&self.paths.last_scan, &last_scan)?;

        if manifest_dirty {
            self.save_manifest(&manifest)?;
        }

        let existing_agents: BTreeSet<String> = roots
            .iter()
            .filter(|root| root.exists && root.authorized)
            .map(|root| root.agent_id.clone())
            .collect();
        let installed_mounts = skills
            .iter()
            .flat_map(|skill| skill.badges.iter())
            .filter(|badge| badge.state == BadgeState::Installed)
            .count();
        let conflict_count = skills
            .iter()
            .flat_map(|skill| skill.badges.iter())
            .filter(|badge| badge.state == BadgeState::Conflict)
            .count();
        let external_count = skills.iter().filter(|skill| skill.is_external).count();
        let stats = ScanStats {
            skill_count: skills.len(),
            external_count,
            installed_mounts,
            conflict_count,
            agent_count: existing_agents.len(),
            authorized_root_count: roots.iter().filter(|root| root.authorized).count(),
            root_count: roots.len(),
        };

        Ok(ScanResult {
            skills,
            roots,
            stats,
            diff: ScanDiff {
                first_scan,
                added,
                removed,
                changed,
            },
            central_store_display: self.paths.display(&self.paths.store),
            scanned_at: now(),
            scope,
            active_project_id: project_id,
        })
    }

    // ---------------------------------------------------------------------
    // Preview / install / uninstall / import / save / create
    // ---------------------------------------------------------------------

    pub fn preview_skill(&self, payload: PreviewSkillPayload) -> CmdResult<SkillPreview> {
        let _guard = self.lock()?;
        let settings = self.load_settings()?;
        let manifest = self.load_manifest()?;
        let name = payload.skill_name;

        if let Some((path, parsed, _dir_name)) = self.find_central_skill(&name)? {
            let meta = manifest.skill(&parsed.name);
            let display_path = self.paths.display(&path.join("SKILL.md"));
            return Ok(SkillPreview {
                name: parsed.name,
                raw: parsed.raw,
                body: parsed.body,
                frontmatter: parsed.frontmatter,
                path: path.join("SKILL.md").to_string_lossy().to_string(),
                display_path,
                is_external: false,
                source: meta
                    .map(|value| value.source)
                    .unwrap_or(SkillSource::Builtin),
            });
        }

        let search_roots: Vec<RootInfo> = if let Some(scope) = payload.scope {
            self.roots_for_context(&settings, scope, payload.project_id.as_deref())?
        } else {
            self.all_roots(&settings)
        };

        for root in search_roots {
            if !root.authorized || !root.exists {
                continue;
            }
            let dir = PathBuf::from(&root.path);
            if !dir.is_dir() {
                continue;
            }
            for entry in fs::read_dir(&dir)
                .map_err(|error| CmdError::io("无法读取目录", error))?
                .filter_map(Result::ok)
            {
                let path = entry.path();
                if !path.is_dir() || !path.join("SKILL.md").is_file() {
                    continue;
                }
                if let Ok(parsed) = read_skill_dir(&path, &entry.file_name().to_string_lossy())
                    && (parsed.name == name || entry.file_name().to_string_lossy() == name)
                {
                    return Ok(SkillPreview {
                        name: parsed.name,
                        raw: parsed.raw,
                        body: parsed.body,
                        frontmatter: parsed.frontmatter,
                        path: path.join("SKILL.md").to_string_lossy().to_string(),
                        display_path: self.paths.display(&path.join("SKILL.md")),
                        is_external: true,
                        source: SkillSource::External,
                    });
                }
            }
        }

        Err(CmdError::new("SKILL_NOT_FOUND", "未找到该技能"))
    }

    pub fn install_skill(&self, payload: InstallSkillPayload) -> CmdResult<MountOutcome> {
        self.install_skill_inner(
            &payload.skill_name,
            &payload.agent_id,
            payload.scope,
            payload.project_id.as_deref(),
            false,
            payload.force,
        )
    }

    pub fn install_skill_inner(
        &self,
        skill_name: &str,
        agent_id: &str,
        scope: ScopeKind,
        project_id: Option<&str>,
        force_copy: bool,
        replace_existing: bool,
    ) -> CmdResult<MountOutcome> {
        let _guard = self.lock()?;
        let settings = self.load_settings()?;
        let mut manifest = self.load_manifest()?;
        let root = self.root_for_agent_in_context(&settings, scope, project_id, agent_id)?;
        if !root.authorized {
            return Err(CmdError::new(
                "ROOT_NOT_AUTHORIZED",
                "该 Agent 目录未授权，请先在设置中授权",
            ));
        }

        let Some((central_dir, parsed, dir_name)) = self.find_central_skill(skill_name)? else {
            return Err(CmdError::new(
                "NOT_CENTRAL",
                "仅中央库技能可分发，请先纳入中央库",
            ));
        };
        self.ensure_skill_meta(&mut manifest, &parsed.name)?;

        // same-name handling: a managed mount is a no-op; any other existing entry blocks
        // the mount unless the caller explicitly confirmed replacing it.
        let target = PathBuf::from(&root.path).join(&dir_name);
        let mut replaced_display: Option<String> = None;
        if root.exists && target.exists() {
            if self.is_managed_mount(&target, &root, &parsed.name, &manifest, &central_dir) {
                let mount_type =
                    if fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink()) {
                        MountType::Symlink
                    } else {
                        MountType::Copy
                    };
                return Ok(MountOutcome {
                    skill_name: parsed.name,
                    agent_id: adapters::canonical_agent_id(agent_id).to_string(),
                    action: "install".to_string(),
                    mount_type,
                    target_display: self.paths.display(&target),
                    already_installed: true,
                    message: "该安装已存在，无需重复安装".to_string(),
                    replaced: false,
                    replaced_display: None,
                });
            }
            if !replace_existing {
                return Err(
                    CmdError::new("NAME_CONFLICT", "目标位置已存在同名内容，确认后可覆盖")
                        .with_detail(self.paths.display(&target)),
                );
            }
            replaced_display = Some(self.paths.display(&target));
            remove_existing_entry(&target)?;
        }

        fs::create_dir_all(&root.path)
            .map_err(|error| CmdError::io("无法创建 Agent 目录", error))?;

        let replaced = replaced_display.is_some();
        let mut mount_type = MountType::Symlink;
        let mut message = "符号链接已建立并生效".to_string();
        let try_symlink = !force_copy;
        if try_symlink {
            match create_dir_symlink(&central_dir, &target) {
                Ok(()) => {}
                Err(_) => {
                    mount_type = MountType::Copy;
                    message = "系统未允许创建符号链接，已自动降级为副本".to_string();
                    copy_dir_all(&central_dir, &target)?;
                }
            }
        } else {
            mount_type = MountType::Copy;
            message = "已按要求以副本方式安装".to_string();
            copy_dir_all(&central_dir, &target)?;
        }

        // update installation record
        manifest.installations.retain(|i| {
            !(i.skill_name == parsed.name
                && i.root_id == root.id
                && path_key(Path::new(&i.target_path)) == path_key(&target))
        });
        let target_fingerprint = if mount_type == MountType::Copy {
            Some(dir_fingerprint(&target)?)
        } else {
            None
        };
        manifest.installations.push(Installation {
            id: format!(
                "inst_{}",
                short_hash(&format!("{}:{}:{}", root.id, parsed.name, now()))
            ),
            skill_name: parsed.name.clone(),
            agent_id: adapters::canonical_agent_id(agent_id).to_string(),
            root_id: root.id.clone(),
            scope: root.scope,
            mount_type,
            target_path: target.to_string_lossy().to_string(),
            target_fingerprint,
            installed_at: now(),
        });
        if let Some(meta) = manifest.skill_mut(&parsed.name) {
            meta.updated_at = now();
        }
        self.save_manifest(&manifest)?;

        Ok(MountOutcome {
            skill_name: parsed.name,
            agent_id: adapters::canonical_agent_id(agent_id).to_string(),
            action: "install".to_string(),
            mount_type,
            target_display: self.paths.display(&target),
            already_installed: false,
            message: if replaced {
                "已覆盖同名内容并建立安装".to_string()
            } else {
                message
            },
            replaced,
            replaced_display,
        })
    }

    pub fn install_skills(&self, payload: InstallSkillsPayload) -> CmdResult<InstallSkillsOutcome> {
        let mut results = Vec::new();
        let mut succeeded = 0usize;
        let mut skipped = 0usize;
        let mut failed = 0usize;
        let mut replaced = 0usize;

        let settings = self.load_settings()?;
        let agents = adapters::agent_info();
        let scope = payload.scope;
        let project_id = payload.project_id.clone();
        for item in payload.items {
            let agent_name = agents
                .iter()
                .find(|a| a.id == adapters::canonical_agent_id(&item.agent_id))
                .map(|a| a.name.clone())
                .unwrap_or_else(|| item.agent_id.clone());
            match self.install_skill(InstallSkillPayload {
                skill_name: item.skill_name.clone(),
                agent_id: item.agent_id.clone(),
                scope,
                project_id: project_id.clone(),
                force: payload.force,
            }) {
                Ok(outcome) => {
                    if outcome.already_installed {
                        skipped += 1;
                        results.push(InstallMountResult {
                            skill_name: item.skill_name,
                            agent_id: item.agent_id,
                            agent_name,
                            state: "skipped".to_string(),
                            mount_type: None,
                            target_display: outcome.target_display,
                            message: outcome.message,
                            replaced: false,
                        });
                    } else {
                        succeeded += 1;
                        if outcome.replaced {
                            replaced += 1;
                        }
                        results.push(InstallMountResult {
                            skill_name: item.skill_name,
                            agent_id: item.agent_id,
                            agent_name,
                            state: "installed".to_string(),
                            mount_type: Some(match outcome.mount_type {
                                MountType::Symlink => "symlink".to_string(),
                                MountType::Copy => "copy".to_string(),
                            }),
                            target_display: outcome.target_display,
                            message: outcome.message,
                            replaced: outcome.replaced,
                        });
                    }
                }
                Err(error) => {
                    // If not authorized or not central, count as failed; conflict/existing managed handled above
                    let state = if error.code == "NAME_CONFLICT" || error.code == "CONFLICT" {
                        skipped += 1;
                        "skipped".to_string()
                    } else {
                        failed += 1;
                        "failed".to_string()
                    };
                    let target_display = self
                        .root_for_agent_in_context(
                            &settings,
                            scope,
                            project_id.as_deref(),
                            &item.agent_id,
                        )
                        .ok()
                        .map(|r| format!("{}/{}", r.display_path, item.skill_name))
                        .unwrap_or_default();
                    results.push(InstallMountResult {
                        skill_name: item.skill_name,
                        agent_id: item.agent_id,
                        agent_name,
                        state,
                        mount_type: None,
                        target_display,
                        message: error.message,
                        replaced: false,
                    });
                }
            }
        }

        let message = if failed == 0 {
            if replaced > 0 {
                format!(
                    "完成：成功 {succeeded} 个（其中覆盖同名 {replaced} 个），跳过 {skipped} 个"
                )
            } else if skipped > 0 {
                format!("完成：成功 {succeeded} 个，跳过 {skipped} 个（已安装）")
            } else {
                format!("已成功建立 {succeeded} 个安装")
            }
        } else {
            format!("完成：成功 {succeeded} 个，跳过 {skipped} 个，失败 {failed} 个")
        };

        Ok(InstallSkillsOutcome {
            results,
            succeeded,
            skipped,
            failed,
            message,
            replaced,
        })
    }

    pub fn uninstall_skill(&self, payload: UninstallSkillPayload) -> CmdResult<MountOutcome> {
        let _guard = self.lock()?;
        let settings = self.load_settings()?;
        let mut manifest = self.load_manifest()?;
        let skill_name = &payload.skill_name;
        let agent_id = &payload.agent_id;
        let force = payload.force;
        let root = self.root_for_agent_in_context(
            &settings,
            payload.scope,
            payload.project_id.as_deref(),
            agent_id,
        )?;
        if !root.authorized {
            return Err(CmdError::new(
                "ROOT_NOT_AUTHORIZED",
                "该 Agent 目录未授权，请先在设置中授权",
            ));
        }

        let Some((_central_dir, parsed, dir_name)) = self.find_central_skill(skill_name)? else {
            return Err(CmdError::new("NOT_CENTRAL", "仅中央库技能可卸载"));
        };

        let target = PathBuf::from(&root.path).join(&dir_name);
        if !target.exists() {
            return Err(CmdError::new("NOT_INSTALLED", "未找到该安装"));
        }

        let is_symlink = fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink());
        let mount_type = if is_symlink {
            MountType::Symlink
        } else {
            MountType::Copy
        };

        if is_symlink {
            // ensure managed symlink to our store
            let managed = target
                .canonicalize()
                .map(|c| is_under(&self.paths.store, &c))
                .unwrap_or(false);
            if !managed {
                return Err(CmdError::new(
                    "NOT_MANAGED",
                    "该符号链接不由 mySkills 管理，已中止卸载",
                ));
            }
            remove_symlink(&target)?;
        } else {
            // copy mount: must be managed and check drift
            let record = manifest.installations.iter().find(|i| {
                i.skill_name == parsed.name
                    && i.root_id == root.id
                    && i.mount_type == MountType::Copy
                    && path_key(Path::new(&i.target_path)) == path_key(&target)
            });
            if record.is_none() {
                return Err(CmdError::new(
                    "NOT_MANAGED",
                    "该目录不是由 mySkills 管理的副本安装，已中止卸载",
                ));
            }
            let current_fp = dir_fingerprint(&target)?;
            let modified = record
                .and_then(|r| r.target_fingerprint.as_deref())
                .map(|fp| fp != current_fp)
                .unwrap_or(true);
            if modified && !force {
                return Err(CmdError::new("COPY_MODIFIED", "副本内容已被外部修改")
                    .with_detail(self.paths.display(&target)));
            }
            if modified && force {
                // move to trash
                let trash_dir = self.paths.trash.join(format!(
                    "{}_{}_{}",
                    dir_name,
                    adapters::canonical_agent_id(agent_id),
                    short_hash(&now())
                ));
                if let Some(parent) = trash_dir.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| CmdError::io("无法创建回收目录", error))?;
                }
                fs::rename(&target, &trash_dir).or_else(|_| {
                    copy_dir_all(&target, &trash_dir)?;
                    fs::remove_dir_all(&target).map_err(|error| CmdError::io("无法移除副本", error))
                })?;
            } else {
                fs::remove_dir_all(&target)
                    .map_err(|error| CmdError::io("无法移除副本安装", error))?;
            }
        }

        manifest.installations.retain(|i| {
            !(i.skill_name == parsed.name
                && i.root_id == root.id
                && path_key(Path::new(&i.target_path)) == path_key(&target))
        });
        if let Some(meta) = manifest.skill_mut(&parsed.name) {
            meta.updated_at = now();
        }
        self.save_manifest(&manifest)?;

        Ok(MountOutcome {
            skill_name: parsed.name,
            agent_id: adapters::canonical_agent_id(agent_id).to_string(),
            action: "uninstall".to_string(),
            mount_type,
            target_display: self.paths.display(&target),
            already_installed: false,
            message: "已卸载，中央库原件未受影响".to_string(),
            replaced: false,
            replaced_display: None,
        })
    }

    pub fn import_skill(&self, payload: ImportSkillPayload) -> CmdResult<ImportOutcome> {
        let _guard = self.lock()?;
        let settings = self.load_settings()?;
        let mut manifest = self.load_manifest()?;
        let skill_name = &payload.skill_name;

        if self.find_central_skill(skill_name)?.is_some() {
            return Err(CmdError::new("ALREADY_CENTRAL", "该技能已在中央库"));
        }

        // find external occurrence in authorized+exists roots of the given context
        let roots =
            self.roots_for_context(&settings, payload.scope, payload.project_id.as_deref())?;
        let mut found: Option<(PathBuf, ParsedSkill, String)> = None;
        for root in roots {
            if !root.authorized || !root.exists {
                continue;
            }
            let dir = PathBuf::from(&root.path);
            if !dir.is_dir() {
                continue;
            }
            for entry in fs::read_dir(&dir)
                .map_err(|error| CmdError::io("无法读取目录", error))?
                .filter_map(Result::ok)
            {
                let path = entry.path();
                let dir_name = entry.file_name().to_string_lossy().to_string();
                if !path.is_dir() || !path.join("SKILL.md").is_file() {
                    continue;
                }
                // skip managed symlinks into store
                let is_link = fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink());
                if is_link
                    && path
                        .canonicalize()
                        .is_ok_and(|c| is_under(&self.paths.store, &c))
                {
                    continue;
                }
                if let Ok(parsed) = read_skill_dir(&path, &dir_name) {
                    let managed_copy = manifest.installations.iter().any(|i| {
                        i.root_id == root.id
                            && i.skill_name == parsed.name
                            && i.mount_type == MountType::Copy
                            && path_key(Path::new(&i.target_path)) == path_key(&path)
                    });
                    if managed_copy {
                        continue;
                    }
                    if parsed.name == *skill_name || dir_name == *skill_name {
                        found = Some((path, parsed, dir_name));
                        break;
                    }
                }
            }
            if found.is_some() {
                break;
            }
        }

        let Some((origin_path, parsed, origin_dir_name)) = found else {
            return Err(CmdError::new("NOT_EXTERNAL", "未找到可纳入的外部技能原件"));
        };

        let target_dir_name = origin_dir_name;
        let target_dir = self.paths.store.join(&target_dir_name);
        if target_dir.exists() {
            return Err(CmdError::new(
                "NAME_CONFLICT",
                "中央库中已存在同名目录，已阻止导入",
            ));
        }

        copy_dir_all(&origin_path, &target_dir)?;
        let stamp = now();
        manifest.skills.retain(|s| s.name != parsed.name);
        manifest.skills.push(SkillMeta {
            name: parsed.name.clone(),
            source: SkillSource::Imported,
            created_at: stamp.clone(),
            updated_at: stamp.clone(),
        });
        self.save_manifest(&manifest)?;

        Ok(ImportOutcome {
            skill_name: parsed.name,
            target_display: self.paths.display(&target_dir),
            message: "已复制到中央库，原目录未做任何改动".to_string(),
        })
    }

    pub fn save_skill(&self, payload: SaveSkillPayload) -> CmdResult<SaveSkillOutcome> {
        let _guard = self.lock()?;
        let mut manifest = self.load_manifest()?;
        let Some((path, existing, _dir_name)) = self.find_central_skill(&payload.skill_name)?
        else {
            return Err(CmdError::new("NOT_CENTRAL", "仅中央库技能可编辑"));
        };

        let parsed = parse_skill_text(&payload.raw, &existing.name);
        let new_name = parsed.name.clone();

        if new_name != existing.name
            && let Some((other_path, _, _)) = self.find_central_skill(&new_name)?
            && path_key(&other_path) != path_key(&path)
        {
            return Err(CmdError::new(
                "NAME_CONFLICT",
                "中央库中已存在同名技能，已阻止保存",
            ));
        }

        write_file(&path.join("SKILL.md"), payload.raw.as_bytes())?;

        if new_name != existing.name {
            if let Some(meta) = manifest.skill_mut(&existing.name) {
                meta.name = new_name.clone();
                meta.updated_at = now();
            }
            for inst in &mut manifest.installations {
                if inst.skill_name == existing.name {
                    inst.skill_name = new_name.clone();
                }
            }
        } else if let Some(meta) = manifest.skill_mut(&existing.name) {
            meta.updated_at = now();
        } else {
            self.ensure_skill_meta(&mut manifest, &existing.name)?;
        }
        self.save_manifest(&manifest)?;

        Ok(SaveSkillOutcome {
            skill_name: new_name,
            display_path: self.paths.display(&path.join("SKILL.md")),
            message: "SKILL.md 已保存".to_string(),
        })
    }

    pub fn create_skill(&self, payload: CreateSkillPayload) -> CmdResult<CreateSkillOutcome> {
        let _guard = self.lock()?;
        let mut manifest = self.load_manifest()?;
        let parsed = parse_skill_text(&payload.raw, &payload.name);
        let name = if parsed.name.trim().is_empty() {
            payload.name.trim().to_string()
        } else {
            parsed.name.clone()
        };
        if name.trim().is_empty() {
            return Err(CmdError::new("INVALID_SKILL_NAME", "请输入技能名称"));
        }
        if self.find_central_skill(&name)?.is_some() {
            return Err(CmdError::new(
                "NAME_CONFLICT",
                "中央库中已存在同名技能，已阻止创建",
            ));
        }

        let dir_name = slugify_dir_name(&name);
        let dir = self.paths.store.join(&dir_name);
        if dir.exists() {
            return Err(CmdError::new(
                "NAME_CONFLICT",
                "中央库中已存在同名目录，已阻止创建",
            ));
        }
        fs::create_dir_all(&dir).map_err(|error| CmdError::io("无法创建技能目录", error))?;
        write_file(&dir.join("SKILL.md"), payload.raw.as_bytes())?;

        let stamp = now();
        manifest.skills.retain(|s| s.name != name);
        manifest.skills.push(SkillMeta {
            name: name.clone(),
            source: SkillSource::Builtin,
            created_at: stamp.clone(),
            updated_at: stamp.clone(),
        });
        self.save_manifest(&manifest)?;

        Ok(CreateSkillOutcome {
            skill_name: name,
            dir_name,
            display_path: self.paths.display(&dir.join("SKILL.md")),
            message: "新技能已写入中央库".to_string(),
        })
    }

    // ---------------------------------------------------------------------
    // Bundles / backup / distribute (minimal compatible impl)
    // ---------------------------------------------------------------------

    pub fn list_bundles(&self) -> CmdResult<BundlesOutcome> {
        let _guard = self.lock()?;
        let manifest = self.load_manifest()?;
        let mut bundles = manifest.bundles.clone();
        bundles.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(BundlesOutcome {
            message: format!("已加载 {} 个技能组合", bundles.len()),
            bundles,
        })
    }

    pub fn create_bundle(&self, payload: CreateBundlePayload) -> CmdResult<BundleOutcome> {
        let _guard = self.lock()?;
        let mut manifest = self.load_manifest()?;
        let name = payload.name.trim().to_string();
        let slug = payload.slug.trim().to_string();
        if name.is_empty() {
            return Err(CmdError::new("INVALID_BUNDLE_NAME", "请输入组合名称"));
        }
        if slug.is_empty() {
            return Err(CmdError::new("INVALID_BUNDLE_SLUG", "请输入组合标识符"));
        }
        if manifest.bundles.iter().any(|b| b.name == name) {
            return Err(CmdError::new("BUNDLE_EXISTS", "组合名称已存在"));
        }
        if manifest.bundles.iter().any(|b| b.slug == slug) {
            return Err(CmdError::new("BUNDLE_EXISTS", "组合标识符已存在"));
        }
        let stamp = now();
        let bundle = Bundle {
            id: format!("bundle_{}", short_hash(&format!("{name}:{stamp}"))),
            name,
            slug,
            version: payload.version.trim().to_string(),
            description: payload.description.trim().to_string(),
            skill_names: Vec::new(),
            created_at: stamp.clone(),
            updated_at: stamp,
        };
        manifest.bundles.push(bundle.clone());
        self.save_manifest(&manifest)?;
        Ok(BundleOutcome {
            bundle,
            message: "技能组合已创建".to_string(),
        })
    }

    pub fn update_bundle(&self, payload: UpdateBundlePayload) -> CmdResult<BundleOutcome> {
        let _guard = self.lock()?;
        let mut manifest = self.load_manifest()?;
        let bundle = manifest
            .bundles
            .iter_mut()
            .find(|b| b.id == payload.id)
            .ok_or_else(|| CmdError::new("UNKNOWN_BUNDLE", "组合不存在"))?;
        if let Some(name) = payload.name {
            bundle.name = name.trim().to_string();
        }
        if let Some(slug) = payload.slug {
            bundle.slug = slug.trim().to_string();
        }
        if let Some(version) = payload.version {
            bundle.version = version.trim().to_string();
        }
        if let Some(description) = payload.description {
            bundle.description = description.trim().to_string();
        }
        bundle.updated_at = now();
        let out = bundle.clone();
        self.save_manifest(&manifest)?;
        Ok(BundleOutcome {
            bundle: out,
            message: "技能组合已更新".to_string(),
        })
    }

    pub fn delete_bundle(&self, bundle_id: String) -> CmdResult<()> {
        let _guard = self.lock()?;
        let mut manifest = self.load_manifest()?;
        let before = manifest.bundles.len();
        manifest.bundles.retain(|b| b.id != bundle_id);
        if manifest.bundles.len() == before {
            return Err(CmdError::new("UNKNOWN_BUNDLE", "组合不存在"));
        }
        self.save_manifest(&manifest)?;
        Ok(())
    }

    pub fn add_skill_to_bundle(&self, payload: BundleSkillPayload) -> CmdResult<BundleOutcome> {
        let _guard = self.lock()?;
        let mut manifest = self.load_manifest()?;
        if self.find_central_skill(&payload.skill_name)?.is_none() {
            return Err(CmdError::new("SKILL_NOT_FOUND", "技能不在中央库中"));
        }
        let bundle = manifest
            .bundles
            .iter_mut()
            .find(|b| b.id == payload.bundle_id)
            .ok_or_else(|| CmdError::new("UNKNOWN_BUNDLE", "组合不存在"))?;
        if bundle.skill_names.iter().any(|n| n == &payload.skill_name) {
            return Err(CmdError::new("SKILL_IN_BUNDLE", "技能已在组合中"));
        }
        bundle.skill_names.push(payload.skill_name);
        bundle.updated_at = now();
        let out = bundle.clone();
        self.save_manifest(&manifest)?;
        Ok(BundleOutcome {
            bundle: out,
            message: "技能已添加到组合".to_string(),
        })
    }

    pub fn remove_skill_from_bundle(
        &self,
        payload: BundleSkillPayload,
    ) -> CmdResult<BundleOutcome> {
        let _guard = self.lock()?;
        let mut manifest = self.load_manifest()?;
        let bundle = manifest
            .bundles
            .iter_mut()
            .find(|b| b.id == payload.bundle_id)
            .ok_or_else(|| CmdError::new("UNKNOWN_BUNDLE", "组合不存在"))?;
        if !bundle.skill_names.iter().any(|n| n == &payload.skill_name) {
            return Err(CmdError::new("SKILL_NOT_IN_BUNDLE", "技能不在组合中"));
        }
        bundle.skill_names.retain(|n| n != &payload.skill_name);
        bundle.updated_at = now();
        let out = bundle.clone();
        self.save_manifest(&manifest)?;
        Ok(BundleOutcome {
            bundle: out,
            message: "技能已从组合移除".to_string(),
        })
    }

    pub fn export_backup(&self, payload: ExportBackupPayload) -> CmdResult<ExportBackupOutcome> {
        let _guard = self.lock()?;
        let file_path = PathBuf::from(&payload.target_path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|error| CmdError::io("无法创建导出目录", error))?;
        }
        create_zip_archive(&self.paths.store, &file_path)?;
        let manifest = self.load_manifest()?;
        let skills = self.list_central_skill_names()?;
        let file_size = fs::metadata(&file_path)
            .map(|m| m.len() as usize)
            .unwrap_or(0);
        let backup_name = file_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("myskills-backup.zip")
            .to_string();
        Ok(ExportBackupOutcome {
            backup_name,
            file_path: file_path.to_string_lossy().to_string(),
            file_size,
            skill_count: skills.len(),
            installation_count: manifest.installations.len(),
            message: "备份已导出".to_string(),
        })
    }
    pub fn import_backup(&self, payload: ImportBackupPayload) -> CmdResult<ImportBackupOutcome> {
        let _guard = self.lock()?;
        let archive = PathBuf::from(&payload.archive_path);
        if !archive.exists() {
            return Err(CmdError::new("PATH_MISSING", "备份文件不存在"));
        }
        let temp = self
            .paths
            .root
            .join(format!("import_{}", short_hash(&now())));
        fs::create_dir_all(&temp).map_err(|error| CmdError::io("无法创建临时目录", error))?;
        extract_zip_archive(&archive, &temp)?;

        let mut imported = 0usize;
        let mut skipped = 0usize;
        let mut conflicts = Vec::new();
        if temp.is_dir() {
            for entry in fs::read_dir(&temp)
                .map_err(|error| CmdError::io("无法读取备份内容", error))?
                .filter_map(Result::ok)
            {
                let src = entry.path();
                if !src.is_dir() {
                    continue;
                }
                let dir_name = entry.file_name().to_string_lossy().to_string();
                let dest = self.paths.store.join(&dir_name);
                if dest.exists() {
                    match payload.conflict_strategy.as_str() {
                        "skip" => {
                            skipped += 1;
                            continue;
                        }
                        "overwrite" => {
                            fs::remove_dir_all(&dest)
                                .map_err(|error| CmdError::io("无法覆盖现有技能", error))?;
                        }
                        "rename" => {
                            let renamed = self.paths.store.join(format!("{dir_name}-imported"));
                            if renamed.exists() {
                                skipped += 1;
                                continue;
                            }
                            copy_dir_all(&src, &renamed)?;
                            imported += 1;
                            continue;
                        }
                        _ => {
                            conflicts.push(ImportConflict {
                                skill_name: dir_name,
                                local_version: None,
                                local_modified_at: None,
                                inbound_version: None,
                                inbound_packaged_at: None,
                                diff: "同名技能已存在".to_string(),
                            });
                            skipped += 1;
                            continue;
                        }
                    }
                }
                copy_dir_all(&src, &dest)?;
                imported += 1;
            }
        }
        let _ = fs::remove_dir_all(&temp);

        Ok(ImportBackupOutcome {
            imported_count: imported,
            skipped_count: skipped,
            conflicts,
            message: format!("导入完成：{imported} 个，跳过 {skipped} 个"),
        })
    }

    pub fn distribute_bundle(
        &self,
        payload: DistributeBundlePayload,
    ) -> CmdResult<DistributeBundleOutcome> {
        let _guard = self.lock()?;
        let manifest = self.load_manifest()?;
        let bundle = manifest
            .bundles
            .iter()
            .find(|b| b.id == payload.bundle_id)
            .ok_or_else(|| CmdError::new("UNKNOWN_BUNDLE", "组合不存在"))?
            .clone();
        let agents = adapters::agent_info();
        drop(_guard);

        let mut results = Vec::new();
        let mut succeeded = 0usize;
        let mut skipped = 0usize;
        let mut failed = 0usize;
        let scope_str = match payload.scope {
            ScopeKind::Global => "global",
            ScopeKind::Project => "project",
        }
        .to_string();
        for skill_name in bundle.skill_names {
            for agent_id in &payload.target_agent_ids {
                let agent_name = agents
                    .iter()
                    .find(|a| a.id == adapters::canonical_agent_id(agent_id))
                    .map(|a| a.name.clone())
                    .unwrap_or_else(|| agent_id.clone());
                match self.install_skill(InstallSkillPayload {
                    skill_name: skill_name.clone(),
                    agent_id: agent_id.clone(),
                    scope: payload.scope,
                    project_id: payload.project_id.clone(),
                    force: false,
                }) {
                    Ok(outcome) => {
                        if outcome.already_installed {
                            skipped += 1;
                            results.push(DistributeResult {
                                agent_id: agent_id.clone(),
                                agent_name: agent_name.clone(),
                                scope: scope_str.clone(),
                                state: "skipped".to_string(),
                                mount_type: None,
                                target_display: outcome.target_display,
                                message: outcome.message,
                            });
                        } else {
                            succeeded += 1;
                            results.push(DistributeResult {
                                agent_id: agent_id.clone(),
                                agent_name: agent_name.clone(),
                                scope: scope_str.clone(),
                                state: "installed".to_string(),
                                mount_type: Some(match outcome.mount_type {
                                    MountType::Symlink => "symlink".to_string(),
                                    MountType::Copy => "copy".to_string(),
                                }),
                                target_display: outcome.target_display,
                                message: outcome.message,
                            });
                        }
                    }
                    Err(error) => {
                        failed += 1;
                        results.push(DistributeResult {
                            agent_id: agent_id.clone(),
                            agent_name: agent_name.clone(),
                            scope: scope_str.clone(),
                            state: "failed".to_string(),
                            mount_type: None,
                            target_display: String::new(),
                            message: error.message,
                        });
                    }
                }
            }
        }

        Ok(DistributeBundleOutcome {
            results,
            succeeded,
            skipped,
            failed,
            message: format!("分发完成：成功 {succeeded}，跳过 {skipped}，失败 {failed}"),
        })
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    fn lock(&self) -> CmdResult<std::sync::MutexGuard<'_, ()>> {
        self.lock
            .lock()
            .map_err(|_| CmdError::new("LOCK_ERROR", "应用数据锁不可用"))
    }

    fn load_settings(&self) -> CmdResult<Settings> {
        read_json_or(&self.paths.settings, Settings::default())
    }

    fn save_settings(&self, settings: &Settings) -> CmdResult<()> {
        write_json(&self.paths.settings, settings)
    }

    fn load_manifest(&self) -> CmdResult<Manifest> {
        read_json_or(&self.paths.manifest, Manifest::default())
    }

    fn save_manifest(&self, manifest: &Manifest) -> CmdResult<()> {
        write_json(&self.paths.manifest, manifest)
    }

    fn repair_scope(&self, settings: &mut Settings) -> bool {
        let mut changed = false;
        if let Some(id) = settings.active_project_id.as_deref()
            && !settings.projects.iter().any(|project| project.id == id)
        {
            settings.active_project_id = None;
            changed = true;
        }
        if settings.active_scope == ScopeKind::Project && settings.active_project_id.is_none() {
            settings.active_scope = ScopeKind::Global;
            changed = true;
        }
        changed
    }

    fn migrate_legacy_agent_ids(&self, settings: &mut Settings, manifest: &mut Manifest) -> bool {
        let mut changed = false;
        let mut new_auth: BTreeMap<String, bool> = BTreeMap::new();
        for (key, value) in settings.authorized_roots.iter() {
            let new_key = adapters::canonical_root_id(key);
            if &new_key != key {
                changed = true;
            }
            let entry = new_auth.entry(new_key).or_insert(false);
            *entry = *entry || *value;
        }
        if new_auth.len() != settings.authorized_roots.len() || changed {
            settings.authorized_roots = new_auth;
        }
        for inst in &mut manifest.installations {
            let new_agent = adapters::canonical_agent_id(&inst.agent_id).to_string();
            if new_agent != inst.agent_id {
                inst.agent_id = new_agent;
                changed = true;
            }
            let new_root = adapters::canonical_root_id(&inst.root_id);
            if new_root != inst.root_id {
                inst.root_id = new_root;
                changed = true;
            }
        }
        changed
    }

    /// Migrate legacy authorization semantics (explicit per-root values, default-off when missing)
    /// to new semantics (default follows exists; overrides only when different).
    fn migrate_authorization_model(&self, settings: &mut Settings) -> bool {
        if settings.schema_version >= SETTINGS_SCHEMA_VERSION {
            return false;
        }

        let roots = self.all_roots_raw(settings);
        let mut migrated: BTreeMap<String, bool> = BTreeMap::new();
        for root in roots {
            if let Some(value) = settings.authorized_roots.get(&root.id).copied() {
                if root.exists {
                    // New default for installed/detected roots is authorized.
                    // Legacy explicit false commonly meant "not selected"; prefer new default-on.
                    if !value {
                        // drop explicit false -> default authorized
                    } else {
                        // explicit true equals default for existing root -> drop redundant override
                    }
                } else {
                    // Non-existing roots default to unauthorized; preserve explicit pre-authorization.
                    if value {
                        migrated.insert(root.id, true);
                    }
                }
            }
        }
        settings.authorized_roots = migrated;
        settings.schema_version = SETTINGS_SCHEMA_VERSION;
        true
    }

    fn effective_root_authorized(settings: &Settings, root_id: &str, exists: bool) -> bool {
        settings
            .authorized_roots
            .get(root_id)
            .copied()
            .unwrap_or(exists)
    }

    fn normalize_authorization_overrides(&self, settings: &mut Settings) -> bool {
        let roots = self.all_roots_raw(settings);
        let mut normalized: BTreeMap<String, bool> = BTreeMap::new();
        for root in &roots {
            if let Some(value) = settings.authorized_roots.get(&root.id).copied() {
                let default_authorized = root.exists;
                if value != default_authorized {
                    normalized.insert(root.id.clone(), value);
                }
            }
        }
        if normalized == settings.authorized_roots {
            return false;
        }
        settings.authorized_roots = normalized;
        true
    }

    fn bootstrap_value(&self, settings: &Settings) -> Bootstrap {
        Bootstrap {
            settings: settings.clone(),
            roots: self.all_roots(settings),
            agents: adapters::agent_info(),
            central_store_path: self.paths.store.to_string_lossy().to_string(),
            central_store_display: self.paths.display(&self.paths.store),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    fn all_roots(&self, settings: &Settings) -> Vec<RootInfo> {
        self.all_roots_raw(settings)
    }

    fn all_roots_raw(&self, settings: &Settings) -> Vec<RootInfo> {
        let mut roots = Vec::new();
        for adapter in adapters::all_adapters() {
            if adapter.supports_global() {
                let root_id = adapters::global_root_id(&adapter.id);
                let mut path = adapter.resolve_global_path(&self.paths);
                if adapter.id == "cursor" && !path.exists() {
                    let legacy = self.paths.home.join(".cursor/extensions/skills");
                    if legacy.exists() {
                        path = legacy;
                    }
                }
                let exists = path.is_dir();
                roots.push(RootInfo {
                    id: root_id.clone(),
                    agent_id: adapter.id.to_string(),
                    agent_name: adapter.name.to_string(),
                    scope: ScopeKind::Global,
                    project_id: None,
                    project_name: None,
                    path: path.to_string_lossy().to_string(),
                    display_path: self.paths.display(&path),
                    exists,
                    authorized: Self::effective_root_authorized(settings, &root_id, exists),
                    skill_count: 0,
                });
            }
        }
        for project in &settings.projects {
            for adapter in adapters::all_adapters() {
                if !adapter.supports_project() {
                    continue;
                }
                let root_id = adapters::project_root_id(&adapter.id, &project.id);
                let path = adapter.resolve_project_path(Path::new(&project.path));
                let exists = path.is_dir();
                roots.push(RootInfo {
                    id: root_id.clone(),
                    agent_id: adapter.id.to_string(),
                    agent_name: adapter.name.to_string(),
                    scope: ScopeKind::Project,
                    project_id: Some(project.id.clone()),
                    project_name: Some(project.name.clone()),
                    path: path.to_string_lossy().to_string(),
                    display_path: self.paths.display(&path),
                    exists,
                    authorized: Self::effective_root_authorized(settings, &root_id, exists),
                    skill_count: 0,
                });
            }
        }
        roots
    }
    fn root_info(&self, target: RootTarget<'_>, settings: &Settings) -> RootInfo {
        let exists = target.path.is_dir();
        let authorized = Self::effective_root_authorized(settings, &target.id, exists);
        RootInfo {
            id: target.id,
            agent_id: target.adapter.id.to_string(),
            agent_name: target.adapter.name.to_string(),
            scope: target.scope,
            project_id: target.project_id,
            project_name: target.project_name.map(|name| name.to_string()),
            path: target.path.to_string_lossy().to_string(),
            display_path: self.paths.display(&target.path),
            exists,
            authorized,
            skill_count: 0,
        }
    }

    fn roots_for_context(
        &self,
        settings: &Settings,
        scope: ScopeKind,
        project_id: Option<&str>,
    ) -> CmdResult<Vec<RootInfo>> {
        let all = self.all_roots(settings);
        if scope == ScopeKind::Project {
            let project_id = project_id
                .ok_or_else(|| CmdError::new("PROJECT_REQUIRED", "请先选择一个已登记的项目"))?;
            if !settings
                .projects
                .iter()
                .any(|project| project.id == project_id)
            {
                return Err(CmdError::new(
                    "UNKNOWN_PROJECT",
                    "项目不存在，请先在偏好设置中登记项目",
                ));
            }
            let roots: Vec<RootInfo> = all
                .into_iter()
                .filter(|root| {
                    root.scope == ScopeKind::Project
                        && root.project_id.as_deref() == Some(project_id)
                })
                .collect();
            if roots.is_empty() {
                return Err(CmdError::new(
                    "PROJECT_REQUIRED",
                    "该项目暂无可用的 Agent 目录",
                ));
            }
            return Ok(roots);
        }
        Ok(all
            .into_iter()
            .filter(|root| root.scope == ScopeKind::Global)
            .collect())
    }

    fn root_for_agent_in_context(
        &self,
        settings: &Settings,
        scope: ScopeKind,
        project_id: Option<&str>,
        agent_id: &str,
    ) -> CmdResult<RootInfo> {
        let canonical = adapters::canonical_agent_id(agent_id);
        if adapters::find_adapter(canonical).is_none() {
            return Err(CmdError::new("UNKNOWN_AGENT", "未知的 Agent"));
        }
        self.roots_for_context(settings, scope, project_id)?
            .into_iter()
            .find(|root| root.agent_id == canonical)
            .ok_or_else(|| CmdError::new("UNKNOWN_ROOT", "未找到该 Agent 在当前上下文的目录"))
    }

    fn ensure_skill_meta(&self, manifest: &mut Manifest, name: &str) -> CmdResult<()> {
        if manifest.skill(name).is_some() {
            return Ok(());
        }
        if self.find_central_skill(name)?.is_none() {
            return Err(CmdError::new("NOT_CENTRAL", "仅中央库技能可设置元数据"));
        }
        let stamp = now();
        manifest.skills.push(SkillMeta {
            name: name.to_string(),
            source: SkillSource::Builtin,
            created_at: stamp.clone(),
            updated_at: stamp,
        });
        Ok(())
    }

    fn find_central_skill(&self, name: &str) -> CmdResult<Option<(PathBuf, ParsedSkill, String)>> {
        if !self.paths.store.is_dir() {
            return Ok(None);
        }
        let entries = fs::read_dir(&self.paths.store)
            .map_err(|error| CmdError::io("无法读取中央库目录", error))?;
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.file_type().is_symlink() || !path.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if dir_name.starts_with('.') {
                continue;
            }
            if let Ok(parsed) = read_skill_dir(&path, &dir_name)
                && (parsed.name == name || dir_name == name)
            {
                return Ok(Some((path, parsed, dir_name)));
            }
        }
        Ok(None)
    }

    fn list_central_skill_names(&self) -> CmdResult<Vec<String>> {
        let mut names = Vec::new();
        if !self.paths.store.is_dir() {
            return Ok(names);
        }
        for entry in fs::read_dir(&self.paths.store)
            .map_err(|error| CmdError::io("无法读取中央库目录", error))?
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if let Ok(parsed) = read_skill_dir(&path, &dir_name) {
                names.push(parsed.name);
            }
        }
        Ok(names)
    }

    fn is_managed_mount(
        &self,
        target: &Path,
        root: &RootInfo,
        skill_name: &str,
        manifest: &Manifest,
        central_dir: &Path,
    ) -> bool {
        if fs::symlink_metadata(target).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            // Only a link that resolves to this very skill's central directory is ours;
            // a link into the store pointing at another skill must not pass as installed.
            return target
                .canonicalize()
                .map(|canonical| path_key(&canonical) == path_key(central_dir))
                .unwrap_or(false);
        }
        manifest.installations.iter().any(|installation| {
            installation.root_id == root.id
                && installation.skill_name == skill_name
                && path_key(Path::new(&installation.target_path)) == path_key(target)
        })
    }

    fn central_badge(
        &self,
        skill: &SkillView,
        root: &RootInfo,
        manifest: &Manifest,
        external_conflict: bool,
    ) -> AgentBadge {
        let target = PathBuf::from(&root.path).join(&skill.dir_name);
        let target_display = self.paths.display(&target);
        let mut badge = AgentBadge {
            agent_id: root.agent_id.clone(),
            agent_name: root.agent_name.clone(),
            root_id: root.id.clone(),
            scope: root.scope,
            state: BadgeState::Available,
            mount_type: None,
            target_path: target.to_string_lossy().to_string(),
            target_display,
            authorized: root.authorized,
            root_exists: root.exists,
            detail: None,
        };

        if !root.authorized {
            badge.state = BadgeState::Locked;
            badge.detail = Some("目录未授权，暂不可分发".to_string());
            return badge;
        }
        if !root.exists {
            badge.state = BadgeState::Locked;
            badge.detail = Some("目录未检测到，已授权，待检测后可用".to_string());
            return badge;
        }

        let metadata = fs::symlink_metadata(&target);
        match metadata {
            Err(_) => {
                badge.state = BadgeState::Available;
                badge.detail = None;
            }
            Ok(metadata) if metadata.file_type().is_symlink() => match target.canonicalize() {
                Ok(canonical) if path_key(&canonical) == path_key(Path::new(&skill.path)) => {
                    badge.state = BadgeState::Installed;
                    badge.mount_type = Some(MountType::Symlink);
                    badge.detail = Some("符号链接安装".to_string());
                }
                Ok(canonical) if is_under(&self.paths.store, &canonical) => {
                    badge.state = BadgeState::Conflict;
                    badge.detail = Some("同名符号链接指向中央库中的其他技能".to_string());
                }
                _ => {
                    badge.state = BadgeState::Conflict;
                    badge.detail = Some("同名符号链接指向中央库之外".to_string());
                }
            },
            Ok(_) => {
                let managed = manifest.installations.iter().any(|installation| {
                    installation.root_id == root.id
                        && installation.skill_name == skill.name
                        && installation.mount_type == MountType::Copy
                        && path_key(Path::new(&installation.target_path)) == path_key(&target)
                });
                if managed {
                    badge.state = BadgeState::Installed;
                    badge.mount_type = Some(MountType::Copy);
                    badge.detail = Some("副本安装（中央库编辑后需手动同步）".to_string());
                } else if external_conflict {
                    badge.state = BadgeState::Conflict;
                    badge.detail = Some("目标目录已是外部同名技能，可覆盖安装".to_string());
                } else {
                    badge.state = BadgeState::Conflict;
                    badge.detail = Some("目标目录已存在同名项，可覆盖安装".to_string());
                }
            }
        }
        badge
    }
}

fn now() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// Deletes a same-name entry in an Agent workspace so a mount can take its place.
/// Symlinks are unlinked (their target is untouched); files and directories are removed.
fn remove_existing_entry(path: &Path) -> CmdResult<()> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| CmdError::io("无法读取同名目标", error))?;
    let file_type = metadata.file_type();
    if file_type.is_symlink() {
        remove_symlink(path)
    } else if file_type.is_dir() {
        fs::remove_dir_all(path).map_err(|error| CmdError::io("无法删除同名目录", error))
    } else {
        fs::remove_file(path).map_err(|error| CmdError::io("无法删除同名文件", error))
    }
}

fn safe_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.contains('\0')
        && !value.contains('/')
        && !value.contains('\\')
}

fn slugify_dir_name(name: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in name.trim().chars() {
        let mapped = if ch.is_ascii_alphanumeric() {
            Some(ch.to_ascii_lowercase())
        } else if ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == ' ' {
            if ch == '-' || ch == '_' || ch == ' ' {
                Some('-')
            } else {
                Some(ch)
            }
        } else {
            Some('-')
        };
        if let Some(c) = mapped {
            if c == '-' {
                if !prev_dash && !slug.is_empty() {
                    slug.push('-');
                }
                prev_dash = true;
            } else {
                slug.push(c);
                prev_dash = false;
            }
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "my-new-skill".to_string()
    } else {
        slug
    }
}
