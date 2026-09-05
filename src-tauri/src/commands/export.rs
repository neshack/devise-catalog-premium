use std::path::Path;

fn load_rows(db_path: &str) -> Result<Vec<core_export::Row>, String> {
    let db = core_db::Db::open(Path::new(db_path)).map_err(|e| e.to_string())?;
    let rows = db.export_rows().map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| core_export::Row {
            name: r.name,
            size: r.size,
            volume: r.volume,
        })
        .collect())
}

/// Resolve the output file: explicit path wins; otherwise `<db_stem>-export.<suffix>`
/// next to the db file (unbounded IPC strings avoided — payloads go to disk).
fn default_export_path(db_path: &str, suffix: &str) -> String {
    let p = Path::new(db_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("catalog");
    match p.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent
            .join(format!("{stem}-export.{suffix}"))
            .to_string_lossy()
            .into_owned(),
        _ => format!("{stem}-export.{suffix}"),
    }
}

fn write_out(
    db_path: &str,
    out_path: Option<String>,
    suffix: &str,
    content: String,
) -> Result<String, String> {
    let dest = out_path.unwrap_or_else(|| default_export_path(db_path, suffix));
    std::fs::write(&dest, content).map_err(|e| e.to_string())?;
    Ok(dest)
}

#[tauri::command]
pub fn export_csv(db_path: String, out_path: Option<String>) -> Result<String, String> {
    let rows = load_rows(&db_path)?;
    write_out(&db_path, out_path, "csv", core_export::to_csv(&rows))
}

#[tauri::command]
pub fn export_json(db_path: String, out_path: Option<String>) -> Result<String, String> {
    let rows = load_rows(&db_path)?;
    write_out(&db_path, out_path, "json", core_export::to_json(&rows))
}

#[tauri::command]
pub fn export_html(db_path: String, out_path: Option<String>) -> Result<String, String> {
    let rows = load_rows(&db_path)?;
    write_out(&db_path, out_path, "html", core_export::to_html(&rows))
}
