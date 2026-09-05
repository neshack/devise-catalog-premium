pub struct Row {
    pub name: String,
    pub size: i64,
    pub volume: String,
}
pub fn to_csv(rows: &[Row]) -> String {
    let mut s = String::from("name,size,volume\n");
    for r in rows {
        s.push_str(&format!("{},{},{}\n", r.name, r.size, r.volume));
    }
    s
}
pub fn to_json(rows: &[Row]) -> String {
    serde_json::to_string_pretty(
        &rows
            .iter()
            .map(|r| serde_json::json!({"name": r.name, "size": r.size, "volume": r.volume}))
            .collect::<Vec<_>>(),
    )
    .unwrap()
}
pub fn to_html(rows: &[Row]) -> String {
    let mut h = String::from(
        "<!doctype html><html><body><table><tr><th>name</th><th>size</th><th>volume</th></tr>",
    );
    for r in rows {
        h.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td></tr>",
            r.name, r.size, r.volume
        ));
    }
    h.push_str("</table></body></html>");
    h
}
