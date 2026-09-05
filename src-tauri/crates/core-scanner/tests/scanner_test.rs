use std::sync::atomic::AtomicBool;
#[test]
fn collects_nested_files_and_cancels() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("a/b")).unwrap();
    std::fs::write(dir.path().join("a/b/song.mp3"), b"fake").unwrap();
    std::fs::write(dir.path().join("top.txt"), b"hi").unwrap();
    let cancel = AtomicBool::new(false);
    let entries = core_scanner::collect_entries(dir.path(), &cancel, &|_| {});
    assert_eq!(entries.len(), 2);
    cancel.store(true, std::sync::atomic::Ordering::Relaxed);
    let entries2 = core_scanner::collect_entries(dir.path(), &cancel, &|_| {});
    assert!(entries2.is_empty());
}
