pub struct Row {
    pub name: String,
    pub size: i64,
    pub volume: String,
}

/// RFC-4180 quoting: quote fields containing `,`, `"`, space, `\n`/`\r`, or
/// with a leading `=`, `+`, `-`, `@` (formula-injection guard); inner quotes
/// are doubled.
fn csv_field(s: &str) -> String {
    let needs = s.contains([',', '"', ' ', '\n', '\r']) || s.starts_with(['=', '+', '-', '@']);
    if needs {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub fn to_csv(rows: &[Row]) -> String {
    let mut s = String::from("name,size,volume\n");
    for r in rows {
        s.push_str(&format!(
            "{},{},{}\n",
            csv_field(&r.name),
            r.size,
            csv_field(&r.volume)
        ));
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
    // Serialization of plain strings/ints cannot realistically fail; fall back
    // to an empty array instead of panicking an IPC handler.
    .unwrap_or_else(|_| "[]".into())
}
pub fn to_html(rows: &[Row]) -> String {
    let mut h = String::from(
        "<!doctype html><html><body><table><tr><th>name</th><th>size</th><th>volume</th></tr>",
    );
    for r in rows {
        h.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td></tr>",
            html_escape(&r.name),
            r.size,
            html_escape(&r.volume)
        ));
    }
    h.push_str("</table></body></html>");
    h
}
