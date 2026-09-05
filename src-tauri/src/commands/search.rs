use core_db::{Db, ParsedQuery};
use std::path::Path;

/// Build a safe FTS5 MATCH prefix query: each whitespace-separated token is
/// double-quoted (`"` escaped as `""`, bare `*` stripped) with the prefix `*`
/// outside the quotes, so raw user text can't break FTS5 syntax.
fn fts_match(raw: &str) -> String {
    raw.split_whitespace()
        .map(|t| t.replace('*', ""))
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn search(db_path: String, raw: String, limit: i64) -> Result<Vec<core_db::SearchHit>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    // parse mínimo espejo del frontend: "*.mp3" -> ext mp3
    let (term, ext) = if raw.trim_start().starts_with("*.") {
        let e = raw.trim()[2..]
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_lowercase();
        (e.clone(), Some(e))
    } else {
        (raw.replace('*', ""), None)
    };
    let fts = fts_match(&term);
    if fts.is_empty() {
        return Ok(Vec::new());
    }
    db.search(
        &ParsedQuery {
            fts,
            ext,
            min_size: None,
            volume: None,
        },
        limit,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_duplicates(db_path: String, limit: i64) -> Result<Vec<core_db::DuplicateGroup>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.list_duplicates(limit).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::fts_match;

    #[test]
    fn match_builder_quotes_special_chars() {
        assert_eq!(fts_match("a\"b (c"), "\"a\"\"b\"* \"(c\"*");
    }
}
