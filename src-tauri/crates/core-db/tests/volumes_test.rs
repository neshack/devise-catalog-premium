//! Volume identity beyond the scan: description, catalog image, and the
//! export that carries them.

use core_db::{Db, NewFile};
use tempfile::tempdir;

fn add_file(db: &Db, volume: i64, dir: i64, name: &str, size: i64) {
    db.insert_file_batch(&[NewFile {
        dir_id: dir,
        volume_id: volume,
        name: name.into(),
        ext: name.rsplit_once('.').map(|(_, e)| e.to_string()).unwrap_or_default(),
        size,
        mtime: 0,
        blake3: None,
        container_path: None,
        audio_json: None,
        image_json: None,
    }])
    .unwrap();
}

#[test]
fn description_and_cover_round_trip() {
    let tmp = tempdir().unwrap();
    let db = Db::open(&tmp.path().join("t.cdc")).unwrap();
    let id = db.insert_volume("SD Azul", "N35USB128").unwrap();

    db.set_volume_description(id, Some("  Fotos de 2016  ")).unwrap();
    db.set_volume_cover(id, Some("data:image/jpeg;base64,AAAA")).unwrap();

    let volume = &db.list_volumes().unwrap()[0];
    assert_eq!(volume.description.as_deref(), Some("Fotos de 2016"));
    assert_eq!(volume.cover.as_deref(), Some("data:image/jpeg;base64,AAAA"));

    // Clearing is a write, not a missing field.
    db.set_volume_description(id, None).unwrap();
    db.set_volume_cover(id, None).unwrap();
    let volume = &db.list_volumes().unwrap()[0];
    assert_eq!(volume.description, None);
    assert_eq!(volume.cover, None);
}

#[test]
fn export_can_be_limited_to_one_volume_and_says_where_each_file_lives() {
    let tmp = tempdir().unwrap();
    let db = Db::open(&tmp.path().join("t.cdc")).unwrap();
    let photos = db.insert_volume("Fotos", "S1").unwrap();
    let music = db.insert_volume("Música-90s", "S2").unwrap();
    let fotos_dir = db.insert_dir(photos, None, "2024", "h1").unwrap();
    let music_dir = db.insert_dir(music, None, "Musica", "h2").unwrap();
    add_file(&db, photos, fotos_dir, "playa.jpg", 10);
    add_file(&db, music, music_dir, "song.mp3", 20);

    let all = db.export_rows(None, None).unwrap();
    assert_eq!(all.len(), 2);
    let only_music = db.export_rows(Some(music), None).unwrap();
    assert_eq!(only_music.len(), 1);
    assert_eq!(only_music[0].name, "song.mp3");
    assert_eq!(only_music[0].volume, "Música-90s");
    assert_eq!(only_music[0].path, "/Musica/song.mp3");

    // A page asks for a bounded slice; the summary says how much it left out.
    let page = db.export_rows(Some(music), Some(1)).unwrap();
    assert_eq!(page.len(), 1);
    assert_eq!(db.export_stats(Some(music)).unwrap(), (1, 20));
}

#[test]
fn an_old_catalog_gains_the_metadata_columns_on_open() {
    let tmp = tempdir().unwrap();
    let path = tmp.path().join("old.cdc");
    {
        // The volumes table exactly as 0.4.0 created it.
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE volumes(id INTEGER PRIMARY KEY, label TEXT NOT NULL, serial TEXT NOT NULL, \
             fs_type TEXT, total_bytes INTEGER, used_bytes INTEGER, media_kind TEXT, \
             indexed_at INTEGER, root_hash TEXT, UNIQUE(label, serial));",
        )
        .unwrap();
        conn.execute("INSERT INTO volumes(label, serial) VALUES('Viejo','S1')", [])
            .unwrap();
    }

    let db = Db::open(&path).unwrap();
    let volume = &db.list_volumes().unwrap()[0];
    assert_eq!(volume.label, "Viejo");
    assert_eq!(volume.description, None);
    db.set_volume_description(volume.id, Some("Sigue funcionando")).unwrap();
    assert_eq!(
        db.volume_meta(volume.id).unwrap().unwrap().description.as_deref(),
        Some("Sigue funcionando")
    );
}
