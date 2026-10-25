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
                    volume_serial: None,
                    tags: Vec::new(),
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
    let _empty = c.volume("USB-Vacia", "SER-2");
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

#[test]
fn tree_walks_one_level_at_a_time_with_direct_counts() {
    let c = Catalog::new();
    let vol = c.volume("Fotos-2024", "SER-1");
    let root = c.dir(vol, None, "/", "root");
    let fotos = c.dir(vol, Some(root), "Fotos", "d-fotos");
    let deep = c.dir(vol, Some(fotos), "2023", "d-2023");
    c.file(vol, root, "leeme.txt", 10, None);
    c.file(vol, fotos, "IMG_0001.jpg", 100, None);
    c.file(vol, fotos, "IMG_0002.jpg", 200, None);
    c.file(vol, deep, "viejo.jpg", 400, None);
    c.entry(vol, fotos, "dentro.zip/notas.txt", 50, "dentro.zip");

    // The root knows about its folder and its file, not about what is deeper.
    let root_children =
        c.db.tree_children("Fotos-2024", Some("SER-1"), None)
            .unwrap();
    assert_eq!(root_children.dirs_total, 1);
    assert_eq!(root_children.files_total, 1);
    assert_eq!(root_children.dirs.len(), 1);
    let folder = &root_children.dirs[0];
    assert_eq!(folder.name, "Fotos");
    assert_eq!(folder.files, 3, "two files on disk plus one inside the zip");
    assert_eq!(folder.size, 350, "direct bytes only, not the nested folder");
    assert_eq!(folder.dirs, 1);
    assert_eq!(root_children.files[0].name, "leeme.txt");

    // Inside the folder: its files first-class, the subfolder counted but not
    // descended into.
    let fotos_children =
        c.db.tree_children("Fotos-2024", Some("SER-1"), Some(fotos))
            .unwrap();
    assert_eq!(fotos_children.files_total, 3);
    let names: Vec<&str> = fotos_children
        .files
        .iter()
        .map(|f| f.name.as_str())
        .collect();
    assert_eq!(
        names,
        vec!["dentro.zip/notas.txt", "IMG_0001.jpg", "IMG_0002.jpg"]
    );
    let entry = &fotos_children.files[0];
    assert_eq!(entry.container_path.as_deref(), Some("dentro.zip"));
    assert_eq!(
        fotos_children.dirs[0].files, 1,
        "the 2023 folder has one file"
    );
    assert_eq!(fotos_children.dirs[0].size, 400);

    // An unknown volume is an error, not an empty tree: saying "nothing here"
    // about a disk that was never indexed would be a lie.
    assert!(c.db.tree_children("No-Existe", None, None).is_err());
}

#[test]
fn deleting_a_volume_removes_only_its_catalog_rows() {
    let c = Catalog::new();
    let keep = c.volume("Keep-01", "SER-1");
    let gone = c.volume("Gone-01", "SER-2");
    let keep_dir = c.dir(keep, None, "/", "h-keep");
    let gone_dir = c.dir(gone, None, "/", "h-gone");
    c.file(keep, keep_dir, "keep.txt", 10, Some("keep-hash"));
    c.file(gone, gone_dir, "gone.txt", 20, Some("gone-hash"));
    c.db.add_file_tag(c.id_of("gone.txt"), "temporal").unwrap();
    c.db.add_dir_tag(gone_dir, "temporal").unwrap();
    assert_eq!(c.db.list_tags().unwrap(), vec!["temporal"]);
    c.db.replace_scan_errors(gone, &[("/media/gone/roto".into(), "sin permiso".into())])
        .unwrap();
    c.db.start_scan_run(gone, "/media/gone", "walk").unwrap();

    assert_eq!(c.db.delete_volume(gone).unwrap(), 1);

    // The volume and everything hanging from it are gone…
    let volumes = c.volumes();
    assert_eq!(volumes.len(), 1);
    assert_eq!(volumes[0].label, "Keep-01");
    assert!(c.db.dirs_for_volume(gone).unwrap().is_empty());
    assert!(c.db.scan_errors(gone).unwrap().is_empty());
    assert!(c.db.latest_scan_run().unwrap().is_none());
    assert!(
        c.db.list_tags().unwrap().is_empty(),
        "a tag with no links left must not survive the volume"
    );

    // …and the other volume is untouched.
    assert_eq!(c.hits("").len(), 1);
    assert_eq!(c.hits("").into_iter().next().unwrap().name, "keep.txt");

    // Deleting something already gone is a no-op, not a panic.
    assert_eq!(c.db.delete_volume(gone).unwrap(), 0);
}

#[test]
fn search_can_disambiguate_two_volumes_with_the_same_label() {
    let c = Catalog::new();
    let first = c.volume("Backup", "SER-A");
    let second = c.volume("Backup", "SER-B");
    let first_dir = c.dir(first, None, "/", "h-first");
    let second_dir = c.dir(second, None, "/", "h-second");
    c.file(first, first_dir, "primero.txt", 1, None);
    c.file(second, second_dir, "segundo.txt", 2, None);

    let q = |serial: &str| ParsedQuery {
        fts: String::new(),
        ext: None,
        exts: Vec::new(),
        min_size: None,
        max_size: None,
        volume: Some("Backup".into()),
        volume_serial: Some(serial.into()),
        tags: Vec::new(),
    };

    let hits = c.db.search(&q("SER-B"), 100).unwrap();
    assert_eq!(hits.len(), 1, "the label alone must not mix both discs");
    assert_eq!(hits[0].name, "segundo.txt");
    assert_eq!(hits[0].volume_label, "Backup");
}

#[test]
fn get_hit_returns_one_indexed_row_by_id() {
    let c = Catalog::new();
    let volume = c.volume("Fotos", "SER-1");
    let root = c.dir(volume, None, "/", "h-root");
    let trip = c.dir(volume, Some(root), "2024", "h-trip");
    c.file(volume, trip, "IMG_0001.jpg", 4_000, Some("hash-1"));

    let id = c.id_of("IMG_0001.jpg");
    let hit = c.db.get_hit(id).unwrap().expect("indexed row");
    assert_eq!(hit.name, "IMG_0001.jpg");
    assert_eq!(hit.path, "/2024");
    assert_eq!(hit.volume_label, "Fotos");
    assert_eq!(hit.size, 4_000);

    assert!(c.db.get_hit(id + 999).unwrap().is_none());
}

#[test]
fn tags_on_files_and_folders_drive_search_and_the_tree() {
    let c = Catalog::new();
    let volume = c.volume("Fotos", "SER-1");
    let root = c.dir(volume, None, "/", "h-root");
    let trip = c.dir(volume, Some(root), "2024", "h-trip");
    let beach = c.dir(volume, Some(trip), "playa", "h-beach");
    c.file(volume, beach, "IMG_0001.jpg", 10, None);
    c.file(volume, root, "notas.txt", 5, None);

    let photo = c.id_of("IMG_0001.jpg");
    assert_eq!(c.db.add_file_tag(photo, "playa").unwrap(), vec!["playa"]);
    assert_eq!(c.db.add_file_tag(photo, "PLAYA").unwrap(), vec!["playa"]);
    assert_eq!(c.db.add_dir_tag(trip, "viaje").unwrap(), vec!["viaje"]);

    // A direct tag finds the file; a folder tag is inherited by its subtree.
    let q = |tags: Vec<&str>| ParsedQuery {
        fts: String::new(),
        ext: None,
        exts: Vec::new(),
        min_size: None,
        max_size: None,
        volume: None,
        volume_serial: None,
        tags: tags.into_iter().map(str::to_string).collect(),
    };
    assert_eq!(c.db.search(&q(vec!["playa"]), 100).unwrap().len(), 1);
    assert_eq!(c.db.search(&q(vec!["viaje"]), 100).unwrap().len(), 1);
    assert_eq!(
        c.db.search(&q(vec!["playa", "viaje"]), 100).unwrap()[0].name,
        "IMG_0001.jpg"
    );
    assert!(c.db.search(&q(vec!["no-existe"]), 100).unwrap().is_empty());

    // The tree shows the tags where they live, not duplicated down the subtree.
    let root_children =
        c.db.tree_children("Fotos", Some("SER-1"), Some(root))
            .unwrap();
    assert_eq!(root_children.dirs[0].tags, vec!["viaje"]);
    let beach_children =
        c.db.tree_children("Fotos", Some("SER-1"), Some(beach))
            .unwrap();
    assert_eq!(beach_children.files[0].tags, vec!["playa"]);

    assert_eq!(
        c.db.remove_file_tag(photo, "playa").unwrap(),
        Vec::<String>::new()
    );
    assert!(c.db.search(&q(vec!["playa"]), 100).unwrap().is_empty());
}

#[test]
fn tree_path_walks_from_the_root_to_the_file_folder() {
    let c = Catalog::new();
    let volume = c.volume("Fotos", "SER-1");
    let root = c.dir(volume, None, "/", "h-root");
    let year = c.dir(volume, Some(root), "2024", "h-year");
    let trip = c.dir(volume, Some(year), "playa", "h-trip");
    c.file(volume, trip, "IMG_0001.jpg", 10, None);

    let id = c.id_of("IMG_0001.jpg");
    let path = c.db.tree_path(id).unwrap().expect("tree path");
    assert_eq!(path.volume_label, "Fotos");
    assert_eq!(path.volume_serial, "SER-1");
    assert_eq!(path.dir_ids, vec![root, year, trip]);
    assert_eq!(path.file_id, id);

    assert!(c.db.tree_path(id + 999).unwrap().is_none());
}
