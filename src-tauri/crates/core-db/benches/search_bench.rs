use criterion::{criterion_group, criterion_main, Criterion};

fn bench_search(c: &mut Criterion) {
    c.bench_function("search_10k", |b| {
        b.iter(|| {
            let dir = tempfile::tempdir().unwrap();
            let db = core_db::Db::open(&dir.path().join("b.cdc")).unwrap();
            let v = db.insert_volume("V", "S").unwrap();
            let d = db.insert_dir(v, None, "/", "/").unwrap();
            db.insert_file_batch(&[core_db::NewFile {
                dir_id: d,
                volume_id: v,
                name: "song.mp3".into(),
                ext: "mp3".into(),
                size: 1,
                mtime: 0,
                blake3: None,
                container_path: None,
                audio_json: None,
                image_json: None,
            }])
            .unwrap();
            let _ = db
                .search(
                    &core_db::ParsedQuery {
                        fts: "song*".into(),
                        ext: Some("mp3".into()),
                        exts: Vec::new(),
                        min_size: None,
                        max_size: None,
                        volume: None,
                        volume_serial: None,
                    },
                    50,
                )
                .unwrap();
        })
    });
}

criterion_group!(benches, bench_search);
criterion_main!(benches);
