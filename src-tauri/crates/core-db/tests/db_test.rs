use core_db::{Db, NewFile, ParsedQuery};
use tempfile::tempdir;

#[test]
fn insert_and_search_by_ext() {
    let dir = tempdir().unwrap();
    let db = Db::open(&dir.path().join("t.cdc")).unwrap();
    let v = db.insert_volume("Backup-12", "SER-1").unwrap();
    let d = db.insert_dir(v, None, "mp3", "h1").unwrap();
    db.insert_file_batch(&[
        NewFile {
            dir_id: d,
            volume_id: v,
            name: "song.mp3".into(),
            ext: "mp3".into(),
            size: 9_000_000,
            mtime: 0,
            blake3: None,
            container_path: None,
            audio_json: None,
            image_json: None,
        },
        NewFile {
            dir_id: d,
            volume_id: v,
            name: "notes.txt".into(),
            ext: "txt".into(),
            size: 10,
            mtime: 0,
            blake3: None,
            container_path: None,
            audio_json: None,
            image_json: None,
        },
    ])
    .unwrap();
    let hits = db
        .search(
            &ParsedQuery {
                fts: "song".into(),
                ext: Some("mp3".into()),
                exts: Vec::new(),
                min_size: None,
                max_size: None,
                volume: None,
            },
            50,
        )
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].name, "song.mp3");
}
