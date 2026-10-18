//! Query-layer tests: volume summaries, duplicate lookups, and the dir-path
//! resolution shared by every query that shows a path to the user.

use core_db::{Db, NewFile, ParsedQuery, SearchHit, VolumeSummary};
use tempfile::tempdir;

struct Catalog {
    _tmp: tempfile::TempDir,
    db: Db,
}

impl Catalog {
    fn new() -> Self {
        let tmp = tempdir().unwrap();
        let db = Db::open(&tmp.path().join("t.cdc")).unwrap();
        Self { _tmp: tmp, db }
    }

    fn volume(&self, label: &str, serial: &str) -> i64 {
        self.db.insert_volume(label, serial).unwrap()
    }

    fn dir(&self, volume: i64, parent: Option<i64>, name: &str, path_hash: &str) -> i64 {
        self.db.insert_dir(volume, parent, name, path_hash).unwrap()
    }

    fn file(&self, volume: i64, dir: i64, name: &str, size: i64, blake3: Option<&str>) {
        self.insert(volume, dir, name, size, blake3, None);
    }

    /// A row for an entry inside an archive, as the scanner writes it.
    fn entry(&self, volume: i64, dir: i64, name: &str, size: i64, container: &str) {
        self.insert(volume, dir, name, size, None, Some(container));
    }

    fn insert(
        &self,
        volume: i64,
        dir: i64,
        name: &str,
        size: i64,
        blake3: Option<&str>,
        container_path: Option<&str>,
    ) {
        self.db
            .insert_file_batch(&[NewFile {
                dir_id: dir,
                volume_id: volume,
                name: name.into(),
                ext: name
                    .rsplit_once('.')
                    .map(|(_, e)| e.to_string())
                    .unwrap_or_default(),
                size,
                mtime: 0,
                blake3: blake3.map(str::to_string),
                container_path: container_path.map(str::to_string),
                audio_json: None,
                image_json: None,
            }])
            .unwrap();
    }

    /// What the user gets for a free-text search (no filters).
    fn hits(&self, fts: &str) -> Vec<SearchHit> {
        self.db
            .search(
                &ParsedQuery {
                    fts: fts.into(),
                    ext: None,
                    exts: Vec::new(),
                    min_size: None,
                    max_size: None,
                    volume: None,
                },
                100,
            )
            .unwrap()
    }

    fn id_of(&self, name: &str) -> i64 {
        // No MATCH here on purpose: names carry dots and colons that FTS5
        // reads as syntax; the app's parser handles that before querying.
        self.hits("")
            .into_iter()
            .find(|h| h.name == name)
            .expect("file to look up")
            .id
    }

    fn volumes(&self) -> Vec<VolumeSummary> {
        self.db.list_volumes().unwrap()
    }
}

#[test]
fn list_volumes_aggregates_counts_and_sizes() {
    let c = Catalog::new();
    let music = c.volume("Musica-90s", "SER-1");
    let empty = c.volume("USB-Vacia", "SER-2");
    let songs = c.dir(music, None, "Musica", "h-music");
    c.file(music, songs, "song.flac", 30_000_000, Some("hash-a"));
    c.file(music, songs, "song.mp3", 6_000_000, Some("hash-b"));
    c.entry(music, songs, "extra/notas.txt", 120, "importados.zip");

    let volumes = c.volumes();
    assert_eq!(volumes.len(), 2);
    let by_label = |label: &str| {
        volumes
            .iter()
            .find(|v| v.label == label)
            .expect("volume to be listed")
    };

    // A volume with nothing indexed still shows up (0/0), not as a gap.
    assert_eq!(by_label("USB-Vacia").file_count, 0);
    assert_eq!(by_label("USB-Vacia").total_size, 0);

    // Entries inside an archive are rows like any other: they count.
    let music_row = by_label("Musica-90s");
    assert_eq!(music_row.serial, "SER-1");
    assert_eq!(music_row.file_count, 3);
    assert_eq!(music_row.total_size, 36_000_120);
    assert!(music_row.indexed_at.is_some(), "indexing stamps the volume");
}

#[test]
fn file_duplicates_lists_the_other_copies_of_the_same_content() {
    let c = Catalog::new();
    let backup = c.volume("Backup-12", "SER-1");
    let fotos = c.volume("Fotos-2024", "SER-2");
    let docs = c.dir(backup, None, "Documentos", "h-docs");
    let dcim = c.dir(fotos, None, "DCIM", "h-dcim");
    c.file(backup, docs, "contrato.pdf", 240_000, Some("same-bytes"));
    c.file(
        fotos,
        dcim,
        "contrato-escaneado.pdf",
        240_000,
        Some("same-bytes"),
    );
    c.file(backup, docs, "unico.pdf", 1_000, Some("other-bytes"));

    let copies = c.db.file_duplicates(c.id_of("contrato.pdf")).unwrap();
    assert_eq!(copies.len(), 1, "the file itself is not a copy of itself");
    assert_eq!(copies[0].name, "contrato-escaneado.pdf");
    assert_eq!(copies[0].volume_label, "Fotos-2024");
    assert_eq!(copies[0].path, "/DCIM");
    assert_eq!(copies[0].size, 240_000);

    assert!(
        c.db.file_duplicates(c.id_of("unico.pdf"))
            .unwrap()
            .is_empty(),
        "a unique hash has no copies"
    );
}

#[test]
fn file_duplicates_compares_hashes_even_inside_archives() {
    let c = Catalog::new();
    let backup = c.volume("Backup-12", "SER-1");
    let docs = c.dir(backup, None, "Documentos", "h-docs");
    let comprimidos = c.dir(backup, None, "Comprimidos", "h-comp");
    c.file(backup, docs, "con-hash.bin", 20, Some("H"));
    // A row inside an archive is a row: if it carries a hash, the query must
    // compare it like any other.
    c.insert(
        backup,
        comprimidos,
        "copia/con-hash.bin",
        20,
        Some("H"),
        Some("paquete.zip"),
    );
    c.file(backup, docs, "sin-hash.bin", 10, None);

    let copies = c.db.file_duplicates(c.id_of("con-hash.bin")).unwrap();
    assert_eq!(copies.len(), 1);
    assert_eq!(copies[0].name, "copia/con-hash.bin");
    assert_eq!(copies[0].path, "/Comprimidos");

    assert!(
        c.db.file_duplicates(c.id_of("sin-hash.bin"))
            .unwrap()
            .is_empty(),
        "an unhashed file cannot be compared"
    );
}

#[test]
fn file_duplicates_ignores_the_unhashed_entries_the_scanner_writes() {
    let c = Catalog::new();
    let backup = c.volume("Backup-12", "SER-1");
    let docs = c.dir(backup, None, "Documentos", "h-docs");
    let comprimidos = c.dir(backup, None, "Comprimidos", "h-comp");
    c.file(backup, docs, "con-hash.bin", 20, Some("H"));
    c.entry(backup, comprimidos, "copia/con-hash.bin", 20, "paquete.zip");

    assert!(
        c.db.file_duplicates(c.id_of("con-hash.bin"))
            .unwrap()
            .is_empty(),
        "entries are indexed without a hash, so the same bytes inside an archive are not detected"
    );
}

#[test]
fn search_reports_canonical_paths_for_nested_dirs() {
    let c = Catalog::new();
    let backup = c.volume("Backup-12", "SER-1");
    let root = c.dir(backup, None, "/", "h-root");
    let a = c.dir(backup, Some(root), "a", "h-a");
    let b = c.dir(backup, Some(a), "b", "h-b");
    c.file(backup, root, "top.txt", 1, None);
    c.file(backup, b, "deep.txt", 2, None);

    let paths: Vec<(String, String)> = c.hits("").into_iter().map(|h| (h.name, h.path)).collect();
    let path_of = |name: &str| {
        paths
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, p)| p.clone())
            .expect("row to resolve")
    };
    assert_eq!(path_of("top.txt"), "/", "the volume root is '/'");
    assert_eq!(
        path_of("deep.txt"),
        "/a/b",
        "nesting keeps the leading slash"
    );
}

#[test]
fn search_resolves_legacy_dirs_the_same_way_the_scanner_does() {
    // Dirs written before paths were normalized kept the whole path in `name`
    // with no parent. The scanner canonicalizes them with a leading slash
    // (`dir_full_paths`); queries must agree or the UI would show a path the
    // next scan treats as a different folder.
    let c = Catalog::new();
    let backup = c.volume("Backup-12", "SER-1");
    let legacy = c.dir(backup, None, "Musica/Album", "h-legacy");
    let trailing = c.dir(backup, None, "Fotos/", "h-trailing");
    c.file(backup, legacy, "track.flac", 1, None);
    c.file(backup, trailing, "IMG_0001.jpg", 2, None);

    let hits = c.hits("");
    let path_of = |name: &str| {
        hits.iter()
            .find(|h| h.name == name)
            .map(|h| h.path.clone())
            .expect("row to resolve")
    };
    assert_eq!(path_of("track.flac"), "/Musica/Album");
    assert_eq!(path_of("IMG_0001.jpg"), "/Fotos");
}

#[test]
fn a_folder_holds_one_file_per_name_unless_it_lives_in_an_archive() {
    let c = Catalog::new();
    let backup = c.volume("Backup-12", "SER-1");
    let docs = c.dir(backup, None, "Documentos", "h-docs");
    let insert = |name: &str, container: Option<&str>| {
        c.db.insert_file_batch(&[NewFile {
            dir_id: docs,
            volume_id: backup,
            name: name.into(),
            ext: "txt".into(),
            size: 1,
            mtime: 0,
            blake3: None,
            container_path: container.map(str::to_string),
            audio_json: None,
            image_json: None,
        }])
    };

    assert!(insert("readme.txt", None).is_ok());
    assert!(
        insert("readme.txt", None).is_err(),
        "two files cannot share a name in the same folder"
    );
    // …but an archive entry may, because the archive disambiguates it.
    assert!(insert("readme.txt", Some("a.zip")).is_ok());
    assert!(insert("readme.txt", Some("b.zip")).is_ok());
    assert!(
        insert("readme.txt", Some("a.zip")).is_err(),
        "one archive cannot hold the same entry twice"
    );
}
