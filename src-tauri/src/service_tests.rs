#[cfg(test)]
mod tests {
    use crate::adapters;
    use crate::model::*;
    use crate::paths::AppPaths;
    use crate::service::AppService;
    use std::fs;
    use std::path::{Path, PathBuf};
    use tempfile::TempDir;

    struct Fixture {
        _temp: TempDir,
        home: PathBuf,
        root: PathBuf,
        service: AppService,
    }

    impl Fixture {
        fn new() -> Self {
            let temp = tempfile::tempdir().expect("temp dir");
            let home = temp.path().join("home");
            fs::create_dir_all(home.join(".workbuddy/skills")).expect("workbuddy root");
            fs::create_dir_all(home.join(".claude/skills")).expect("claude root");
            fs::create_dir_all(home.join(".cursor/skills")).expect("cursor root");
            let root = temp.path().join("appdata");
            let service =
                AppService::new(AppPaths::new(home.clone(), root.clone())).expect("service");
            Self {
                _temp: temp,
                home,
                root,
                service,
            }
        }

        fn central(&self, dir: &str, name: &str, description: &str, body: &str) -> PathBuf {
            write_skill(&self.root.join("store").join(dir), name, description, body)
        }

        fn external(
            &self,
            root: &Path,
            dir: &str,
            name: &str,
            description: &str,
            body: &str,
        ) -> PathBuf {
            write_skill(&root.join(dir), name, description, body)
        }

        fn store(&self) -> PathBuf {
            self.root.join("store")
        }

        fn scan_global(&self) -> ScanResult {
            self.service
                .scan_skills(ScanPayload {
                    scope: ScopeKind::Global,
                    project_id: None,
                })
                .expect("scan global")
        }

        fn scan_project(&self, project_id: &str) -> ScanResult {
            self.service
                .scan_skills(ScanPayload {
                    scope: ScopeKind::Project,
                    project_id: Some(project_id.to_string()),
                })
                .expect("scan project")
        }
    }

    fn write_skill(dir: &Path, name: &str, description: &str, body: &str) -> PathBuf {
        fs::create_dir_all(dir).expect("skill dir");
        let content = format!(
            "---\nname: {name}\ndescription: {description}\nversion: 1.0.0\n---\n\n{body}\n"
        );
        fs::write(dir.join("SKILL.md"), content).expect("skill file");
        dir.to_path_buf()
    }

    fn skill<'a>(scan: &'a ScanResult, name: &str) -> &'a SkillView {
        scan.skills
            .iter()
            .find(|skill| skill.name == name)
            .unwrap_or_else(|| panic!("skill {name} not found"))
    }

    #[test]
    fn global_scan_merges_central_and_external_skills_with_authorized_agent_badges() {
        let fixture = Fixture::new();
        fixture.central("weekly-menu", "weekly-menu", "安排一周菜单", "# 触发规则");
        fixture.external(
            &fixture.home.join(".workbuddy/skills"),
            "whoareyou",
            "whoareyou",
            "识别项目技术栈",
            "# 只读原件",
        );

        let scan = fixture.scan_global();
        assert_eq!(scan.skills.len(), 2);
        assert_eq!(scan.stats.external_count, 1);
        assert!(
            scan.roots
                .iter()
                .any(|r| r.agent_id == "workbuddy" && r.authorized)
        );

        let central = skill(&scan, "weekly-menu");
        assert!(!central.is_external);
        // Global module cards must show global agent badges when authorized+detected
        assert!(
            central.badges.iter().any(|badge| {
                badge.agent_id == "workbuddy" && badge.state == BadgeState::Available
            }),
            "expected available badge for authorized detected global agent"
        );

        let external = skill(&scan, "whoareyou");
        assert!(external.is_external);
        assert!(
            external
                .occurrences
                .iter()
                .any(|occurrence| occurrence.agent_id == "workbuddy"),
            "expected workbuddy occurrence"
        );
        let badge = external
            .badges
            .iter()
            .find(|badge| badge.agent_id == "workbuddy")
            .expect("workbuddy badge");
        assert_eq!(badge.state, BadgeState::Origin);
    }

    #[test]
    fn install_then_uninstall_in_global_context_keeps_central_original() {
        let fixture = Fixture::new();
        fixture.central("weekly-menu", "weekly-menu", "安排一周菜单", "# 触发规则");

        let outcome = fixture
            .service
            .install_skill(InstallSkillPayload {
                skill_name: "weekly-menu".to_string(),
                agent_id: "workbuddy".to_string(),
                scope: ScopeKind::Global,
                project_id: None,
                force: false,
            })
            .expect("install");
        assert!(matches!(
            outcome.mount_type,
            MountType::Symlink | MountType::Copy
        ));
        let target = fixture.home.join(".workbuddy/skills/weekly-menu");
        assert!(target.exists());

        let scan = fixture.scan_global();
        let badge = skill(&scan, "weekly-menu")
            .badges
            .iter()
            .find(|badge| badge.agent_id == "workbuddy")
            .expect("badge");
        assert_eq!(
            badge.state,
            BadgeState::Installed,
            "detail: {:?}",
            badge.detail
        );
        assert!(badge.mount_type.is_some());

        let outcome = fixture
            .service
            .uninstall_skill(UninstallSkillPayload {
                skill_name: "weekly-menu".to_string(),
                agent_id: "workbuddy".to_string(),
                scope: ScopeKind::Global,
                project_id: None,
                force: false,
            })
            .expect("uninstall");
        assert!(outcome.message.contains("中央库原件"));
        assert!(!target.exists());
        assert!(fixture.store().join("weekly-menu/SKILL.md").is_file());
    }

    #[test]
    fn install_refuses_to_overwrite_external_same_name() {
        let fixture = Fixture::new();
        fixture.central("weekly-menu", "weekly-menu", "中央说明", "# 中央正文");
        let external = fixture.external(
            &fixture.home.join(".workbuddy/skills"),
            "weekly-menu",
            "weekly-menu",
            "外部说明",
            "# 外部正文",
        );

        let scan = fixture.scan_global();
        let badge = skill(&scan, "weekly-menu")
            .badges
            .iter()
            .find(|badge| badge.agent_id == "workbuddy")
            .expect("badge");
        assert_eq!(badge.state, BadgeState::Conflict);

        let error = fixture
            .service
            .install_skill(InstallSkillPayload {
                skill_name: "weekly-menu".to_string(),
                agent_id: "workbuddy".to_string(),
                scope: ScopeKind::Global,
                project_id: None,
                force: false,
            })
            .unwrap_err();
        assert_eq!(error.code, "NAME_CONFLICT");
        let content = fs::read_to_string(external.join("SKILL.md")).expect("external content");
        assert!(content.contains("外部说明"));
    }

    #[test]
    fn install_with_force_replaces_external_same_name_and_keeps_central() {
        let fixture = Fixture::new();
        fixture.central("weekly-menu", "weekly-menu", "中央说明", "# 中央正文");
        let external = fixture.external(
            &fixture.home.join(".workbuddy/skills"),
            "weekly-menu",
            "weekly-menu",
            "外部说明",
            "# 外部正文",
        );

        let outcome = fixture
            .service
            .install_skill(InstallSkillPayload {
                skill_name: "weekly-menu".to_string(),
                agent_id: "workbuddy".to_string(),
                scope: ScopeKind::Global,
                project_id: None,
                force: true,
            })
            .expect("forced install");

        assert!(outcome.replaced);
        assert!(outcome.replaced_display.is_some());
        let target = fixture.home.join(".workbuddy/skills/weekly-menu");
        assert!(target.exists());
        if outcome.mount_type == MountType::Symlink {
            assert!(fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink()));
            assert_eq!(
                target.canonicalize().expect("canonical"),
                fixture
                    .store()
                    .join("weekly-menu")
                    .canonicalize()
                    .expect("store")
            );
        }
        let replaced_content =
            fs::read_to_string(external.join("SKILL.md")).expect("replaced content");
        assert!(replaced_content.contains("中央说明"));
        assert!(fixture.store().join("weekly-menu/SKILL.md").is_file());

        let scan = fixture.scan_global();
        let badge = skill(&scan, "weekly-menu")
            .badges
            .iter()
            .find(|badge| badge.agent_id == "workbuddy")
            .expect("badge");
        assert_eq!(
            badge.state,
            BadgeState::Installed,
            "detail: {:?}",
            badge.detail
        );
    }

    #[test]
    fn batch_install_skips_without_force_and_overwrites_with_force() {
        let fixture = Fixture::new();
        fixture.central("weekly-menu", "weekly-menu", "中央说明", "# 中央正文");
        let external = fixture.external(
            &fixture.home.join(".workbuddy/skills"),
            "weekly-menu",
            "weekly-menu",
            "外部说明",
            "# 外部正文",
        );

        let payload = |force: bool| InstallSkillsPayload {
            items: vec![InstallSkillItem {
                skill_name: "weekly-menu".to_string(),
                agent_id: "workbuddy".to_string(),
            }],
            scope: ScopeKind::Global,
            project_id: None,
            force,
        };

        let skipped = fixture
            .service
            .install_skills(payload(false))
            .expect("batch install without force");
        assert_eq!(skipped.skipped, 1);
        assert_eq!(skipped.succeeded, 0);
        assert_eq!(skipped.replaced, 0);
        assert_eq!(skipped.results[0].state, "skipped");
        let untouched = fs::read_to_string(external.join("SKILL.md")).expect("external content");
        assert!(untouched.contains("外部说明"));

        let forced = fixture
            .service
            .install_skills(payload(true))
            .expect("batch install with force");
        assert_eq!(forced.succeeded, 1);
        assert_eq!(forced.replaced, 1);
        assert!(forced.results[0].replaced);
        let replaced = fs::read_to_string(external.join("SKILL.md")).expect("replaced content");
        assert!(replaced.contains("中央说明"));
        assert!(fixture.store().join("weekly-menu/SKILL.md").is_file());

        let scan = fixture.scan_global();
        let badge = skill(&scan, "weekly-menu")
            .badges
            .iter()
            .find(|badge| badge.agent_id == "workbuddy")
            .expect("badge");
        assert_eq!(
            badge.state,
            BadgeState::Installed,
            "detail: {:?}",
            badge.detail
        );
    }

    #[test]
    fn import_copies_but_never_moves_origin_in_context() {
        let fixture = Fixture::new();
        let origin = fixture.external(
            &fixture.home.join(".workbuddy/skills"),
            "whoareyou",
            "whoareyou",
            "识别项目技术栈",
            "# 只读原件",
        );

        let outcome = fixture
            .service
            .import_skill(ImportSkillPayload {
                skill_name: "whoareyou".to_string(),
                scope: ScopeKind::Global,
                project_id: None,
            })
            .expect("import");
        assert!(outcome.message.contains("原目录未做任何改动"));
        assert!(origin.join("SKILL.md").is_file());
        assert!(fixture.store().join("whoareyou/SKILL.md").is_file());

        let scan = fixture.scan_global();
        let imported = skill(&scan, "whoareyou");
        assert!(!imported.is_external);
        assert_eq!(imported.source, SkillSource::Imported);
        assert!(
            imported
                .occurrences
                .iter()
                .any(|occurrence| occurrence.agent_id == "workbuddy"),
            "expected workbuddy occurrence"
        );

        let preview = fixture
            .service
            .preview_skill(PreviewSkillPayload {
                skill_name: "whoareyou".to_string(),
                scope: Some(ScopeKind::Global),
                project_id: None,
            })
            .expect("preview");
        assert!(!preview.is_external);
        assert!(
            preview.raw.contains("whoareyou") || preview.body.contains("只读原件"),
            "raw={} body={}",
            preview.raw,
            preview.body
        );
    }

    #[test]
    fn unauthorized_roots_are_not_visible_for_scans() {
        let fixture = Fixture::new();
        fixture.external(
            &fixture.home.join(".claude/skills"),
            "hidden-skill",
            "hidden-skill",
            "hidden",
            "# hidden",
        );

        fixture
            .service
            .authorize_root(&adapters::global_root_id("claude_code"), false)
            .expect("deauthorize");
        let scan = fixture.scan_global();
        assert!(
            !scan.skills.iter().any(|s| s.name == "hidden-skill"),
            "hidden-skill should not be visible when claude root is unauthorized"
        );

        fixture
            .service
            .authorize_root(&adapters::global_root_id("claude_code"), true)
            .expect("authorize");
        let scan = fixture.scan_global();
        assert!(scan.skills.iter().any(|s| s.name == "hidden-skill"));
    }

    #[test]
    fn theme_preference_defaults_to_system_and_persists_across_restart() {
        let fixture = Fixture::new();
        assert_eq!(
            fixture
                .service
                .bootstrap()
                .expect("bootstrap")
                .settings
                .theme,
            ThemePreference::System
        );

        let updated = fixture
            .service
            .set_theme(ThemePreference::Dark)
            .expect("set theme");
        assert_eq!(updated.theme, ThemePreference::Dark);

        let raw = fs::read_to_string(fixture.root.join("settings.json")).expect("settings.json");
        assert!(raw.contains("\"theme\": \"dark\""), "raw settings: {raw}");

        let reopened = AppService::new(AppPaths::new(fixture.home.clone(), fixture.root.clone()))
            .expect("reopen");
        assert_eq!(
            reopened.bootstrap().expect("bootstrap").settings.theme,
            ThemePreference::Dark
        );
    }

    #[test]
    fn settings_without_theme_field_falls_back_to_system() {
        let fixture = Fixture::new();
        fixture.service.bootstrap().expect("bootstrap");

        let path = fixture.root.join("settings.json");
        let raw = fs::read_to_string(&path).expect("settings.json");
        let mut json: serde_json::Value = serde_json::from_str(&raw).expect("json");
        json.as_object_mut()
            .expect("settings object")
            .remove("theme");
        fs::write(
            &path,
            serde_json::to_string_pretty(&json).expect("serialize"),
        )
        .expect("write settings");

        let reopened = AppService::new(AppPaths::new(fixture.home.clone(), fixture.root.clone()))
            .expect("reopen");
        assert_eq!(
            reopened.bootstrap().expect("bootstrap").settings.theme,
            ThemePreference::System
        );
    }

    #[test]
    fn custom_agent_root_is_authorized_and_can_receive_installs() {
        let fixture = Fixture::new();
        let agent_dir = fixture.home.join(".my-agent/skills");
        fs::create_dir_all(&agent_dir).expect("agent dir");
        fixture.central("weekly-menu", "weekly-menu", "说明", "# 正文");

        let bootstrap = fixture
            .service
            .add_custom_agent(AddCustomAgentPayload {
                name: "My Agent".to_string(),
                path: agent_dir.to_string_lossy().to_string(),
                icon_kind: "builtin".to_string(),
                icon_value: "cursor.svg".to_string(),
                icon_base64: None,
                authorized: true,
            })
            .expect("add custom agent");
        let root = bootstrap
            .roots
            .iter()
            .find(|root| root.is_custom)
            .expect("custom root");
        assert_eq!(root.agent_name, "My Agent");
        assert!(root.authorized);
        assert_eq!(root.icon_src.as_deref(), Some("/agent-icons/cursor.svg"));

        let outcome = fixture
            .service
            .install_skill(InstallSkillPayload {
                skill_name: "weekly-menu".to_string(),
                agent_id: root.agent_id.clone(),
                scope: ScopeKind::Global,
                project_id: None,
                force: false,
            })
            .expect("install to custom agent");
        assert!(matches!(
            outcome.mount_type,
            MountType::Symlink | MountType::Copy
        ));
        assert!(agent_dir.join("weekly-menu").exists());
        assert!(fixture.store().join("weekly-menu/SKILL.md").is_file());
    }

    #[test]
    fn custom_agent_validates_input_and_remove_cleans_up_config_only() {
        let fixture = Fixture::new();
        let agent_dir = fixture.home.join(".my-agent/skills");
        fs::create_dir_all(&agent_dir).expect("agent dir");

        let missing = fixture
            .service
            .add_custom_agent(AddCustomAgentPayload {
                name: "Missing".to_string(),
                path: fixture
                    .home
                    .join("does-not-exist")
                    .to_string_lossy()
                    .to_string(),
                icon_kind: "none".to_string(),
                icon_value: String::new(),
                icon_base64: None,
                authorized: true,
            })
            .unwrap_err();
        assert_eq!(missing.code, "PATH_MISSING");

        let bootstrap = fixture
            .service
            .add_custom_agent(AddCustomAgentPayload {
                name: "My Agent".to_string(),
                path: agent_dir.to_string_lossy().to_string(),
                icon_kind: "uploaded".to_string(),
                icon_value: "png".to_string(),
                icon_base64: Some("data:image/png;base64,AQID".to_string()),
                authorized: false,
            })
            .expect("add custom agent with uploaded icon");
        let root = bootstrap
            .roots
            .iter()
            .find(|root| root.is_custom)
            .expect("custom root");
        assert!(!root.authorized);
        assert!(
            root.icon_src
                .as_deref()
                .is_some_and(|src| src.starts_with("data:image/png;base64,"))
        );
        let icon_path = fixture
            .root
            .join("custom-icons")
            .join(format!("{}.png", root.agent_id));
        assert!(icon_path.is_file());

        let duplicate = fixture
            .service
            .add_custom_agent(AddCustomAgentPayload {
                name: "My Agent".to_string(),
                path: agent_dir.to_string_lossy().to_string(),
                icon_kind: "none".to_string(),
                icon_value: String::new(),
                icon_base64: None,
                authorized: true,
            })
            .unwrap_err();
        assert_eq!(duplicate.code, "AGENT_NAME_EXISTS");

        let updated = fixture
            .service
            .remove_custom_agent(&root.agent_id)
            .expect("remove custom agent");
        assert!(!updated.roots.iter().any(|root| root.is_custom));
        assert!(!icon_path.exists());
        assert!(
            agent_dir.is_dir(),
            "removal must not touch the disk directory"
        );
    }
}
