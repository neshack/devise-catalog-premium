pub const APP_NAME: &str = "Devise Catalog Premium";

pub mod commands;

/// Identity the app used before the rename. Its catalog is copied once into
/// the new data directory so renaming the product does not look like losing
/// every indexed disc.
const LEGACY_IDENTIFIER: &str = "com.cdcatalog.premium";

/// Copy the legacy catalog and its SQLite side files into `new_dir`.
///
/// Returns how many files were copied. A catalog already present in the new
/// directory wins: migration must never overwrite what the renamed app has
/// been writing.
fn copy_legacy_catalog(
    old_dir: &std::path::Path,
    new_dir: &std::path::Path,
) -> std::io::Result<usize> {
    if new_dir.join("catalog.cdc").exists() || !old_dir.join("catalog.cdc").exists() {
        return Ok(0);
    }
    std::fs::create_dir_all(new_dir)?;
    let mut copied = 0;
    for name in ["catalog.cdc", "catalog.cdc-wal", "catalog.cdc-shm"] {
        let source = old_dir.join(name);
        if source.exists() {
            std::fs::copy(&source, new_dir.join(name))?;
            copied += 1;
        }
    }
    Ok(copied)
}

fn migrate_legacy_catalog(app: &tauri::App) {
    use tauri::Manager;
    let (Ok(data_dir), Ok(new_dir)) = (app.path().data_dir(), app.path().app_data_dir()) else {
        return;
    };
    let old_dir = data_dir.join(LEGACY_IDENTIFIER);
    let _ = copy_legacy_catalog(&old_dir, &new_dir);
}

// NOTE (I2): commands open the catalog DB per IPC call via Db::open instead of
// a setup-time singleton/pool. Rationale: the db path is chosen per call by the
// frontend (single-user local app, low IPC rate), so a singleton would need a
// resolved path at setup and risk breaking existing callers/tests; per-call
// open is correct and cheap for SQLite. Every connection enables
// PRAGMA foreign_keys=ON inside Db::open (see I6).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The title bar is the one place a window always states what it is.
        // The version comes from the package metadata, the same source the
        // installer uses, so a reinstall is visible without opening a menu.
        .setup(|app| {
            use tauri::Manager;
            migrate_legacy_catalog(app);
            let version = app.package_info().version.to_string();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&format!("{} v{}", APP_NAME, version));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_volume,
            commands::scan::cancel_scan,
            commands::scan::pause_scan,
            commands::scan::resume_scan,
            commands::scan::scan_status,
            commands::scan::recover_stale_scans,
            commands::system::open_twitter,
            commands::tree::tree_children,
            commands::search::search,
            commands::search::get_hit,
            commands::search::list_duplicates,
            commands::search::get_volume,
            commands::search::list_volumes,
            commands::search::delete_volume,
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
    use super::copy_legacy_catalog;

    #[test]
    fn app_name_is_devise_catalog_premium() {
        assert_eq!(crate::APP_NAME, "Devise Catalog Premium");
    }

    #[test]
    fn migrates_the_old_catalog_and_its_wal_once() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("com.cdcatalog.premium");
        let new = tmp.path().join("com.devise.catalog");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("catalog.cdc"), b"catalog").unwrap();
        std::fs::write(old.join("catalog.cdc-wal"), b"wal").unwrap();

        assert_eq!(copy_legacy_catalog(&old, &new).unwrap(), 2);
        assert_eq!(std::fs::read(new.join("catalog.cdc")).unwrap(), b"catalog");
        assert_eq!(std::fs::read(new.join("catalog.cdc-wal")).unwrap(), b"wal");

        // A later launch must not overwrite the catalog the new app is using.
        std::fs::write(new.join("catalog.cdc"), b"newer").unwrap();
        assert_eq!(copy_legacy_catalog(&old, &new).unwrap(), 0);
        assert_eq!(std::fs::read(new.join("catalog.cdc")).unwrap(), b"newer");
    }

    #[test]
    fn does_nothing_without_a_legacy_catalog() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("com.cdcatalog.premium");
        let new = tmp.path().join("com.devise.catalog");
        std::fs::create_dir_all(&old).unwrap();
        assert_eq!(copy_legacy_catalog(&old, &new).unwrap(), 0);
        assert!(!new.exists());
    }
}
