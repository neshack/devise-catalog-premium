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
    pub min_size: Option<i64>,
    pub volume: Option<String>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct SearchHit {
    pub id: i64,
    pub name: String,
    pub size: i64,
    pub volume_label: String,
}

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

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(include_str!("schema.sql"))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
    pub fn insert_volume(&self, label: &str, serial: &str) -> Result<i64> {
        let c = self.conn.lock().unwrap();
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
    pub fn insert_dir(
        &self,
        volume_id: i64,
        parent: Option<i64>,
        name: &str,
        path_hash: &str,
    ) -> Result<i64> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO dirs(volume_id, parent_id, name, path_hash) VALUES(?1,?2,?3,?4)",
            params![volume_id, parent, name, path_hash],
        )?;
        Ok(c.last_insert_rowid())
    }
    pub fn insert_file_batch(&self, files: &[NewFile]) -> Result<()> {
        let mut c = self.conn.lock().unwrap();
        let tx = c.transaction()?;
        for f in files {
            tx.execute("INSERT INTO files(dir_id, volume_id, name, ext, size, mtime, blake3, container_path, audio_json, image_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![f.dir_id, f.volume_id, f.name, f.ext, f.size, f.mtime, f.blake3, f.container_path, f.audio_json, f.image_json])?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn search(&self, q: &ParsedQuery, limit: i64) -> Result<Vec<SearchHit>> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c.prepare(
            "SELECT f.id, f.name, f.size, v.label FROM files_fts ft JOIN files f ON f.id = ft.rowid JOIN volumes v ON v.id = f.volume_id WHERE files_fts MATCH ?1 AND (?2 IS NULL OR f.ext = ?2) AND (?3 IS NULL OR f.size >= ?3) AND (?4 IS NULL OR v.label = ?4) LIMIT ?5")?;
        let rows = stmt
            .query_map(params![q.fts, q.ext, q.min_size, q.volume, limit], |r| {
                Ok(SearchHit {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    size: r.get(2)?,
                    volume_label: r.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
    pub fn list_duplicates(&self, limit: i64) -> Result<Vec<DuplicateGroup>> {
        let c = self.conn.lock().unwrap();
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
    pub fn export_rows(&self) -> Result<Vec<ExportRow>> {
        let c = self.conn.lock().unwrap();
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
