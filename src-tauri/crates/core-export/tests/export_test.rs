#[test]
fn csv_has_header() {
    let csv = core_export::to_csv(&[core_export::Row {
        name: "a.mp3".into(),
        size: 1,
        volume: "V".into(),
    }]);
    assert!(csv.starts_with("name,size,volume"));
}
