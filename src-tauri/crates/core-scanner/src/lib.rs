use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct ScanEntry {
    pub rel_path: String,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub mtime: i64,
    pub container_path: Option<String>,
}
pub struct ScanProgress {
    pub files_seen: usize,
    pub bytes_seen: u64,
}

pub fn collect_entries(
    root: &Path,
    cancel: &AtomicBool,
    on_progress: &dyn Fn(ScanProgress),
) -> Vec<ScanEntry> {
    if cancel.load(Ordering::Relaxed) {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut seen = 0usize;
    let mut bytes = 0u64;
    for entry in jwalk::WalkDir::new(root)
        .skip_hidden(false)
        .into_iter()
        .flatten()
    {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let meta = entry.metadata().ok();
        let size = meta.as_ref().map(|m| m.len() as i64).unwrap_or(0);
        let mtime = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let rel = p
            .strip_prefix(root)
            .unwrap_or(&p)
            .to_string_lossy()
            .to_string();
        bytes += size.max(0) as u64;
        seen += 1;
        if seen.is_multiple_of(1000) {
            on_progress(ScanProgress {
                files_seen: seen,
                bytes_seen: bytes,
            });
        }
        out.push(ScanEntry {
            rel_path: rel,
            name,
            ext,
            size,
            mtime,
            container_path: None,
        });
    }
    on_progress(ScanProgress {
        files_seen: seen,
        bytes_seen: bytes,
    });
    out
}
