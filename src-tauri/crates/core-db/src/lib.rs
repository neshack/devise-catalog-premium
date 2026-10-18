use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
}

#[derive(Debug)]
pub struct Volume {
    pub id: i64,
    pub label: String,
    pub serial: String,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct VolumeInfo {
    pub label: String,
    pub serial: String,
    pub indexed_at: Option<i64>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct VolumeSummary {
    pub label: String,
    pub serial: String,
    pub indexed_at: Option<i64>,
    pub file_count: i64,
    pub total_size: i64,
}

#[derive(Debug)]
pub struct NewFile {
    pub dir_id: i64,
    pub volume_id: i64,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub mtime: i64,
    pub blake3: Option<String>,
    pub container_path: Option<String>,
    pub audio_json: Option<String>,
    pub image_json: Option<String>,
}

#[derive(Debug)]
pub struct ParsedQuery {
    pub fts: String,
    pub ext: Option<String>,
    pub exts: Vec<String>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
    pub volume: Option<String>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct SearchHit {
    pub id: i64,
    pub name: String,
    pub size: i64,
    pub volume_label: String,
    pub ext: Option<String>,
    pub mtime: i64,
    pub path: String,
    pub blake3: Option<String>,
    pub audio_json: Option<String>,
    pub image_json: Option<String>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct FileDuplicate {
    pub id: i64,
    pub name: String,
    pub size: i64,
    pub volume_label: String,
    pub path: String,
}

/// Recursive dir-path map (id -> full normalized path with leading '/').
/// Root row is stored as name "/" (mapped to ""); legacy pre-normalization
/// rows carry the full path in `name` with parent NULL and are used verbatim.
const DIR_PATH_CTE: &str = concat!(
    "WITH RECURSIVE dp(id, p) AS (",
    "  SELECT id, CASE WHEN name = '/' THEN ''",
    "                  WHEN name LIKE '%/%' THEN rtrim(name, '/')",
    "                  ELSE '/' || name END",
    "  FROM dirs WHERE parent_id IS NULL",
    "  UNION ALL",
    "  SELECT d.id, dp.p || '/' || d.name FROM dirs d JOIN dp ON d.parent_id = dp.id",
    ")"
);

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct DuplicateGroup {
    pub blake3: String,
    pub size: i64,
    pub count: i64,
    pub sample_name: String,
}

#[derive(Debug, PartialEq)]
pub struct ExportRow {
    pub name: String,
    pub size: i64,
    pub volume: String,
}

#[derive(Debug, PartialEq)]
pub struct DirRow {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
}

#[derive(Debug, PartialEq)]
pub struct FileRow {
    pub id: i64,
    pub dir_id: i64,
    pub name: String,
    pub size: i64,
    pub mtime: i64,
}

fn lock_err() -> anyhow::Error {
    anyhow::anyhow!("db lock poisoned")
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        // Per-connection pragma: foreign keys (incl. ON DELETE CASCADE) are
        // off by default in SQLite and must be enabled on every connection.
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.execute_batch(include_str!("schema.sql"))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
    pub fn insert_volume(&self, label: &str, serial: &str) -> Result<i64> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        c.execute(
            "INSERT OR IGNORE INTO volumes(label, serial, indexed_at) VALUES(?1, ?2, strftime('%s','now'))",
            params![label, serial],
        )?;
        Ok(c.query_row(
            "SELECT id FROM volumes WHERE label=?1 AND serial=?2",
            params![label, serial],
            |r| r.get(0),
        )?)
    }
    pub fn get_volume(&self, label: &str) -> Result<Option<VolumeInfo>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt =
            c.prepare("SELECT label, serial, indexed_at FROM volumes WHERE label=?1 LIMIT 1")?;
        let mut rows = stmt.query_map(params![label], |r| {
            Ok(VolumeInfo {
                label: r.get(0)?,
                serial: r.get(1)?,
                indexed_at: r.get(2)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }
    /// All volumes with aggregated file counts and total sizes, newest first.
    pub fn list_volumes(&self) -> Result<Vec<VolumeSummary>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt = c.prepare(
            "SELECT v.label, v.serial, v.indexed_at, COUNT(f.id), COALESCE(SUM(f.size), 0) \
             FROM volumes v LEFT JOIN files f ON f.volume_id = v.id \
             GROUP BY v.id ORDER BY v.indexed_at DESC, v.label ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(VolumeSummary {
                    label: r.get(0)?,
                    serial: r.get(1)?,
                    indexed_at: r.get(2)?,
                    file_count: r.get(3)?,
                    total_size: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
    pub fn insert_dir(
        &self,
        volume_id: i64,
        parent: Option<i64>,
        name: &str,
        path_hash: &str,
    ) -> Result<i64> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        // Tolerate existing dirs (re-scan path): keep the first row, return it.
        c.execute(
            "INSERT INTO dirs(volume_id, parent_id, name, path_hash) VALUES(?1,?2,?3,?4) ON CONFLICT(volume_id, path_hash) DO NOTHING",
            params![volume_id, parent, name, path_hash],
        )?;
        Ok(c.query_row(
            "SELECT id FROM dirs WHERE volume_id=?1 AND path_hash=?2",
            params![volume_id, path_hash],
            |r| r.get(0),
        )?)
    }
    pub fn insert_file_batch(&self, files: &[NewFile]) -> Result<()> {
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        for f in files {
            tx.execute("INSERT INTO files(dir_id, volume_id, name, ext, size, mtime, blake3, container_path, audio_json, image_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![f.dir_id, f.volume_id, f.name, f.ext, f.size, f.mtime, f.blake3, f.container_path, f.audio_json, f.image_json])?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn dirs_for_volume(&self, volume_id: i64) -> Result<Vec<DirRow>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt = c.prepare("SELECT id, parent_id, name FROM dirs WHERE volume_id=?1")?;
        let rows = stmt
            .query_map(params![volume_id], |r| {
                Ok(DirRow {
                    id: r.get(0)?,
                    parent_id: r.get(1)?,
                    name: r.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
    pub fn files_for_volume(&self, volume_id: i64) -> Result<Vec<FileRow>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt =
            c.prepare("SELECT id, dir_id, name, size, mtime FROM files WHERE volume_id=?1")?;
        let rows = stmt
            .query_map(params![volume_id], |r| {
                Ok(FileRow {
                    id: r.get(0)?,
                    dir_id: r.get(1)?,
                    name: r.get(2)?,
                    size: r.get(3)?,
                    mtime: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
    /// Refresh a changed file's metadata. `audio_json`/`image_json` are
    /// rewritten too, so re-scanning a re-tagged file does not keep the old
    /// metadata.
    pub fn update_file(
        &self,
        id: i64,
        size: i64,
        mtime: i64,
        blake3: Option<&str>,
        audio_json: Option<&str>,
        image_json: Option<&str>,
    ) -> Result<()> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        c.execute(
            "UPDATE files SET size=?2, mtime=?3, blake3=?4, audio_json=?5, image_json=?6 WHERE id=?1",
            params![id, size, mtime, blake3, audio_json, image_json],
        )?;
        Ok(())
    }
    pub fn delete_files(&self, ids: &[i64]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        for id in ids {
            tx.execute("DELETE FROM files WHERE id=?1", params![id])?;
        }
        tx.commit()?;
        Ok(())
    }
    /// Delete empty dirs bottom-up: only leaf dirs with no files, looped until
    /// no more rows vanish (so newly-emptied parents are collected too).
    /// Never deletes a dir that still holds files or child dirs.
    pub fn delete_empty_dirs(&self, volume_id: i64) -> Result<()> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        loop {
            let n = c.execute(
                "DELETE FROM dirs WHERE volume_id=?1 AND NOT EXISTS(SELECT 1 FROM files WHERE files.dir_id=dirs.id) AND NOT EXISTS(SELECT 1 FROM dirs c WHERE c.parent_id=dirs.id)",
                params![volume_id],
            )?;
            if n == 0 {
                break;
            }
        }
        Ok(())
    }
    pub fn search(&self, q: &ParsedQuery, limit: i64) -> Result<Vec<SearchHit>> {
        // `ext` is kept for backwards compat; `exts` (multi) wins when non-empty.
        let exts: Vec<&str> = if q.exts.is_empty() {
            q.ext.as_deref().into_iter().collect()
        } else {
            q.exts.iter().map(String::as_str).collect()
        };
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut sql = if q.fts.is_empty() {
            format!(
                "{DIR_PATH_CTE} SELECT f.id, f.name, f.size, v.label, f.ext, f.mtime, \
                 COALESCE(NULLIF(dp.p, ''), '/'), f.blake3, f.audio_json, f.image_json \
                 FROM files f JOIN volumes v ON v.id = f.volume_id \
                 LEFT JOIN dp ON dp.id = f.dir_id WHERE 1=1"
            )
        } else {
            format!(
                "{DIR_PATH_CTE} SELECT f.id, f.name, f.size, v.label, f.ext, f.mtime, \
                 COALESCE(NULLIF(dp.p, ''), '/'), f.blake3, f.audio_json, f.image_json \
                 FROM files_fts ft JOIN files f ON f.id = ft.rowid \
                 JOIN volumes v ON v.id = f.volume_id \
                 LEFT JOIN dp ON dp.id = f.dir_id WHERE files_fts MATCH ?"
            )
        };
        let mut args: Vec<rusqlite::types::Value> = Vec::new();
        if !q.fts.is_empty() {
            args.push(q.fts.clone().into());
        }
        if !exts.is_empty() {
            let ph = exts.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            sql.push_str(&format!(" AND f.ext IN ({ph})"));
            for e in &exts {
                args.push((*e).to_string().into());
            }
        }
        if let Some(m) = q.min_size {
            sql.push_str(" AND f.size >= ?");
            args.push(m.into());
        }
        if let Some(m) = q.max_size {
            sql.push_str(" AND f.size <= ?");
            args.push(m.into());
        }
        if let Some(v) = &q.volume {
            sql.push_str(" AND v.label = ?");
            args.push(v.clone().into());
        }
        sql.push_str(" LIMIT ?");
        args.push(limit.into());
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(args.iter()), |r| {
                Ok(SearchHit {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    size: r.get(2)?,
                    volume_label: r.get(3)?,
                    ext: r.get(4)?,
                    mtime: r.get(5)?,
                    path: r.get(6)?,
                    blake3: r.get(7)?,
                    audio_json: r.get(8)?,
                    image_json: r.get(9)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
    pub fn list_duplicates(&self, limit: i64) -> Result<Vec<DuplicateGroup>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt = c.prepare(
            "SELECT blake3, size, COUNT(*) as n, MIN(name) FROM files WHERE blake3 IS NOT NULL GROUP BY blake3, size HAVING n > 1 LIMIT ?",
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(DuplicateGroup {
                    blake3: r.get(0)?,
                    size: r.get(1)?,
                    count: r.get(2)?,
                    sample_name: r.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
    /// Other files sharing the exact BLAKE3 hash of `file_id` (content
    /// duplicates), across all volumes. Empty when the file is unique or
    /// unhashed.
    pub fn file_duplicates(&self, file_id: i64) -> Result<Vec<FileDuplicate>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let sql = format!(
            "{DIR_PATH_CTE} SELECT f2.id, f2.name, f2.size, v.label, \
             COALESCE(NULLIF(dp.p, ''), '/') \
             FROM files f \
             JOIN files f2 ON f2.blake3 = f.blake3 AND f2.id != f.id \
             JOIN volumes v ON v.id = f2.volume_id \
             LEFT JOIN dp ON dp.id = f2.dir_id \
             WHERE f.id = ?1 AND f.blake3 IS NOT NULL \
             ORDER BY v.label, dp.p, f2.name"
        );
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt
            .query_map(params![file_id], |r| {
                Ok(FileDuplicate {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    size: r.get(2)?,
                    volume_label: r.get(3)?,
                    path: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
    pub fn export_rows(&self) -> Result<Vec<ExportRow>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt = c.prepare(
            "SELECT f.name, f.size, v.label FROM files f JOIN volumes v ON v.id = f.volume_id ORDER BY f.name",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ExportRow {
                    name: r.get(0)?,
                    size: r.get(1)?,
                    volume: r.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}
