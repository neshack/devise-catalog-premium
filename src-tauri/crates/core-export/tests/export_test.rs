#[test]
fn csv_has_header() {
    let csv = core_export::to_csv(&[core_export::Row {
        name: "a.mp3".into(),
        size: 1,
        volume: "V".into(),
    }]);
    assert!(csv.starts_with("name,size,volume"));
}

#[test]
fn csv_quotes_and_html_escapes_hostile_filename() {
    let name = "=1+1,\"x\"<b>.mp3".to_string();
    let csv = core_export::to_csv(&[core_export::Row {
        name: name.clone(),
        size: 7,
        volume: "V".into(),
    }]);
    // Leading `=` forces quoting and inner quotes are doubled (RFC-4180).
    assert!(csv.contains("\"=1+1,\"\"x\"\"<b>.mp3\",7,V"));
    let html = core_export::to_html(&[core_export::Row {
        name,
        size: 7,
        volume: "V".into(),
    }]);
    assert!(html.contains("=1+1,&quot;x&quot;&lt;b&gt;.mp3"));
    assert!(!html.contains("<b>.mp3"));
}
