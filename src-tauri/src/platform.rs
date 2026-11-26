//! Target-specific workarounds that must be applied before Tauri starts.

/// WebKitGTK's DMA-BUF renderer can hand the compositor a buffer that the V3D
/// driver on ARM boards (notably Raspberry Pi OS on Wayland) cannot sample, so
/// the first frame is garbled until a resize forces a new buffer allocation.
/// Returns the variable to set when the workaround applies.
fn dmabuf_renderer_override(arch: &str, already_set: bool) -> Option<(&'static str, &'static str)> {
    if already_set {
        return None;
    }
    matches!(arch, "aarch64" | "arm").then_some(("WEBKIT_DISABLE_DMABUF_RENDERER", "1"))
}

/// Must be called before the Tauri builder creates the webview: WebKitGTK
/// reads this variable while initializing its renderer.
pub fn apply_render_compat() {
    if !cfg!(target_os = "linux") {
        return;
    }
    let already_set = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some();
    if let Some((key, value)) = dmabuf_renderer_override(std::env::consts::ARCH, already_set) {
        // SAFETY: this runs at the very start of `run()`, before Tauri spawns
        // any thread, so no other thread can read or write the environment.
        unsafe { std::env::set_var(key, value) };
    }
}

#[cfg(test)]
mod tests {
    use super::dmabuf_renderer_override;

    #[test]
    fn dmabuf_override_applies_to_arm() {
        let expected = Some(("WEBKIT_DISABLE_DMABUF_RENDERER", "1"));
        assert_eq!(dmabuf_renderer_override("aarch64", false), expected);
        assert_eq!(dmabuf_renderer_override("arm", false), expected);
    }

    #[test]
    fn dmabuf_override_skips_other_targets_and_user_values() {
        assert_eq!(dmabuf_renderer_override("x86_64", false), None);
        assert_eq!(dmabuf_renderer_override("aarch64", true), None);
    }
}
