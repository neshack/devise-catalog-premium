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

/// Quote-aware tokenizing: `"..."` groups spaces into one token, `""` inside
/// quotes is a literal `"`. An unterminated quote just runs to end of input
/// (never an error).
fn split_tokens(raw: &str) -> Vec<String> {
    let mut toks = Vec::new();
    let mut cur = String::new();
    let mut has = false;
    let mut in_q = false;
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        if in_q {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    cur.push('"');
                } else {
                    in_q = false;
                }
            } else {
                cur.push(c);
            }
            has = true;
        } else if c == '"' {
            in_q = true;
            has = true;
        } else if c.is_whitespace() {
            if has {
                toks.push(std::mem::take(&mut cur));
                has = false;
            }
        } else {
            cur.push(c);
            has = true;
        }
    }
    if has {
        toks.push(cur);
    }
    toks
}

/// Parse "5MB"/"5mb"/"1024"/"1.5GB" into bytes (KB/MB/GB = 1024-based).
fn parse_size_value(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let cut = s.find(|c: char| c.is_ascii_alphabetic()).unwrap_or(s.len());
    let (num, unit) = s.split_at(cut);
    let num: f64 = num.trim().parse().ok()?;
    if num < 0.0 {
        return None;
    }
    let mult: f64 = match unit.trim().to_uppercase().as_str() {
        "" | "B" => 1.0,
        "KB" | "K" => 1024.0,
        "MB" | "M" => 1024.0 * 1024.0,
        "GB" | "G" => 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some((num * mult).round() as i64)
}

/// Full Rust-side parsing of the raw query string (single source of truth).
/// Handles leading `*.ext`, `ext:mp3`, `ext:{mp3,flac}`, `size:>5MB` (also
/// `>=`, `<`, `<=`, `=`/plain = exact bytes), `volume:"Multi Word"`;
/// remaining tokens become FTS terms via [`fts_match`].
pub fn parse_raw_query(raw: &str) -> ParsedQuery {
    let mut exts: Vec<String> = Vec::new();
    let mut min_size: Option<i64> = None;
    let mut max_size: Option<i64> = None;
    let mut volume: Option<String> = None;
    let mut fts_terms: Vec<String> = Vec::new();

    for tok in split_tokens(raw) {
        if tok.is_empty() {
            continue;
        }
        let low = tok.to_lowercase();
        if let Some(rest) = low.strip_prefix("*.") {
            // Leading `*.ext` (also accepted mid-query): extension filter.
            let ext = rest.trim().to_string();
            if !ext.is_empty() {
                exts.push(ext);
                continue;
            }
        } else if low.starts_with("ext:") {
            // Slice the original token (ASCII prefix, same byte length).
            let rest = tok[4..].trim();
            if let Some(inner) = rest.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
                for part in inner.split(',') {
                    let e = part.trim().trim_start_matches('.').to_lowercase();
                    if !e.is_empty() {
                        exts.push(e);
                    }
                }
            } else {
                let e = rest.trim_start_matches('.').to_lowercase();
                if !e.is_empty() {
                    exts.push(e);
                }
            }
            if !rest.is_empty() {
                continue;
            }
        } else if low.starts_with("size:") {
            let rest = tok[5..].trim();
            let (op, val) = if let Some(v) = rest.strip_prefix(">=") {
                ("gte", v)
            } else if let Some(v) = rest.strip_prefix("<=") {
                ("lte", v)
            } else if let Some(v) = rest.strip_prefix('>') {
                ("gt", v)
            } else if let Some(v) = rest.strip_prefix('<') {
                ("lt", v)
            } else if let Some(v) = rest.strip_prefix('=') {
                ("eq", v)
            } else {
                ("eq", rest)
            };
            if let Some(n) = parse_size_value(val) {
                match op {
                    "gt" | "gte" => min_size = Some(n),
                    "lt" | "lte" => max_size = Some(n),
                    _ => {
                        min_size = Some(n);
                        max_size = Some(n);
                    }
                }
                continue;
            }
            // Unparseable size value: fall through to FTS so nothing is lost.
        } else if low.starts_with("volume:") {
            let val = tok[7..].trim().to_string();
            if !val.is_empty() {
                volume = Some(val);
                continue;
            }
        }
        fts_terms.push(tok);
    }

    ParsedQuery {
        fts: fts_match(&fts_terms.join(" ")),
        ext: None,
        exts,
        min_size,
        max_size,
        volume,
        volume_serial: None,
    }
}

#[tauri::command]
pub fn search(
    db_path: String,
    raw: String,
    limit: i64,
    volume_label: Option<String>,
    volume_serial: Option<String>,
) -> Result<Vec<core_db::SearchHit>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    let mut q = parse_raw_query(&raw);
    if q.volume.is_none() {
        q.volume = volume_label.filter(|v| !v.trim().is_empty());
    }
    q.volume_serial = volume_serial.filter(|v| !v.trim().is_empty());
    if q.fts.is_empty()
        && q.exts.is_empty()
        && q.ext.is_none()
        && q.min_size.is_none()
        && q.max_size.is_none()
        && q.volume.is_none()
        && q.volume_serial.is_none()
    {
        return Ok(Vec::new());
    }
    db.search(&q, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_hit(db_path: String, file_id: i64) -> Result<Option<core_db::SearchHit>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.get_hit(file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_duplicates(
    db_path: String,
    limit: i64,
) -> Result<Vec<core_db::DuplicateGroup>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.list_duplicates(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_volume(db_path: String, label: String) -> Result<Option<core_db::VolumeInfo>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.get_volume(&label).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_volumes(db_path: String) -> Result<Vec<core_db::VolumeSummary>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.list_volumes().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_duplicates(
    db_path: String,
    file_id: i64,
) -> Result<Vec<core_db::FileDuplicate>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    db.file_duplicates(file_id).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{fts_match, parse_raw_query};

    #[test]
    fn match_builder_quotes_special_chars() {
        assert_eq!(fts_match("a\"b (c"), "\"a\"\"b\"* \"(c\"*");
    }

    #[test]
    fn parses_star_ext_and_size() {
        let q = parse_raw_query("*.mp3 size:>5MB");
        assert_eq!(q.exts, vec!["mp3".to_string()]);
        assert_eq!(q.min_size, Some(5 * 1024 * 1024));
        assert_eq!(q.max_size, None);
    }

    #[test]
    fn parses_quoted_volume() {
        let q = parse_raw_query("volume:\"Backup 12\"");
        assert_eq!(q.volume.as_deref(), Some("Backup 12"));
        assert!(q.fts.is_empty());
    }

    #[test]
    fn hostile_input_does_not_error() {
        let q = parse_raw_query("a\"b (c");
        // Quote-aware grouping merges into one token; the FTS string stays
        // balanced/quoted so it can never break MATCH syntax (never panics).
        assert_eq!(q.fts, "\"ab\"* \"(c\"*");
    }

    #[test]
    fn parses_ext_brace_list() {
        let q = parse_raw_query("ext:{mp3,flac}");
        assert_eq!(q.exts, vec!["mp3".to_string(), "flac".to_string()]);
        assert!(q.fts.is_empty());
    }
}
