use crate::error::{CmdError, CmdResult};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct ParsedSkill {
    pub name: String,
    pub description: String,
    pub version: Option<String>,
    pub raw: String,
    pub body: String,
    pub frontmatter: Value,
    pub fingerprint: String,
}

pub fn read_skill_dir(dir: &Path, fallback_name: &str) -> CmdResult<ParsedSkill> {
    let skill_file = dir.join("SKILL.md");
    if !skill_file.is_file() {
        return Err(CmdError::new(
            "INVALID_SKILL",
            format!("{fallback_name} 缺少 SKILL.md"),
        ));
    }
    let raw = fs::read_to_string(&skill_file)
        .map_err(|error| CmdError::io("无法读取 SKILL.md", error))?;
    if raw.len() > 4 * 1024 * 1024 {
        return Err(CmdError::new(
            "SKILL_TOO_LARGE",
            "SKILL.md 超过 4 MB，已中止读取",
        ));
    }
    Ok(parse_skill_text(&raw, fallback_name))
}

pub fn parse_skill_text(raw: &str, fallback_name: &str) -> ParsedSkill {
    let clean = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let (yaml, body) = split_frontmatter_owned(clean);
    let frontmatter = if yaml.trim().is_empty() {
        Value::Object(Default::default())
    } else {
        match serde_yaml_ng::from_str::<serde_yaml_ng::Value>(&yaml) {
            Ok(value) => serde_json::to_value(value).unwrap_or(Value::Null),
            Err(_) => Value::Null,
        }
    };

    let name = frontmatter
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_name)
        .to_string();

    let description = frontmatter
        .get("description")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| first_paragraph(&body));

    let version = frontmatter
        .get("version")
        .map(|value| match value {
            Value::String(text) => text.clone(),
            other => other.to_string(),
        })
        .filter(|value| !value.is_empty());

    let mut hasher = Sha256::new();
    hasher.update(clean.as_bytes());
    let fingerprint = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();

    ParsedSkill {
        name,
        description,
        version,
        raw: clean.to_string(),
        body,
        frontmatter,
        fingerprint,
    }
}

fn split_frontmatter_owned(raw: &str) -> (String, String) {
    let normalized = raw.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    if lines.first().map(|line| line.trim()) != Some("---") {
        return (String::new(), normalized);
    }
    let Some(end) = lines
        .iter()
        .enumerate()
        .skip(1)
        .find(|(_, line)| line.trim() == "---")
        .map(|(index, _)| index)
    else {
        return (String::new(), normalized);
    };
    let yaml = lines[1..end].join("\n");
    let body = if end + 1 < lines.len() {
        lines[end + 1..].join("\n")
    } else {
        String::new()
    };
    (yaml, body)
}

fn first_paragraph(body: &str) -> String {
    let mut paragraph = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !paragraph.is_empty() {
                break;
            }
            continue;
        }
        if trimmed.starts_with('#') {
            if !paragraph.is_empty() {
                break;
            }
            continue;
        }
        paragraph.push(trimmed.trim_start_matches(['-', '*', '>']).trim());
        if paragraph.join(" ").chars().count() > 160 {
            break;
        }
    }
    let joined = paragraph.join(" ");
    if joined.chars().count() > 160 {
        format!("{}…", joined.chars().take(159).collect::<String>())
    } else {
        joined
    }
}

pub fn dir_fingerprint(dir: &Path) -> CmdResult<String> {
    if !dir.is_dir() {
        return Err(CmdError::new("NOT_FOUND", "目录不存在"));
    }
    let mut files: Vec<(String, String)> = Vec::new();
    for entry in WalkDir::new(dir).follow_links(false) {
        let entry = entry.map_err(|error| CmdError::io("无法遍历目录", error))?;
        let relative = entry
            .path()
            .strip_prefix(dir)
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| CmdError::io("无法读取目录项", error))?;
        if metadata.is_file() {
            let bytes = fs::read(entry.path())
                .map_err(|error| CmdError::io("无法读取文件用于校验", error))?;
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let hash = hasher
                .finalize()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            files.push((relative, hash));
        } else if metadata.file_type().is_symlink() {
            let target = fs::read_link(entry.path())
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default();
            files.push((relative, format!("symlink:{target}")));
        }
    }
    files.sort();
    let mut hasher = Sha256::new();
    for (path, hash) in files {
        hasher.update(path.as_bytes());
        hasher.update(b"\0");
        hasher.update(hash.as_bytes());
        hasher.update(b"\0");
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
