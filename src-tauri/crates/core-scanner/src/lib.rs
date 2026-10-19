use std::path::Path;

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
    /// Path just seen, relative to the walk root. It is what makes a long wait
    /// legible: the user can see the walk advancing through real folders.
    pub current_path: String,
}

/// Everything the walk needs to say and to ask.
///
/// The walk deliberately knows nothing about pausing, cancelling or where
/// errors go: it reports and blocks, and the caller decides. That keeps this
/// crate free of application concerns and, more usefully, testable without an
/// app, a database or a window.
pub trait ScanMonitor {
    /// The caller wants the walk to stop; whatever it has so far is returned.
    fn cancelled(&self) -> bool;
    /// Blocks while the caller wants the walk paused. Must return promptly on
    /// resume and on cancel, and must not busy-wait.
    fn park_if_paused(&self);
    fn progress(&self, progress: ScanProgress);
    /// Something could not be read. The walk keeps going: one unreadable
    /// folder is a hole in the catalog, not a reason to abandon the scan.
    fn failed(&self, path: &str, reason: &str);
}

/// A monitor that never pauses, never cancels and remembers nothing: callers
/// that only want the entries, and tests.
pub struct SilentMonitor;

impl ScanMonitor for SilentMonitor {
    fn cancelled(&self) -> bool {
        false
    }
    fn park_if_paused(&self) {}
    fn progress(&self, _progress: ScanProgress) {}
    fn failed(&self, _path: &str, _reason: &str) {}
}

/// Report every so many files: often enough to look alive, rare enough that
/// reporting never becomes the cost of the walk.
const PROGRESS_EVERY: usize = 250;

pub fn collect_entries(root: &Path, monitor: &dyn ScanMonitor) -> Vec<ScanEntry> {
    if monitor.cancelled() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut seen = 0usize;
    let mut bytes = 0u64;
    for item in jwalk::WalkDir::new(root).skip_hidden(false).into_iter() {
        let entry = match item {
            Ok(entry) => entry,
            Err(err) => {
                let path = err
                    .path()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| root.to_string_lossy().to_string());
                monitor.failed(&path, "no se pudo leer (permiso o E/S)");
                continue;
            }
        };
        // Checked before the entry is used, not after it is counted: a paused
        // walk must not keep growing the catalog behind the user's back.
        monitor.park_if_paused();
        if monitor.cancelled() {
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
        if seen == 1 || seen.is_multiple_of(PROGRESS_EVERY) {
            monitor.progress(ScanProgress {
                files_seen: seen,
                bytes_seen: bytes,
                current_path: rel.clone(),
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
    monitor.progress(ScanProgress {
        files_seen: seen,
        bytes_seen: bytes,
        current_path: String::new(),
    });
    out
}
