use crate::error::{CmdError, CmdResult};
use atomic_write_file::AtomicWriteFile;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::fs;
use std::io::Write;
use std::path::Path;

/// Create a ZIP archive from all files under `source_dir`.
pub fn create_zip_archive(source_dir: &Path, output: &Path) -> CmdResult<()> {
    if !source_dir.is_dir() {
        return Err(CmdError::new("NOT_FOUND", "源目录不存在"));
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|error| CmdError::io("无法创建目标目录", error))?;
    }
    let file =
        fs::File::create(output).map_err(|error| CmdError::io("无法创建 ZIP 文件", error))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for entry in walkdir::WalkDir::new(source_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path == source_dir {
            continue;
        }
        let relative = path
            .strip_prefix(source_dir)
            .map_err(|error| CmdError::io("无法计算相对路径", error))?;
        let archive_name = relative.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            zip.add_directory(archive_name, options)
                .map_err(|error| CmdError::io("无法写入 ZIP 目录项", error))?;
        } else if path.is_file() {
            zip.start_file(archive_name, options)
                .map_err(|error| CmdError::io("无法写入 ZIP 文件项", error))?;
            let mut f =
                fs::File::open(path).map_err(|error| CmdError::io("无法读取源文件", error))?;
            std::io::copy(&mut f, &mut zip)
                .map_err(|error| CmdError::io("无法写入 ZIP 内容", error))?;
        }
    }
    zip.finish()
        .map_err(|error| CmdError::io("无法完成 ZIP 写入", error))?;
    Ok(())
}

/// Extract a ZIP archive into `dest_dir`.
pub fn extract_zip_archive(archive: &Path, dest_dir: &Path) -> CmdResult<()> {
    if !archive.is_file() {
        return Err(CmdError::new("NOT_FOUND", "ZIP 文件不存在"));
    }
    fs::create_dir_all(dest_dir).map_err(|error| CmdError::io("无法创建目标目录", error))?;
    let file = fs::File::open(archive).map_err(|error| CmdError::io("无法打开 ZIP 文件", error))?;
    let mut zip =
        zip::ZipArchive::new(file).map_err(|error| CmdError::io("无法读取 ZIP 归档", error))?;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|error| CmdError::io("无法读取 ZIP 条目", error))?;
        let entry_name = entry
            .enclosed_name()
            .ok_or_else(|| CmdError::new("INVALID_ZIP_ENTRY", "ZIP 条目名称无效"))?;
        let target_path = dest_dir.join(entry_name);
        if entry.is_dir() {
            fs::create_dir_all(&target_path)
                .map_err(|error| CmdError::io("无法创建 ZIP 目录", error))?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| CmdError::io("无法创建目标目录", error))?;
            }
            let mut out_file = fs::File::create(&target_path)
                .map_err(|error| CmdError::io("无法创建输出文件", error))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|error| CmdError::io("无法写入输出文件", error))?;
        }
    }
    Ok(())
}

/// Atomically write raw bytes to a file, replacing any existing content.
pub fn write_file(path: &Path, data: &[u8]) -> CmdResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| CmdError::io("无法创建目标目录", error))?;
    }
    let mut file =
        AtomicWriteFile::open(path).map_err(|error| CmdError::io("无法打开临时文件", error))?;
    file.write_all(data)
        .map_err(|error| CmdError::io("无法写入临时文件", error))?;
    file.commit()
        .map_err(|error| CmdError::io("无法原子替换文件", error))?;
    Ok(())
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> CmdResult<()> {
    let data = serde_json::to_vec_pretty(value)
        .map_err(|error| CmdError::io("无法序列化本地数据", error))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| CmdError::io("无法创建应用数据目录", error))?;
    }
    let mut file =
        AtomicWriteFile::open(path).map_err(|error| CmdError::io("无法打开临时文件", error))?;
    file.write_all(&data)
        .map_err(|error| CmdError::io("无法写入临时文件", error))?;
    file.commit()
        .map_err(|error| CmdError::io("无法原子替换数据文件", error))?;
    Ok(())
}

pub fn read_json_or<T: DeserializeOwned>(path: &Path, fallback: T) -> CmdResult<T> {
    if !path.exists() {
        return Ok(fallback);
    }
    let bytes = fs::read(path).map_err(|error| CmdError::io("无法读取本地数据", error))?;
    if bytes.is_empty() {
        return Ok(fallback);
    }
    serde_json::from_slice(&bytes).map_err(|error| {
        CmdError::new(
            "DATA_CORRUPT",
            format!("本地数据文件格式损坏：{}", path.display()),
        )
        .with_detail(error.to_string())
    })
}

/// Recursively copy a directory without following symbolic links. A symlink in
/// the source aborts the operation instead of silently copying an unexpected
/// target outside the library.
pub fn copy_dir_all(source: &Path, destination: &Path) -> CmdResult<()> {
    if !source.is_dir() {
        return Err(CmdError::new("NOT_FOUND", "源目录不存在"));
    }
    fs::create_dir_all(destination).map_err(|error| CmdError::io("无法创建目标目录", error))?;

    for entry in fs::read_dir(source).map_err(|error| CmdError::io("无法读取源目录", error))?
    {
        let entry = entry.map_err(|error| CmdError::io("无法读取目录项", error))?;
        let file_type = entry
            .file_type()
            .map_err(|error| CmdError::io("无法识别目录项类型", error))?;
        let source_path = entry.path();
        let target_path = destination.join(entry.file_name());

        if file_type.is_symlink() {
            return Err(CmdError::new(
                "SYMLINK_IN_SOURCE",
                format!(
                    "{} 包含符号链接，已中止复制",
                    entry.file_name().to_string_lossy()
                ),
            ));
        }
        if file_type.is_dir() {
            copy_dir_all(&source_path, &target_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &target_path)
                .map_err(|error| CmdError::io("无法复制文件", error))?;
        }
    }
    Ok(())
}

pub fn remove_symlink(path: &Path) -> CmdResult<()> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| CmdError::io("无法读取安装状态", error))?;
    if !metadata.file_type().is_symlink() {
        return Err(CmdError::new("NOT_SYMLINK", "目标不是符号链接"));
    }
    // A directory symlink needs remove_dir on Windows; fall back to remove_file
    // for file links and platforms that report the link as a file.
    if fs::remove_dir(path).is_err() {
        fs::remove_file(path).map_err(|error| CmdError::io("无法移除符号链接", error))?;
    }
    Ok(())
}

#[cfg(windows)]
pub fn create_dir_symlink(source: &Path, target: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_dir(source, target)
}

#[cfg(not(windows))]
pub fn create_dir_symlink(source: &Path, target: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}
