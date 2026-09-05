use std::path::Path;

#[tauri::command]
pub fn export_csv(db_path: String) -> Result<String, String> {
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    let rows = db.export_rows().map_err(|e| e.to_string())?;
    Ok(core_export::to_csv(
        &rows
            .into_iter()
            .map(|r| core_export::Row {
                name: r.name,
                size: r.size,
                volume: r.volume,
            })
            .collect::<Vec<_>>(),
    ))
}
