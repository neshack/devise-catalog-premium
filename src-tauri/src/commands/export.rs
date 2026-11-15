use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// A navigable page is meant to be opened; a catalog can hold hundreds of
/// thousands of rows. The page is capped (and says so) while CSV and JSON stay
/// complete, because those are the formats a spreadsheet or a script reads.
const HTML_ROW_CAP: usize = 25_000;

struct Selection {
    rows: Vec<core_export::Row>,
    volume: Option<core_db::VolumeMeta>,
    total_rows: usize,
    total_bytes: i64,
}

fn load_selection(
    db_path: &str,
    volume_id: Option<i64>,
    limit: Option<i64>,
) -> Result<Selection, String> {
    let db = core_db::Db::open(Path::new(db_path)).map_err(|e| e.to_string())?;
    let volume = match volume_id {
        Some(id) => db.volume_meta(id).map_err(|e| e.to_string())?,
        None => None,
    };
    let (total_rows, total_bytes) = db.export_stats(volume_id).map_err(|e| e.to_string())?;
    let rows = db
        .export_rows(volume_id, limit)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|r| core_export::Row {
            name: r.name,
            size: r.size,
            volume: r.volume,
            path: r.path,
        })
        .collect();
    Ok(Selection {
        rows,
        volume,
        total_rows: total_rows as usize,
        total_bytes,
    })
}

/// `SD Azul` -> `sd-azul`, so the exported file says which volume it is.
fn slug(label: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in label.chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

/// Resolve the output file: explicit path wins; otherwise `<name>-export.<suffix>`
/// next to the db file (unbounded IPC strings avoided — payloads go to disk).
/// `name` is the volume label when the export covers one, the db stem otherwise.
fn default_export_path(db_path: &str, name: &str, suffix: &str) -> String {
    let p = Path::new(db_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("catalog");
    let prefix = if name.is_empty() { stem } else { name };
    let file = format!("{prefix}-export.{suffix}");
    match p.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => {
            parent.join(file).to_string_lossy().into_owned()
        }
        _ => file,
    }
}

fn file_stem_for(selection: &Selection) -> String {
    selection
        .volume
        .as_ref()
        .map(|v| slug(&v.label))
        .filter(|s| !s.is_empty())
        .unwrap_or_default()
}

fn write_out(
    db_path: &str,
    out_path: Option<String>,
    name: &str,
    suffix: &str,
    content: String,
) -> Result<String, String> {
    let dest = out_path.unwrap_or_else(|| default_export_path(db_path, name, suffix));
    std::fs::write(&dest, content).map_err(|e| e.to_string())?;
    Ok(dest)
}

#[tauri::command]
pub fn export_csv(
    db_path: String,
    out_path: Option<String>,
    volume_id: Option<i64>,
) -> Result<String, String> {
    let selection = load_selection(&db_path, volume_id, None)?;
    let name = file_stem_for(&selection);
    write_out(
        &db_path,
        out_path,
        &name,
        "csv",
        core_export::to_csv(&selection.rows),
    )
}

#[tauri::command]
pub fn export_json(
    db_path: String,
    out_path: Option<String>,
    volume_id: Option<i64>,
) -> Result<String, String> {
    let selection = load_selection(&db_path, volume_id, None)?;
    let name = file_stem_for(&selection);
    write_out(
        &db_path,
        out_path,
        &name,
        "json",
        core_export::to_json(&selection.rows),
    )
}

#[tauri::command]
pub fn export_html(
    db_path: String,
    out_path: Option<String>,
    volume_id: Option<i64>,
    // Local date from the window ("29 oct 2026, 17:53"). UTC is the fallback.
    generated: Option<String>,
) -> Result<String, String> {
    // The page shows the first rows of the selection, not all of them: it is
    // meant to be opened. The summary still describes the whole volume.
    let selection = load_selection(&db_path, volume_id, Some(HTML_ROW_CAP as i64))?;
    let generated = generated.unwrap_or_else(|| {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        core_export::format_date(now)
    });
    let meta = selection.volume.as_ref().map(|m| core_export::VolumeMeta {
        label: m.label.clone(),
        serial: m.serial.clone(),
        description: m.description.clone(),
        cover: m.cover.clone(),
    });
    let html = core_export::to_html(
        &selection.rows,
        &core_export::HtmlOptions {
            volume: meta.as_ref(),
            version: env!("CARGO_PKG_VERSION"),
            generated: &generated,
            total_rows: selection.total_rows,
            total_bytes: selection.total_bytes,
        },
    );
    let name = file_stem_for(&selection);
    write_out(&db_path, out_path, &name, "html", html)
}

#[cfg(test)]
mod tests {
    use super::{default_export_path, slug};

    #[test]
    fn slug_keeps_the_volume_readable_in_a_filename() {
        assert_eq!(slug("SD Azul"), "sd-azul");
        assert_eq!(slug("Música 90s / Backup"), "música-90s-backup");
        assert_eq!(slug("  "), "");
    }

    #[test]
    fn default_path_names_the_volume_when_there_is_one() {
        assert_eq!(
            default_export_path("/data/catalog.cdc", "sd-azul", "html"),
            "/data/sd-azul-export.html"
        );
        assert_eq!(
            default_export_path("/data/catalog.cdc", "", "csv"),
            "/data/catalog-export.csv"
        );
    }
}
