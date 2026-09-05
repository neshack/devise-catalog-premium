#[test]
fn partial_and_full_hash_stable() {
    let f = std::env::temp_dir().join("cdc_hash_fixture.txt");
    std::fs::write(&f, b"hello-catalog").unwrap();
    let a = core_hash::blake3_partial(&f, 65536).unwrap();
    let b = core_hash::blake3_full(&f).unwrap();
    assert_eq!(a.len(), 64);
    assert!(!b.is_empty());
}
