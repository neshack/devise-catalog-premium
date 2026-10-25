use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
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
    /// Stable identity. Labels repeat (two `Backup` discs are a real case),
    /// so every action that changes a volume must use this, never the label.
    pub id: i64,
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
    pub volume_serial: Option<String>,
    /// Every tag must match, either directly on the file or inherited from a
    /// tagged folder above it.
    pub tags: Vec<String>,
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
    /// Set when the hit lives inside an archive instead of on disk.
    pub container_path: Option<String>,
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
/// rows carry the full path in `name` with parent NULL and are trimmed into
/// the same canonical form the scanner uses (`dir_full_paths`), so the path a
/// query shows always matches the path the next scan will look for.
const DIR_PATH_CTE: &str = concat!(
    "WITH RECURSIVE dp(id, p) AS (",
    "  SELECT id, CASE WHEN name = '/' THEN ''",
    "                  WHEN name LIKE '%/%' THEN '/' || trim(name, '/')",
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
    /// Set when the row lives inside an archive instead of on disk.
    pub container_path: Option<String>,
}

/// A scan attempt as persisted, joined with the volume it targets.
///
/// `state` is one of `running`, `paused`, `interrupted`, `completed`,
/// `cancelled`, `failed`; `phase` is `walk`, `index` or `done`. Counters are
/// what the last beat saw, which is exactly what the UI needs to say where a
/// scan stopped after the process died.
#[derive(Debug, PartialEq, Clone, serde::Serialize)]
pub struct ScanRun {
    pub id: i64,
    pub volume_id: i64,
    pub volume_label: String,
    pub volume_serial: String,
    pub root: String,
    pub state: String,
    pub phase: String,
    pub files_seen: i64,
    pub bytes_seen: i64,
    pub files_total: Option<i64>,
    pub bytes_total: Option<i64>,
    pub current_path: Option<String>,
    pub error_count: i64,
    pub error: Option<String>,
    pub started_at: i64,
    pub heartbeat_at: i64,
}

/// The numbers a live scan mirrors on every beat. Owned fields on purpose:
/// a beat is built inside a function that also holds the borrow of the
/// session's current path, and borrowing out of that would fight the checker
/// for no benefit (one beat every couple of seconds).
#[derive(Debug, Default, Clone)]
pub struct RunBeat {
    pub phase: String,
    pub files_seen: i64,
    pub bytes_seen: i64,
    pub files_total: Option<i64>,
    pub bytes_total: Option<i64>,
    pub current_path: Option<String>,
    pub error_count: i64,
}

/// Every scan-run field plus the volume it targets, in the order
/// [`scan_run_row`] reads them.
const SCAN_RUN_SELECT: &str = "SELECT r.id, r.volume_id, v.label, v.serial, r.root, r.state, r.phase, \
     r.files_seen, r.bytes_seen, r.files_total, r.bytes_total, r.current_path, r.error_count, r.error, \
     r.started_at, r.heartbeat_at FROM scan_runs r JOIN volumes v ON v.id = r.volume_id";

fn scan_run_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ScanRun> {
    Ok(ScanRun {
        id: r.get(0)?,
        volume_id: r.get(1)?,
        volume_label: r.get(2)?,
        volume_serial: r.get(3)?,
        root: r.get(4)?,
        state: r.get(5)?,
        phase: r.get(6)?,
        files_seen: r.get(7)?,
        bytes_seen: r.get(8)?,
        files_total: r.get(9)?,
        bytes_total: r.get(10)?,
        current_path: r.get(11)?,
        error_count: r.get(12)?,
        error: r.get(13)?,
        started_at: r.get(14)?,
        heartbeat_at: r.get(15)?,
    })
}

/// A folder as the tree shows it: what it is, and what it holds one level down.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct TreeDir {
    pub id: i64,
    pub name: String,
    /// Files directly inside it (not recursive).
    pub files: i64,
    /// Folders directly inside it.
    pub dirs: i64,
    /// Bytes of the files directly inside it.
    pub size: i64,
    /// Tags attached directly to this folder.
    pub tags: Vec<String>,
}

/// A file as the tree shows it.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct TreeFile {
    pub id: i64,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub mtime: i64,
    pub container_path: Option<String>,
    /// Tags attached directly to this file.
    pub tags: Vec<String>,
}

/// One level of the tree: the folders and files inside a folder.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct TreeChildren {
    pub dirs: Vec<TreeDir>,
    pub files: Vec<TreeFile>,
    /// How many there are in total, before the cap: the UI can say so.
    pub files_total: i64,
    pub dirs_total: i64,
}

/// Folders and files are capped per level: a folder with a million entries
/// would freeze the window long before it informed anyone.
pub const TREE_PAGE: i64 = 5000;

/// Where a file lives in its volume's tree, enough to open every level above
/// it. `dir_ids` runs from the volume root to the file's own folder.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct TreePath {
    pub volume_label: String,
    pub volume_serial: String,
    pub dir_ids: Vec<i64>,
    pub file_id: i64,
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
        // A long delete holds the write lock. Readers keep working in WAL, but
        // a second writer should wait instead of failing with "database is
        // locked" the moment it arrives.
        conn.busy_timeout(std::time::Duration::from_secs(10))?;
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
            "SELECT v.id, v.label, v.serial, v.indexed_at, COUNT(f.id), COALESCE(SUM(f.size), 0) \
             FROM volumes v LEFT JOIN files f ON f.volume_id = v.id \
             GROUP BY v.id ORDER BY v.indexed_at DESC, v.label ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(VolumeSummary {
                    id: r.get(0)?,
                    label: r.get(1)?,
                    serial: r.get(2)?,
                    indexed_at: r.get(3)?,
                    file_count: r.get(4)?,
                    total_size: r.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Remove a volume from the catalog: its files, folders, scan history and
    /// unreadable-path list go with it through the schema's cascades.
    ///
    /// This never touches the disk. The catalog is an index, and forgetting a
    /// disc must be recoverable by scanning it again.
    pub fn delete_volume(&self, id: i64) -> Result<usize> {
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        let n = tx.execute("DELETE FROM volumes WHERE id=?1", params![id])?;
        if n > 0 {
            // Tags are shared by name; only the ones that lost every link go.
            tx.execute(
                "DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM file_tags WHERE tag_id = tags.id) \
                 AND NOT EXISTS(SELECT 1 FROM dir_tags WHERE tag_id = tags.id)",
                [],
            )?;
        }
        tx.commit()?;
        Ok(n)
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
        let mut stmt = c.prepare(
            "SELECT id, dir_id, name, size, mtime, container_path FROM files WHERE volume_id=?1",
        )?;
        let rows = stmt
            .query_map(params![volume_id], |r| {
                Ok(FileRow {
                    id: r.get(0)?,
                    dir_id: r.get(1)?,
                    name: r.get(2)?,
                    size: r.get(3)?,
                    mtime: r.get(4)?,
                    container_path: r.get(5)?,
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
                 COALESCE(NULLIF(dp.p, ''), '/'), f.blake3, f.audio_json, f.image_json, \
                 f.container_path \
                 FROM files f JOIN volumes v ON v.id = f.volume_id \
                 LEFT JOIN dp ON dp.id = f.dir_id WHERE 1=1"
            )
        } else {
            format!(
                "{DIR_PATH_CTE} SELECT f.id, f.name, f.size, v.label, f.ext, f.mtime, \
                 COALESCE(NULLIF(dp.p, ''), '/'), f.blake3, f.audio_json, f.image_json, \
                 f.container_path \
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
        if let Some(v) = &q.volume_serial {
            sql.push_str(" AND v.serial = ?");
            args.push(v.clone().into());
        }
        for tag in &q.tags {
            // Direct tag, or any tagged folder above the file. The recursive
            // CTE is per tag so several tags mean AND, not OR.
            sql.push_str(
                " AND (EXISTS (SELECT 1 FROM file_tags ft JOIN tags t ON t.id = ft.tag_id \
                  WHERE ft.file_id = f.id AND t.name = ?) \
                  OR f.dir_id IN (WITH RECURSIVE tagged_dirs(id) AS ( \
                    SELECT d.id FROM dirs d JOIN dir_tags dt ON dt.dir_id = d.id \
                    JOIN tags t ON t.id = dt.tag_id WHERE t.name = ? \
                    UNION ALL \
                    SELECT c.id FROM dirs c JOIN tagged_dirs td ON c.parent_id = td.id \
                  ) SELECT id FROM tagged_dirs))",
            );
            args.push(tag.clone().into());
            args.push(tag.clone().into());
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
                    container_path: r.get(10)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Fetch one indexed row by id with the same shape search returns.
    pub fn get_hit(&self, file_id: i64) -> Result<Option<SearchHit>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let sql = format!(
            "{DIR_PATH_CTE} SELECT f.id, f.name, f.size, v.label, f.ext, f.mtime, \
             COALESCE(NULLIF(dp.p, ''), '/'), f.blake3, f.audio_json, f.image_json, \
             f.container_path \
             FROM files f JOIN volumes v ON v.id = f.volume_id \
             LEFT JOIN dp ON dp.id = f.dir_id WHERE f.id = ?1 LIMIT 1"
        );
        c.query_row(&sql, params![file_id], |r| {
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
                container_path: r.get(10)?,
            })
        })
        .optional()
        .map_err(Into::into)
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

    /// Open a scan attempt. The row exists before a single file is read so an
    /// interrupted process still leaves a trace of what it was doing.
    pub fn start_scan_run(&self, volume_id: i64, root: &str, phase: &str) -> Result<i64> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        c.execute(
            "INSERT INTO scan_runs(volume_id, root, state, phase, started_at, heartbeat_at) \
             VALUES(?1, ?2, 'running', ?3, strftime('%s','now'), strftime('%s','now'))",
            params![volume_id, root, phase],
        )?;
        Ok(c.last_insert_rowid())
    }

    /// Mirror live counters and prove the scan is still alive.
    pub fn beat_scan_run(&self, run_id: i64, beat: &RunBeat) -> Result<()> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        c.execute(
            "UPDATE scan_runs SET phase=?2, files_seen=?3, bytes_seen=?4, files_total=?5, \
             bytes_total=?6, current_path=?7, error_count=?8, heartbeat_at=strftime('%s','now') \
             WHERE id=?1",
            params![
                run_id,
                beat.phase,
                beat.files_seen,
                beat.bytes_seen,
                beat.files_total,
                beat.bytes_total,
                beat.current_path,
                beat.error_count
            ],
        )?;
        Ok(())
    }

    /// Close a run. `state` carries the outcome, `error` the reason when there
    /// was one (`failed`), and the counters are written one last time.
    pub fn finish_scan_run(
        &self,
        run_id: i64,
        state: &str,
        beat: &RunBeat,
        error: Option<&str>,
    ) -> Result<()> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        c.execute(
            "UPDATE scan_runs SET state=?2, phase=?3, files_seen=?4, bytes_seen=?5, files_total=?6, \
             bytes_total=?7, current_path=?8, error_count=?9, error=?10, \
             heartbeat_at=strftime('%s','now') WHERE id=?1",
            params![
                run_id,
                state,
                beat.phase,
                beat.files_seen,
                beat.bytes_seen,
                beat.files_total,
                beat.bytes_total,
                beat.current_path,
                beat.error_count,
                error
            ],
        )?;
        Ok(())
    }

    /// Change a run's state without touching its counters (pause, resume).
    pub fn set_scan_run_state(&self, run_id: i64, state: &str) -> Result<()> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        c.execute(
            "UPDATE scan_runs SET state=?2, heartbeat_at=strftime('%s','now') WHERE id=?1",
            params![run_id, state],
        )?;
        Ok(())
    }

    /// The most recent attempt, whatever its state: what the UI needs to show
    /// "where the last scan stopped" the moment the app opens.
    pub fn latest_scan_run(&self) -> Result<Option<ScanRun>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt = c.prepare(&format!(
            "{SCAN_RUN_SELECT} ORDER BY r.started_at DESC, r.id DESC LIMIT 1"
        ))?;
        let mut rows = stmt.query_map([], scan_run_row)?;
        Ok(rows.next().transpose()?)
    }

    /// Mark runs whose heartbeat went quiet as interrupted.
    ///
    /// Called once at start-up, never while a scan could be live: a process
    /// that is sleeping (or paused) keeps beating, so a stale heartbeat can
    /// only mean the process is gone. Returns how many rows were swept.
    pub fn sweep_stale_scan_runs(&self, stale_secs: i64) -> Result<usize> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let n = c.execute(
            "UPDATE scan_runs SET state='interrupted', \
             error=COALESCE(error, 'la aplicación se cerró durante el escaneo') \
             WHERE state IN ('running', 'paused') \
             AND heartbeat_at < strftime('%s','now') - ?1",
            params![stale_secs],
        )?;
        Ok(n)
    }

    /// Files seen by the last finished scan of this volume, if any. Used as the
    /// estimate the UI shows while walking: a real total is not knowable
    /// without walking, and pretending otherwise would be a lie.
    pub fn last_completed_file_count(&self, volume_id: i64) -> Result<Option<i64>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt = c.prepare(
            "SELECT files_seen FROM scan_runs \
             WHERE volume_id=?1 AND state='completed' ORDER BY started_at DESC, id DESC LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![volume_id], |r| r.get(0))?;
        Ok(rows.next().transpose()?)
    }

    /// Record what could not be read. Replaces the volume's previous list: the
    /// errors belong to the last completed walk, not to history.
    pub fn replace_scan_errors(&self, volume_id: i64, errors: &[(String, String)]) -> Result<()> {
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        tx.execute(
            "DELETE FROM scan_errors WHERE volume_id=?1",
            params![volume_id],
        )?;
        {
            let mut stmt =
                tx.prepare("INSERT INTO scan_errors(volume_id, path, reason) VALUES(?1, ?2, ?3)")?;
            for (path, reason) in errors {
                stmt.execute(params![volume_id, path, reason])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// What the last walk could not read, newest list first.
    pub fn scan_errors(&self, volume_id: i64) -> Result<Vec<(String, String)>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt =
            c.prepare("SELECT path, reason FROM scan_errors WHERE volume_id=?1 ORDER BY path")?;
        let rows = stmt
            .query_map(params![volume_id], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Trim a user-supplied tag and reject the two values that cannot be
    /// stored meaningfully. A leading `#` is accepted because that is how the
    /// search syntax writes a tag.
    fn clean_tag(name: &str) -> Result<String> {
        let tag = name.trim().trim_start_matches('#').trim();
        if tag.is_empty() {
            anyhow::bail!("la etiqueta no puede estar vacía");
        }
        if tag.chars().count() > 64 {
            anyhow::bail!("la etiqueta es demasiado larga");
        }
        Ok(tag.to_string())
    }

    fn tags_for_file(c: &rusqlite::Connection, file_id: i64) -> Result<Vec<String>> {
        let mut stmt = c.prepare(
            "SELECT t.name FROM file_tags ft JOIN tags t ON t.id = ft.tag_id \
             WHERE ft.file_id = ?1 ORDER BY t.name COLLATE NOCASE",
        )?;
        let rows = stmt
            .query_map(params![file_id], |r| r.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn tags_for_dir(c: &rusqlite::Connection, dir_id: i64) -> Result<Vec<String>> {
        let mut stmt = c.prepare(
            "SELECT t.name FROM dir_tags dt JOIN tags t ON t.id = dt.tag_id \
             WHERE dt.dir_id = ?1 ORDER BY t.name COLLATE NOCASE",
        )?;
        let rows = stmt
            .query_map(params![dir_id], |r| r.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Attach a tag to a file, creating the tag name on first use. Returns the
    /// file's complete tag list so the UI never has to guess what changed.
    pub fn add_file_tag(&self, file_id: i64, name: &str) -> Result<Vec<String>> {
        let name = Self::clean_tag(name)?;
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        tx.execute("INSERT OR IGNORE INTO tags(name) VALUES(?1)", params![name])?;
        let tag_id: i64 =
            tx.query_row("SELECT id FROM tags WHERE name = ?1", params![name], |r| {
                r.get(0)
            })?;
        tx.execute(
            "INSERT OR IGNORE INTO file_tags(file_id, tag_id) VALUES(?1, ?2)",
            params![file_id, tag_id],
        )?;
        let tags = Self::tags_for_file(&tx, file_id)?;
        tx.commit()?;
        Ok(tags)
    }

    pub fn remove_file_tag(&self, file_id: i64, name: &str) -> Result<Vec<String>> {
        let name = Self::clean_tag(name)?;
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        tx.execute(
            "DELETE FROM file_tags WHERE file_id = ?1 AND tag_id = \
             (SELECT id FROM tags WHERE name = ?2)",
            params![file_id, name],
        )?;
        tx.execute(
            "DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM file_tags WHERE tag_id = tags.id) \
             AND NOT EXISTS(SELECT 1 FROM dir_tags WHERE tag_id = tags.id)",
            [],
        )?;
        let tags = Self::tags_for_file(&tx, file_id)?;
        tx.commit()?;
        Ok(tags)
    }

    pub fn file_tags(&self, file_id: i64) -> Result<Vec<String>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        Self::tags_for_file(&c, file_id)
    }

    /// Attach a tag to a folder. Search inherits it through the whole subtree;
    /// the tree still shows it only on the folder that carries it.
    pub fn add_dir_tag(&self, dir_id: i64, name: &str) -> Result<Vec<String>> {
        let name = Self::clean_tag(name)?;
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        tx.execute("INSERT OR IGNORE INTO tags(name) VALUES(?1)", params![name])?;
        let tag_id: i64 =
            tx.query_row("SELECT id FROM tags WHERE name = ?1", params![name], |r| {
                r.get(0)
            })?;
        tx.execute(
            "INSERT OR IGNORE INTO dir_tags(dir_id, tag_id) VALUES(?1, ?2)",
            params![dir_id, tag_id],
        )?;
        let tags = Self::tags_for_dir(&tx, dir_id)?;
        tx.commit()?;
        Ok(tags)
    }

    pub fn remove_dir_tag(&self, dir_id: i64, name: &str) -> Result<Vec<String>> {
        let name = Self::clean_tag(name)?;
        let mut c = self.conn.lock().map_err(|_| lock_err())?;
        let tx = c.transaction()?;
        tx.execute(
            "DELETE FROM dir_tags WHERE dir_id = ?1 AND tag_id = \
             (SELECT id FROM tags WHERE name = ?2)",
            params![dir_id, name],
        )?;
        tx.execute(
            "DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM file_tags WHERE tag_id = tags.id) \
             AND NOT EXISTS(SELECT 1 FROM dir_tags WHERE tag_id = tags.id)",
            [],
        )?;
        let tags = Self::tags_for_dir(&tx, dir_id)?;
        tx.commit()?;
        Ok(tags)
    }

    pub fn dir_tags(&self, dir_id: i64) -> Result<Vec<String>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        Self::tags_for_dir(&c, dir_id)
    }

    /// Every tag in the catalog, for the editor's suggestions.
    pub fn list_tags(&self) -> Result<Vec<String>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let mut stmt = c.prepare("SELECT name FROM tags ORDER BY name COLLATE NOCASE")?;
        let rows = stmt
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Where a file sits in its volume's tree, from the root to its folder.
    pub fn tree_path(&self, file_id: i64) -> Result<Option<TreePath>> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let base: Option<(String, String, i64)> = c
            .query_row(
                "SELECT v.label, v.serial, f.dir_id FROM files f \
                 JOIN volumes v ON v.id = f.volume_id WHERE f.id = ?1",
                params![file_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let Some((volume_label, volume_serial, dir_id)) = base else {
            return Ok(None);
        };
        let mut stmt = c.prepare(
            "WITH RECURSIVE ancestors(id, parent_id) AS ( \
               SELECT id, parent_id FROM dirs WHERE id = ?1 \
               UNION ALL \
               SELECT d.id, d.parent_id FROM dirs d JOIN ancestors a ON d.id = a.parent_id \
             ) SELECT id FROM ancestors",
        )?;
        let mut dir_ids = stmt
            .query_map(params![dir_id], |r| r.get(0))?
            .collect::<std::result::Result<Vec<i64>, _>>()?;
        dir_ids.reverse();
        Ok(Some(TreePath {
            volume_label,
            volume_serial,
            dir_ids,
            file_id,
        }))
    }

    /// One level of the catalog's tree: the folders and files inside a folder
    /// of a volume. `parent` is a dir id; `None` means the volume's root.
    ///
    /// Folder sizes and counts are direct, not recursive: what the tree says
    /// about a folder has to match what expanding it will actually show.
    pub fn tree_children(
        &self,
        volume: &str,
        serial: Option<&str>,
        parent: Option<i64>,
    ) -> Result<TreeChildren> {
        let c = self.conn.lock().map_err(|_| lock_err())?;
        let volume_id: i64 = match serial {
            Some(serial) => c
                .query_row(
                    "SELECT id FROM volumes WHERE label=?1 AND serial=?2",
                    params![volume, serial],
                    |r| r.get(0),
                )
                .map_err(|e| match e {
                    rusqlite::Error::QueryReturnedNoRows => {
                        anyhow::anyhow!("volumen desconocido: {volume} ({serial})")
                    }
                    other => other.into(),
                })?,
            None => c
                .query_row(
                    "SELECT id FROM volumes WHERE label=?1",
                    params![volume],
                    |r| r.get(0),
                )
                .map_err(|e| match e {
                    rusqlite::Error::QueryReturnedNoRows => {
                        anyhow::anyhow!("volumen desconocido: {volume}")
                    }
                    other => other.into(),
                })?,
        };

        // The volume's top level is its root folder, which the scanner writes
        // as the one dir with no parent. Asking for `None` means "start there",
        // not "the dirs that have no parent".
        let parent: Option<i64> = match parent {
            Some(id) => Some(id),
            None => c
                .query_row(
                    "SELECT id FROM dirs WHERE volume_id=?1 AND parent_id IS NULL ORDER BY id LIMIT 1",
                    params![volume_id],
                    |r| r.get(0),
                )
                .optional()?,
        };
        let Some(parent) = parent else {
            // A volume with no folders at all: nothing to show, nothing wrong.
            return Ok(TreeChildren {
                dirs: Vec::new(),
                files: Vec::new(),
                files_total: 0,
                dirs_total: 0,
            });
        };

        let (dirs_total, files_total): (i64, i64) = c.query_row(
            "SELECT (SELECT COUNT(*) FROM dirs WHERE volume_id=?1 AND parent_id=?2), \
                    (SELECT COUNT(*) FROM files WHERE volume_id=?1 AND dir_id=?2)",
            params![volume_id, parent],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;

        let mut stmt = c.prepare(
            "SELECT d.id, d.name, \
                (SELECT COUNT(*) FROM files f WHERE f.dir_id = d.id), \
                COALESCE((SELECT SUM(f.size) FROM files f WHERE f.dir_id = d.id), 0), \
                (SELECT COUNT(*) FROM dirs child WHERE child.parent_id = d.id) \
             FROM dirs d WHERE d.volume_id=?1 AND d.parent_id=?2 \
             ORDER BY d.name COLLATE NOCASE LIMIT ?3",
        )?;
        let mut dirs = stmt
            .query_map(params![volume_id, parent, TREE_PAGE], |r| {
                Ok(TreeDir {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    files: r.get(2)?,
                    size: r.get(3)?,
                    dirs: r.get(4)?,
                    tags: Vec::new(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // One extra query for the whole level, not one per folder.
        let mut tag_stmt = c.prepare(
            "SELECT dt.dir_id, t.name FROM dir_tags dt \
             JOIN tags t ON t.id = dt.tag_id JOIN dirs d ON d.id = dt.dir_id \
             WHERE d.volume_id=?1 AND d.parent_id=?2 ORDER BY t.name COLLATE NOCASE",
        )?;
        let mut dir_tags: HashMap<i64, Vec<String>> = HashMap::new();
        for row in tag_stmt.query_map(params![volume_id, parent], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })? {
            let (dir_id, tag) = row?;
            dir_tags.entry(dir_id).or_default().push(tag);
        }
        for dir in &mut dirs {
            dir.tags = dir_tags.remove(&dir.id).unwrap_or_default();
        }

        let mut stmt = c.prepare(
            "SELECT f.id, f.name, COALESCE(f.ext, ''), f.size, COALESCE(f.mtime, 0), f.container_path \
             FROM files f WHERE f.volume_id=?1 AND f.dir_id=?2 \
             ORDER BY f.name COLLATE NOCASE LIMIT ?3",
        )?;
        let mut files = stmt
            .query_map(params![volume_id, parent, TREE_PAGE], |r| {
                Ok(TreeFile {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    ext: r.get(2)?,
                    size: r.get(3)?,
                    mtime: r.get(4)?,
                    container_path: r.get(5)?,
                    tags: Vec::new(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let mut tag_stmt = c.prepare(
            "SELECT ft.file_id, t.name FROM file_tags ft \
             JOIN tags t ON t.id = ft.tag_id JOIN files f ON f.id = ft.file_id \
             WHERE f.volume_id=?1 AND f.dir_id=?2 ORDER BY t.name COLLATE NOCASE",
        )?;
        let mut file_tags: HashMap<i64, Vec<String>> = HashMap::new();
        for row in tag_stmt.query_map(params![volume_id, parent], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })? {
            let (file_id, tag) = row?;
            file_tags.entry(file_id).or_default().push(tag);
        }
        for file in &mut files {
            file.tags = file_tags.remove(&file.id).unwrap_or_default();
        }

        Ok(TreeChildren {
            dirs,
            files,
            files_total,
            dirs_total,
        })
    }
}
