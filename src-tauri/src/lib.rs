#![allow(dead_code)]

mod adapters;
mod error;
mod fsutil;
mod model;
mod paths;
mod platform;
mod service;
#[cfg(test)]
mod service_tests;
mod skill;

use crate::error::{CmdError, CmdResult};
use crate::model::*;
use crate::model::{
    BundleOutcome, BundleSkillPayload, BundlesOutcome, CreateBundlePayload,
    DistributeBundleOutcome, DistributeBundlePayload, ExportBackupOutcome, ExportBackupPayload,
    ImportBackupOutcome, ImportBackupPayload, UpdateBundlePayload,
};
use crate::paths::AppPaths;
use crate::service::AppService;
use std::sync::Arc;
use tauri::{Manager, State};

async fn blocking<T, F>(task: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> CmdResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| {
            CmdError::new("TASK_FAILED", "后台任务执行失败").with_detail(error.to_string())
        })?
}

#[tauri::command]
async fn bootstrap(state: State<'_, Arc<AppService>>) -> CmdResult<Bootstrap> {
    let service = state.inner().clone();
    blocking(move || service.bootstrap()).await
}

#[tauri::command]
async fn authorize_root(
    state: State<'_, Arc<AppService>>,
    root_id: String,
    authorized: bool,
) -> CmdResult<Bootstrap> {
    let service = state.inner().clone();
    blocking(move || service.authorize_root(&root_id, authorized)).await
}

#[tauri::command]
async fn add_custom_agent(
    state: State<'_, Arc<AppService>>,
    payload: AddCustomAgentPayload,
) -> CmdResult<Bootstrap> {
    let service = state.inner().clone();
    blocking(move || service.add_custom_agent(payload)).await
}

#[tauri::command]
async fn remove_custom_agent(
    state: State<'_, Arc<AppService>>,
    id: String,
) -> CmdResult<Bootstrap> {
    let service = state.inner().clone();
    blocking(move || service.remove_custom_agent(&id)).await
}

#[tauri::command]
async fn set_theme(
    state: State<'_, Arc<AppService>>,
    theme: ThemePreference,
) -> CmdResult<Settings> {
    let service = state.inner().clone();
    blocking(move || service.set_theme(theme)).await
}

#[tauri::command]
async fn save_update_settings(
    state: State<'_, Arc<AppService>>,
    payload: UpdateSettings,
) -> CmdResult<Settings> {
    let service = state.inner().clone();
    blocking(move || service.save_update_settings(payload)).await
}

#[tauri::command]
async fn register_project(
    state: State<'_, Arc<AppService>>,
    payload: RegisterProjectPayload,
) -> CmdResult<Project> {
    let service = state.inner().clone();
    blocking(move || service.register_project(payload)).await
}

#[tauri::command]
async fn remove_project(
    state: State<'_, Arc<AppService>>,
    project_id: String,
) -> CmdResult<Bootstrap> {
    let service = state.inner().clone();
    blocking(move || service.remove_project(&project_id)).await
}

#[tauri::command]
async fn scan_skills(
    state: State<'_, Arc<AppService>>,
    payload: ScanPayload,
) -> CmdResult<ScanResult> {
    let service = state.inner().clone();
    blocking(move || service.scan_skills(payload)).await
}

#[tauri::command]
async fn preview_skill(
    state: State<'_, Arc<AppService>>,
    payload: PreviewSkillPayload,
) -> CmdResult<SkillPreview> {
    let service = state.inner().clone();
    blocking(move || service.preview_skill(payload)).await
}

#[tauri::command]
async fn install_skill(
    state: State<'_, Arc<AppService>>,
    payload: InstallSkillPayload,
) -> CmdResult<MountOutcome> {
    let service = state.inner().clone();
    blocking(move || service.install_skill(payload)).await
}

#[tauri::command]
async fn install_skills(
    state: State<'_, Arc<AppService>>,
    payload: InstallSkillsPayload,
) -> CmdResult<InstallSkillsOutcome> {
    let service = state.inner().clone();
    blocking(move || service.install_skills(payload)).await
}

#[tauri::command]
async fn uninstall_skill(
    state: State<'_, Arc<AppService>>,
    payload: UninstallSkillPayload,
) -> CmdResult<MountOutcome> {
    let service = state.inner().clone();
    blocking(move || service.uninstall_skill(payload)).await
}

#[tauri::command]
async fn import_skill(
    state: State<'_, Arc<AppService>>,
    payload: ImportSkillPayload,
) -> CmdResult<ImportOutcome> {
    let service = state.inner().clone();
    blocking(move || service.import_skill(payload)).await
}

#[tauri::command]
async fn save_skill(
    state: State<'_, Arc<AppService>>,
    payload: SaveSkillPayload,
) -> CmdResult<SaveSkillOutcome> {
    let service = state.inner().clone();
    blocking(move || service.save_skill(payload)).await
}

#[tauri::command]
async fn create_skill(
    state: State<'_, Arc<AppService>>,
    payload: CreateSkillPayload,
) -> CmdResult<CreateSkillOutcome> {
    let service = state.inner().clone();
    blocking(move || service.create_skill(payload)).await
}

#[tauri::command]
async fn list_bundles(state: State<'_, Arc<AppService>>) -> CmdResult<BundlesOutcome> {
    let service = state.inner().clone();
    blocking(move || service.list_bundles()).await
}

#[tauri::command]
async fn create_bundle(
    state: State<'_, Arc<AppService>>,
    payload: CreateBundlePayload,
) -> CmdResult<BundleOutcome> {
    let service = state.inner().clone();
    blocking(move || service.create_bundle(payload)).await
}

#[tauri::command]
async fn update_bundle(
    state: State<'_, Arc<AppService>>,
    payload: UpdateBundlePayload,
) -> CmdResult<BundleOutcome> {
    let service = state.inner().clone();
    blocking(move || service.update_bundle(payload)).await
}

#[tauri::command]
async fn delete_bundle(state: State<'_, Arc<AppService>>, bundle_id: String) -> CmdResult<()> {
    let service = state.inner().clone();
    blocking(move || service.delete_bundle(bundle_id)).await
}

#[tauri::command]
async fn add_skill_to_bundle(
    state: State<'_, Arc<AppService>>,
    payload: BundleSkillPayload,
) -> CmdResult<BundleOutcome> {
    let service = state.inner().clone();
    blocking(move || service.add_skill_to_bundle(payload)).await
}

#[tauri::command]
async fn remove_skill_from_bundle(
    state: State<'_, Arc<AppService>>,
    payload: BundleSkillPayload,
) -> CmdResult<BundleOutcome> {
    let service = state.inner().clone();
    blocking(move || service.remove_skill_from_bundle(payload)).await
}

#[tauri::command]
async fn export_backup(
    state: State<'_, Arc<AppService>>,
    payload: ExportBackupPayload,
) -> CmdResult<ExportBackupOutcome> {
    let service = state.inner().clone();
    blocking(move || service.export_backup(payload)).await
}

#[tauri::command]
async fn import_backup(
    state: State<'_, Arc<AppService>>,
    payload: ImportBackupPayload,
) -> CmdResult<ImportBackupOutcome> {
    let service = state.inner().clone();
    blocking(move || service.import_backup(payload)).await
}

#[tauri::command]
async fn distribute_bundle(
    state: State<'_, Arc<AppService>>,
    payload: DistributeBundlePayload,
) -> CmdResult<DistributeBundleOutcome> {
    let service = state.inner().clone();
    blocking(move || service.distribute_bundle(payload)).await
}

/// Re-apply the window's current size once so WebKitGTK reallocates its
/// drawing buffer. On some Wayland/ARM setups the first buffer is invalid and
/// the page stays garbled until a resize (e.g. fullscreen) happens.
#[cfg(target_os = "linux")]
fn nudge_webview_repaint(app: &tauri::AppHandle) -> bool {
    use tauri::PhysicalSize;

    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    let Ok(size) = window.inner_size() else {
        return false;
    };
    if size.width < 2 || size.height < 2 {
        return false;
    }
    let _ = window.set_size(PhysicalSize::new(size.width, size.height - 1));
    let _ = window.set_size(size);
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    platform::apply_render_compat();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let paths = AppPaths::detect();
            let service = AppService::new(paths)?;
            app.manage(Arc::new(service));
            #[cfg(target_os = "linux")]
            {
                // Defer until the window is mapped and has painted once.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(400));
                    let _ = handle.run_on_main_thread(move || nudge_webview_repaint(&handle));
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            authorize_root,
            add_custom_agent,
            remove_custom_agent,
            set_theme,
            save_update_settings,
            register_project,
            remove_project,
            scan_skills,
            preview_skill,
            install_skill,
            install_skills,
            uninstall_skill,
            import_skill,
            save_skill,
            create_skill,
            list_bundles,
            create_bundle,
            update_bundle,
            delete_bundle,
            add_skill_to_bundle,
            remove_skill_from_bundle,
            export_backup,
            import_backup,
            distribute_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running mySkills");
}
