use std::path::Path;

/// One level of a volume's tree, for the explorer view.
///
/// Folders and files come together because a tree shows them in one list; the
/// frontend decides how to render each kind.
#[tauri::command]
pub fn tree_children(
    db_path: String,
    volume: String,
    serial: Option<String>,
    parent: Option<i64>,
) -> Result<core_db::TreeChildren, String> {
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.tree_children(&volume, serial.as_deref(), parent)
        .map_err(|e| e.to_string())
}
