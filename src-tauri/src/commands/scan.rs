use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
static CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn cancel_scan() -> Result<(), String> {
    CANCEL.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn scan_volume(
    root: String,
    label: String,
    serial: String,
    db_path: String,
) -> Result<u64, String> {
    CANCEL.store(false, Ordering::Relaxed);
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    let vid = db
        .insert_volume(&label, &serial)
        .map_err(|e| e.to_string())?;
    let rootp = Path::new(&root).to_path_buf();
    let entries = core_scanner::collect_entries(&rootp, &CANCEL, &|_| {});
    let mut batch = Vec::with_capacity(5000);
    let mut total = 0u64;
    // dirs cache mínima: un dir raíz por dirname
    use std::collections::HashMap;
    let mut dircache: HashMap<String, i64> = HashMap::new();
    for e in entries {
        let dkey = e
            .rel_path
            .rsplit_once('/')
            .map(|(d, _)| d.to_string())
            .unwrap_or("/".to_string());
        let dir_id = match dircache.get(&dkey) {
            Some(id) => *id,
            None => {
                let id = db
                    .insert_dir(vid, None, &dkey, &dkey)
                    .map_err(|e| e.to_string())?;
                dircache.insert(dkey.clone(), id);
                id
            }
        };
        batch.push(core_db::NewFile {
            dir_id,
            volume_id: vid,
            name: e.name,
            ext: e.ext,
            size: e.size,
            mtime: e.mtime,
            blake3: None,
            container_path: e.container_path,
            audio_json: None,
            image_json: None,
        });
        if batch.len() >= 5000 {
            db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
            total += batch.len() as u64;
            batch.clear();
        }
    }
    if !batch.is_empty() {
        db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
        total += batch.len() as u64;
    }
    Ok(total)
}
