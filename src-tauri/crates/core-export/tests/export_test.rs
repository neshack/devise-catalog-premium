use core_export::{format_date, human_size, to_csv, to_html, HtmlOptions, Row, VolumeMeta};

fn row(name: &str, size: i64, volume: &str, path: &str) -> Row {
    Row {
        name: name.into(),
        size,
        volume: volume.into(),
        path: path.into(),
    }
}

fn options<'a>(volume: Option<&'a VolumeMeta>) -> HtmlOptions<'a> {
    HtmlOptions {
        volume,
        version: "0.4.0",
        generated: "29 oct 2026, 17:53",
        total_rows: 1,
        total_bytes: 7,
    }
}

#[test]
fn csv_has_header() {
    let csv = to_csv(&[row("a.mp3", 1, "V", "/a.mp3")]);
    assert!(csv.starts_with("name,size,volume,path"));
}

#[test]
fn csv_quotes_and_html_escapes_hostile_filename() {
    let name = "=1+1,\"x\"<b>.mp3".to_string();
    let rows = [row(&name, 7, "V", "/x")];
    let csv = to_csv(&rows);
    // Leading `=` forces quoting and inner quotes are doubled (RFC-4180).
    assert!(csv.contains("\"=1+1,\"\"x\"\"<b>.mp3\",7,V"));
    let html = to_html(&rows, &options(None));
    assert!(html.contains("=1+1,&quot;x&quot;&lt;b&gt;.mp3"));
    assert!(!html.contains("<b>.mp3"));
}

#[test]
fn html_carries_the_brand_and_the_volume_identity() {
    let volume = VolumeMeta {
        label: "SD Azul".into(),
        serial: "N35USB128".into(),
        description: Some("Discos de 2016 <y fotos>".into()),
        cover: Some("data:image/jpeg;base64,AAAA".into()),
    };
    let rows = [row("foto.jpg", 2048, "SD Azul", "/Fotos/foto.jpg")];
    let html = to_html(&rows, &options(Some(&volume)));
    assert!(html.contains("Devise Catalog"));
    assert!(html.contains("SD Azul"));
    assert!(html.contains("N35USB128"));
    assert!(html.contains("Discos de 2016 &lt;y fotos&gt;"));
    assert!(html.contains(r#"src="data:image/jpeg;base64,AAAA""#));
    // A single volume does not repeat its own name on every row.
    assert!(!html.contains("<th>Volumen</th>"));
}

#[test]
fn html_ignores_a_cover_that_is_not_a_data_url() {
    let volume = VolumeMeta {
        label: "V".into(),
        serial: "S".into(),
        description: None,
        cover: Some("https://example.com/cover.png".into()),
    };
    let html = to_html(&[row("a", 1, "V", "/a")], &options(Some(&volume)));
    assert!(!html.contains("example.com"));
}

#[test]
fn html_says_when_it_is_capped() {
    let rows = [row("a", 1, "V", "/a")];
    let mut opts = options(None);
    opts.total_rows = 463_178;
    opts.total_bytes = 4_000_000_000;
    let html = to_html(&rows, &opts);
    assert!(html.contains("463.178"));
    assert!(html.contains("Usa CSV o JSON"));
}

#[test]
fn sizes_read_like_the_interface() {
    assert_eq!(human_size(221 * 1024), "221 KB");
    assert_eq!(human_size(2_588_803), "2,5 MB");
    assert_eq!(human_size(0), "0 B");
}

#[test]
fn dates_are_written_in_spanish() {
    // 2026-10-29T00:00:00Z
    assert_eq!(format_date(1_793_232_000), "29 oct 2026");
}
