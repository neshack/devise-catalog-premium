pub const APP_NAME: &str = "CD Catalog Premium";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
