use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub home: PathBuf,
    pub root: PathBuf,
    pub store: PathBuf,
    pub trash: PathBuf,
    pub manifest: PathBuf,
    pub settings: PathBuf,
    pub last_scan: PathBuf,
}

impl AppPaths {
    /// Resolve the real user home directory and the mySkills data root.
    ///
    /// `MYSKILLS_HOME` is an explicit opt-in used by development builds and
    /// integration tests; it never changes the Agent workspace paths.
    pub fn detect() -> Self {
        let home = env::var_os("USERPROFILE")
            .filter(|value| !value.is_empty())
            .or_else(|| env::var_os("HOME").filter(|value| !value.is_empty()))
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));

        let root = env::var_os("MYSKILLS_HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".myskills"));

        Self::new(home, root)
    }

    pub fn new(home: PathBuf, root: PathBuf) -> Self {
        Self {
            store: root.join("store"),
            trash: root.join("trash"),
            manifest: root.join("manifest.json"),
            settings: root.join("settings.json"),
            last_scan: root.join("last-scan.json"),
            home,
            root,
        }
    }

    pub fn ensure(&self) -> io::Result<()> {
        fs::create_dir_all(&self.store)?;
        fs::create_dir_all(&self.trash)?;
        fs::create_dir_all(&self.root)?;
        Ok(())
    }

    /// Human readable path with the user's home directory collapsed to `~`.
    pub fn display(&self, path: &Path) -> String {
        let path = clean_path(path);
        if let Ok(relative) = path.strip_prefix(clean_path(&self.home)) {
            let relative = relative.to_string_lossy().replace('\\', "/");
            if relative.is_empty() {
                "~".to_string()
            } else {
                format!("~/{relative}")
            }
        } else {
            path.to_string_lossy().replace('\\', "/")
        }
    }

    /// Path form used in UI/display. Anything outside the home directory is
    /// reduced to a marker plus the final component, never a full absolute path.
    pub fn redact(&self, path: &Path) -> String {
        let path = clean_path(path);
        if let Ok(relative) = path.strip_prefix(clean_path(&self.home)) {
            let relative = relative.to_string_lossy().replace('\\', "/");
            if relative.is_empty() {
                "~".to_string()
            } else {
                format!("~/{relative}")
            }
        } else {
            let name = path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            format!("[external]/{name}")
        }
    }

    pub fn parse_project_path(&self, raw: &str) -> PathBuf {
        let trimmed = raw.trim();
        if trimmed == "~" {
            return self.home.clone();
        }
        if let Some(rest) = trimmed
            .strip_prefix("~/")
            .or_else(|| trimmed.strip_prefix("~\\"))
        {
            return self.home.join(rest);
        }
        PathBuf::from(trimmed)
    }
}

/// Strip the Windows verbatim prefix produced by `canonicalize` so paths can be
/// compared with and displayed alongside normal user-facing paths.
pub fn clean_path(path: &Path) -> PathBuf {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = value.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

/// Canonical form used for ownership comparisons, with a lexical fallback.
///
/// macOS `tempfile` paths live under `/var/folders/...` but `canonicalize()`
/// resolves them to `/private/var/folders/...`; comparing a canonical mount
/// target against the raw store path then misclassifies our own symlink as a
/// conflict. Resolving both sides keeps Linux/macOS/Windows consistent.
pub fn canonical_for_compare(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| clean_path(path))
}

/// Lexically normalise a path without touching the file system. This keeps
/// comparisons predictable for paths that may not exist yet.
pub fn normalize(path: &Path) -> PathBuf {
    let cleaned = clean_path(path);
    let mut result = PathBuf::new();
    for component in cleaned.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                result.pop();
            }
            other => result.push(other.as_os_str()),
        }
    }
    result
}

pub fn is_under(parent: &Path, child: &Path) -> bool {
    let parent = normalize(parent);
    let child = normalize(child);
    child.starts_with(parent)
}

pub fn path_key(path: &Path) -> String {
    let value = normalize(path).to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    {
        value.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        value
    }
}

pub fn short_hash(value: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let result = hasher.finalize();
    result[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;

    /// macOS temp dirs are under `/var`, which canonicalizes to `/private/var`.
    /// Ownership checks must compare canonical forms on both sides.
    #[test]
    fn canonical_for_compare_resolves_symlinked_parents() {
        let temp = tempfile::tempdir().expect("temp dir");
        let real = temp.path().join("real");
        fs::create_dir_all(real.join("store/skill")).expect("dirs");
        let alias = temp.path().join("alias");
        std::os::unix::fs::symlink(&real, &alias).expect("symlink");

        let store_via_alias = alias.join("store");
        let canonical_mount = store_via_alias
            .join("skill")
            .canonicalize()
            .expect("canonical");
        assert!(!is_under(&store_via_alias, &canonical_mount));
        assert!(is_under(
            &canonical_for_compare(&store_via_alias),
            &canonical_mount
        ));
    }
}
