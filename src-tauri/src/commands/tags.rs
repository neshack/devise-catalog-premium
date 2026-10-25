use core_db::Db;
use std::path::Path;

fn open(db_path: &str) -> Result<Db, String> {
    Db::open(Path::new(db_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_tags(db_path: String, file_id: i64) -> Result<Vec<String>, String> {
    open(&db_path)?
        .file_tags(file_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_file_tag(db_path: String, file_id: i64, name: String) -> Result<Vec<String>, String> {
    open(&db_path)?
        .add_file_tag(file_id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_file_tag(db_path: String, file_id: i64, name: String) -> Result<Vec<String>, String> {
    open(&db_path)?
        .remove_file_tag(file_id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dir_tags(db_path: String, dir_id: i64) -> Result<Vec<String>, String> {
    open(&db_path)?.dir_tags(dir_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_dir_tag(db_path: String, dir_id: i64, name: String) -> Result<Vec<String>, String> {
    open(&db_path)?
        .add_dir_tag(dir_id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_dir_tag(db_path: String, dir_id: i64, name: String) -> Result<Vec<String>, String> {
    open(&db_path)?
        .remove_dir_tag(dir_id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_tags(db_path: String) -> Result<Vec<String>, String> {
    open(&db_path)?.list_tags().map_err(|e| e.to_string())
}
