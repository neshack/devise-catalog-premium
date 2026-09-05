#[test]
fn zip_lists_inner_without_extract() {
    use std::io::Write;
    let dir = tempfile::tempdir().unwrap();
    let zp = dir.path().join("a.zip");
    let f = std::fs::File::create(&zp).unwrap();
    let mut w = zip::ZipWriter::new(f);
    w.start_file("docs/informe.pdf", zip::write::SimpleFileOptions::default())
        .unwrap();
    w.write_all(b"fake").unwrap();
    w.finish().unwrap();
    let entries = core_parsers::list_container(&zp).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].inner_path, "docs/informe.pdf");
}
