use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
static CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn cancel_scan() -> Result<(), String> {
    CANCEL.store(true, Ordering::Relaxed);
    Ok(())
}

/// Throttled scan progress pushed to the UI (`scan://progress`). `phase` is
/// "walk" while the directory tree is traversed and "index" while hashing +
/// DB writes run (the scanner only reports during the walk phase).
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct ScanEvent {
    pub phase: &'static str,
    pub files_seen: u64,
    pub bytes_seen: u64,
}

/// Cheap stable hex hash for normalized dir paths (NOT a content hash; only a
/// unique-ish key for dirs so re-scans resolve the same row). No new deps.
fn dir_hash(normalized: &str) -> String {
    let mut h = DefaultHasher::new();
    normalized.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Ensure the full normalized dir chain exists (`a/b` -> ensure `a`, then
/// `a/b` with real parent linkage). `dir_rel` is "" for the volume root.
/// Returns the leaf dir id. Idempotent via insert_dir upsert.
fn ensure_dir(
    db: &core_db::Db,
    volume_id: i64,
    dir_rel: &str,
    cache: &mut HashMap<String, i64>,
) -> Result<i64, String> {
    if dir_rel.is_empty() {
        if let Some(id) = cache.get("/") {
            return Ok(*id);
        }
        let id = db
            .insert_dir(volume_id, None, "/", &dir_hash("/"))
            .map_err(|e| e.to_string())?;
        cache.insert("/".to_string(), id);
        return Ok(id);
    }
    if let Some(id) = cache.get(dir_rel) {
        return Ok(*id);
    }
    let mut parent = ensure_dir(db, volume_id, "", cache)?;
    let mut acc = String::new();
    let mut leaf = parent;
    for comp in dir_rel.split('/').filter(|c| !c.is_empty()) {
        if !acc.is_empty() {
            acc.push('/');
        }
        acc.push_str(comp);
        if let Some(cached) = cache.get(&acc) {
            parent = *cached;
            leaf = *cached;
            continue;
        }
        let id = db
            .insert_dir(volume_id, Some(parent), comp, &dir_hash(&acc))
            .map_err(|e| e.to_string())?;
        cache.insert(acc.clone(), id);
        parent = id;
        leaf = id;
    }
    Ok(leaf)
}

/// Rebuild full normalized dir paths from (id, parent, name) rows. Legacy rows
/// (parent None, name holding a full "a/b" dkey) are used verbatim.
fn dir_full_paths(dirs: &[core_db::DirRow]) -> HashMap<i64, String> {
    let by_id: HashMap<i64, &core_db::DirRow> = dirs.iter().map(|d| (d.id, d)).collect();
    let mut memo: HashMap<i64, String> = HashMap::new();
    fn resolve(
        id: i64,
        by_id: &HashMap<i64, &core_db::DirRow>,
        memo: &mut HashMap<i64, String>,
    ) -> String {
        if let Some(p) = memo.get(&id) {
            return p.clone();
        }
        // Walk up to the nearest memoized (or root/cyclic) ancestor.
        let mut chain: Vec<i64> = Vec::new();
        let mut cur = id;
        loop {
            if memo.contains_key(&cur) || chain.contains(&cur) || !by_id.contains_key(&cur) {
                break;
            }
            chain.push(cur);
            match by_id[&cur].parent_id {
                Some(p) if p != cur => cur = p,
                _ => break,
            }
        }
        let mut base = memo.get(&cur).cloned().unwrap_or_default();
        for id in chain.iter().rev() {
            let row = by_id[id];
            if row.parent_id.is_none() && row.name.contains('/') {
                base = row.name.clone(); // legacy full-path row
            } else if base.is_empty() || base == "/" {
                base = if row.name == "/" {
                    "/".to_string()
                } else {
                    format!("/{}", row.name.trim_matches('/'))
                };
            } else {
                base = format!("{base}/{}", row.name.trim_matches('/'));
            }
        }
        if base.len() > 1 {
            base = base.trim_end_matches('/').to_string();
        }
        if base.is_empty() {
            base = "/".to_string();
        }
        // Canonical form: leading slash (matches scan-time dir_key), so rows
        // written by pre-normalization scans still resolve on re-scan.
        if !base.starts_with('/') {
            base = format!("/{base}");
        }
        memo.insert(id, base.clone());
        base
    }
    let ids: Vec<i64> = by_id.keys().copied().collect();
    let mut out = HashMap::new();
    for id in ids {
        out.insert(id, resolve(id, &by_id, &mut memo));
    }
    out
}

/// Async so the scan runs off the main thread (a sync command would freeze
/// the whole window during long walks); progress is streamed via events.
#[tauri::command]
pub async fn scan_volume(
    app: tauri::AppHandle,
    root: String,
    label: String,
    serial: String,
    db_path: String,
) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan_volume_blocking(&app, &root, &label, &serial, &db_path)
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))?
}

fn scan_volume_blocking(
    app: &tauri::AppHandle,
    root: &str,
    label: &str,
    serial: &str,
    db_path: &str,
) -> Result<u64, String> {
    use tauri::Emitter;
    let emitter = app.clone();
    scan_into_db(db_path, root, label, serial, &move |event: ScanEvent| {
        let _ = emitter.emit("scan://progress", event);
    })
}

/// Index `root` into the catalog at `db_path`, reporting progress through
/// `on_event`. Free of Tauri types on purpose: the whole scan pipeline
/// (walk, differential sync, enrichment, container expansion) is exercised
/// from tests by calling this directly.
///
/// Differential: files whose size and mtime are unchanged are skipped
/// entirely (no re-hash, no write); rows that no longer exist on disk are
/// deleted. Returns the number of files seen during the walk.
pub fn scan_into_db(
    db_path: &str,
    root: &str,
    label: &str,
    serial: &str,
    on_event: &dyn Fn(ScanEvent),
) -> Result<u64, String> {
    CANCEL.store(false, Ordering::Relaxed);
    let db = core_db::Db::open(Path::new(db_path)).map_err(|e| e.to_string())?;
    let vid = db.insert_volume(label, serial).map_err(|e| e.to_string())?;
    let rootp = Path::new(root).to_path_buf();
    let entries = core_scanner::collect_entries(&rootp, &CANCEL, &|p| {
        on_event(ScanEvent {
            phase: "walk",
            files_seen: p.files_seen as u64,
            bytes_seen: p.bytes_seen,
        });
    });
    on_event(ScanEvent {
        phase: "index",
        files_seen: entries.len() as u64,
        bytes_seen: entries.iter().map(|e| e.size.max(0) as u64).sum(),
    });

    // Snapshot of what's already indexed for differential sync:
    // (normalized_dir_path, file_name) -> (size, mtime, id). Entries removed
    // from this map as they are seen; leftovers are missing files to DELETE.
    let dir_paths = dir_full_paths(&db.dirs_for_volume(vid).map_err(|e| e.to_string())?);
    let mut existing: HashMap<(String, String), (i64, i64, i64)> = HashMap::new();
    for f in db.files_for_volume(vid).map_err(|e| e.to_string())? {
        let dir = dir_paths
            .get(&f.dir_id)
            .cloned()
            .unwrap_or_else(|| "/".to_string());
        existing.insert((dir, f.name), (f.size, f.mtime, f.id));
    }

    let mut batch: Vec<core_db::NewFile> = Vec::with_capacity(5000);
    let mut total = 0u64;
    let mut dircache: HashMap<String, i64> = HashMap::new();
    for e in entries {
        total += 1;
        // Normalize Windows separators so one volume never stores "a\b" and "a/b".
        let rel = e.rel_path.replace('\\', "/");
        let rel = rel.trim_start_matches('/').to_string();
        let (dir_rel, name) = match rel.rsplit_once('/') {
            Some((d, n)) => (d.to_string(), n.to_string()),
            None => (String::new(), rel.clone()),
        };
        // Canonical dir key matching dir_full_paths output.
        let dir_key = if dir_rel.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", dir_rel.trim_matches('/'))
        };
        match existing.remove(&(dir_key, name.clone())) {
            Some((size, mtime, _)) if size == e.size && mtime == e.mtime => {
                continue; // unchanged: skip entirely (no re-hash, no write)
            }
            Some((_, _, id)) => {
                // Changed metadata: recompute hash (never fail the scan) + UPDATE.
                let abs = rootp.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                let hash = core_hash::blake3_partial(&abs, 65536).ok();
                db.update_file(id, e.size, e.mtime, hash.as_deref())
                    .map_err(|e| e.to_string())?;
            }
            None => {
                let dir_id = ensure_dir(&db, vid, &dir_rel, &mut dircache)?;
                let abs = rootp.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                let hash = core_hash::blake3_partial(&abs, 65536).ok();
                batch.push(core_db::NewFile {
                    dir_id,
                    volume_id: vid,
                    name,
                    ext: e.ext,
                    size: e.size,
                    mtime: e.mtime,
                    blake3: hash,
                    container_path: e.container_path,
                    audio_json: None,
                    image_json: None,
                });
                if batch.len() >= 5000 {
                    db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
                    batch.clear();
                }
            }
        }
    }
    if !batch.is_empty() {
        db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
    }
    // Whatever was never seen is gone from disk: delete it, then collect dirs
    // left empty (bottom-up, files/children never harmed).
    let missing: Vec<i64> = existing.values().map(|(_, _, id)| *id).collect();
    db.delete_files(&missing).map_err(|e| e.to_string())?;
    db.delete_empty_dirs(vid).map_err(|e| e.to_string())?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_db::{Db, ParsedQuery};
    use std::fs;
    use std::path::Path as StdPath;

    /// Every row in the catalog, read through the same query interface the
    /// app uses (empty query = no MATCH, all rows).
    fn all_rows(db_path: &StdPath) -> Vec<core_db::SearchHit> {
        let db = Db::open(db_path).unwrap();
        db.search(
            &ParsedQuery {
                fts: String::new(),
                ext: None,
                exts: Vec::new(),
                min_size: None,
                max_size: None,
                volume: None,
            },
            1000,
        )
        .unwrap()
    }

    fn scan(db_path: &StdPath, root: &StdPath) -> u64 {
        scan_into_db(
            db_path.to_str().unwrap(),
            root.to_str().unwrap(),
            "TestVol",
            "SER-1",
            &|_| {},
        )
        .unwrap()
    }

    fn setup() -> (tempfile::TempDir, tempfile::TempDir) {
        (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap())
    }

    #[test]
    fn scan_indexes_nested_files_with_dir_paths() {
        let (root, cat) = setup();
        let db = cat.path().join("t.cdc");
        fs::create_dir_all(root.path().join("sub/deep")).unwrap();
        fs::write(root.path().join("top.txt"), b"hello").unwrap();
        fs::write(root.path().join("sub/deep/song.flac"), b"world").unwrap();

        assert_eq!(scan(&db, root.path()), 2);

        let mut rows: Vec<(String, String)> = all_rows(&db)
            .into_iter()
            .map(|h| (h.path.clone(), h.name.clone()))
            .collect();
        rows.sort();
        assert_eq!(
            rows,
            vec![
                ("/".to_string(), "top.txt".to_string()),
                ("/sub/deep".to_string(), "song.flac".to_string()),
            ]
        );
    }

    #[test]
    fn rescan_skips_unchanged_and_deletes_removed_files() {
        let (root, cat) = setup();
        let db = cat.path().join("t.cdc");
        fs::create_dir_all(root.path().join("sub")).unwrap();
        fs::write(root.path().join("top.txt"), b"hello").unwrap();
        fs::write(root.path().join("sub/gone.txt"), b"bye").unwrap();

        scan(&db, root.path());
        let first: Vec<String> = all_rows(&db).into_iter().map(|h| h.name).collect();
        assert_eq!(first.len(), 2);

        // Unchanged rescan must not duplicate rows.
        scan(&db, root.path());
        assert_eq!(all_rows(&db).len(), 2);

        // Removed file disappears, survivors stay.
        fs::remove_file(root.path().join("sub/gone.txt")).unwrap();
        scan(&db, root.path());
        let names: Vec<String> = all_rows(&db).into_iter().map(|h| h.name).collect();
        assert_eq!(names, vec!["top.txt".to_string()]);
    }
}
