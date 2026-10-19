use core_scanner::{collect_entries, ScanMonitor, ScanProgress, SilentMonitor};
use std::sync::Mutex;

/// A monitor that cancels from the very first check.
struct CancelNow;

impl ScanMonitor for CancelNow {
    fn cancelled(&self) -> bool {
        true
    }
    fn park_if_paused(&self) {}
    fn progress(&self, _progress: ScanProgress) {}
    fn failed(&self, _path: &str, _reason: &str) {}
}

/// Records what the walk said, so the reporting contract can be asserted.
#[derive(Default)]
struct Recorder {
    progress: Mutex<Vec<ScanProgress>>,
}

impl ScanMonitor for Recorder {
    fn cancelled(&self) -> bool {
        false
    }
    fn park_if_paused(&self) {}
    fn progress(&self, progress: ScanProgress) {
        self.progress.lock().unwrap().push(progress);
    }
    fn failed(&self, _path: &str, _reason: &str) {}
}

#[test]
fn collects_nested_files_and_cancels() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("a/b")).unwrap();
    std::fs::write(dir.path().join("a/b/song.mp3"), b"fake").unwrap();
    std::fs::write(dir.path().join("top.txt"), b"hi").unwrap();

    let entries = collect_entries(dir.path(), &SilentMonitor);
    assert_eq!(entries.len(), 2);
    assert!(collect_entries(dir.path(), &CancelNow).is_empty());
}

#[test]
fn progress_names_the_file_it_just_saw() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("fotos/2024")).unwrap();
    std::fs::write(dir.path().join("fotos/2024/IMG_0001.jpg"), b"jpg").unwrap();

    let recorder = Recorder::default();
    let entries = collect_entries(dir.path(), &recorder);
    assert_eq!(entries.len(), 1);

    let progress = recorder.progress.lock().unwrap();
    // First word is immediate (the walk must look alive from the start) and
    // the last one closes the count, even when nothing changed since.
    let first = progress.first().expect("no progress reported");
    assert_eq!(first.files_seen, 1);
    assert_eq!(first.current_path, "fotos/2024/IMG_0001.jpg");
    let last = progress.last().unwrap();
    assert_eq!(last.files_seen, 1);
    assert_eq!(last.bytes_seen, 3);
}
