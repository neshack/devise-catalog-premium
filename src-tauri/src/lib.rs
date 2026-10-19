pub const APP_NAME: &str = "CD Catalog Premium";

pub mod commands;

// NOTE (I2): commands open the catalog DB per IPC call via Db::open instead of
// a setup-time singleton/pool. Rationale: the db path is chosen per call by the
// frontend (single-user local app, low IPC rate), so a singleton would need a
// resolved path at setup and risk breaking existing callers/tests; per-call
// open is correct and cheap for SQLite. Every connection enables
// PRAGMA foreign_keys=ON inside Db::open (see I6).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_volume,
            commands::scan::cancel_scan,
            commands::scan::pause_scan,
            commands::scan::resume_scan,
            commands::scan::scan_status,
            commands::scan::recover_stale_scans,
            commands::search::search,
            commands::search::list_duplicates,
            commands::search::get_volume,
            commands::search::list_volumes,
            commands::search::file_duplicates,
            commands::export::export_csv,
            commands::export::export_json,
            commands::export::export_html
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_name_is_cd_catalog_premium() {
        assert_eq!(crate::APP_NAME, "CD Catalog Premium");
    }
}
