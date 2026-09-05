pub const APP_NAME: &str = "CD Catalog Premium";

pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_volume,
            commands::scan::cancel_scan,
            commands::search::search,
            commands::search::list_duplicates,
            commands::export::export_csv
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
