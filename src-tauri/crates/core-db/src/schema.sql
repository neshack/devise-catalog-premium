PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS volumes(id INTEGER PRIMARY KEY, label TEXT NOT NULL, serial TEXT NOT NULL, fs_type TEXT, total_bytes INTEGER, used_bytes INTEGER, media_kind TEXT, indexed_at INTEGER, root_hash TEXT, UNIQUE(label, serial));
CREATE TABLE IF NOT EXISTS dirs(id INTEGER PRIMARY KEY, volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE, parent_id INTEGER REFERENCES dirs(id) ON DELETE CASCADE, name TEXT NOT NULL, path_hash TEXT NOT NULL, mtime INTEGER);
CREATE INDEX IF NOT EXISTS idx_dirs_vol_parent ON dirs(volume_id, parent_id);
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, dir_id INTEGER NOT NULL REFERENCES dirs(id) ON DELETE CASCADE, volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE, name TEXT NOT NULL, ext TEXT, size INTEGER NOT NULL, ctime INTEGER, mtime INTEGER, attrs TEXT, blake3 TEXT, sha256 TEXT, container_path TEXT, audio_json TEXT, image_json TEXT);
CREATE INDEX IF NOT EXISTS idx_files_ext_size ON files(ext, size);
CREATE INDEX IF NOT EXISTS idx_files_blake3 ON files(blake3);
-- A volume delete is a cascade over files. The partial unique indexes below
-- only cover disk rows or container rows; this one lets SQLite find both in
-- one range scan (100k rows: ~3.6 s -> ~1.0 s on the development machine).
CREATE INDEX IF NOT EXISTS idx_files_volume ON files(volume_id);
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(name, ext, content='', contentless_delete=1, tokenize='unicode61');
DROP TRIGGER IF EXISTS files_ai;
CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN INSERT INTO files_fts(rowid, name, ext) VALUES (new.id, new.name, new.ext); END;
DROP TRIGGER IF EXISTS files_ad;
CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN DELETE FROM files_fts WHERE rowid = old.id; END;
DROP TRIGGER IF EXISTS files_au;
CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN DELETE FROM files_fts WHERE rowid = old.id; INSERT INTO files_fts(rowid, name, ext) VALUES (new.id, new.name, new.ext); END;
CREATE TABLE IF NOT EXISTS thumbs(file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE, webp128 BLOB);
-- Etiquetas libres para archivos y carpetas. El nombre es único sin distinguir
-- mayúsculas: "Playa" y "playa" son la misma etiqueta. Una etiqueta de carpeta
-- se hereda por todo su subárbol al buscar, pero no se duplica en cada fila.
CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS file_tags(file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(file_id, tag_id));
CREATE TABLE IF NOT EXISTS dir_tags(dir_id INTEGER NOT NULL REFERENCES dirs(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(dir_id, tag_id));
CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_dir_tags_tag ON dir_tags(tag_id);
CREATE TABLE IF NOT EXISTS scan_errors(id INTEGER PRIMARY KEY, volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE, path TEXT NOT NULL, reason TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_scan_errors_volume ON scan_errors(volume_id);
-- One row per scan attempt. The app can be killed at any moment (or the
-- machine suspended mid-scan), so the next start must be able to say where the
-- last one stopped and offer to continue. `heartbeat_at` is what separates a
-- live scan from a dead one: no running loop stays quiet for long.
CREATE TABLE IF NOT EXISTS scan_runs(id INTEGER PRIMARY KEY, volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE, root TEXT NOT NULL, state TEXT NOT NULL, phase TEXT NOT NULL, files_seen INTEGER NOT NULL DEFAULT 0, bytes_seen INTEGER NOT NULL DEFAULT 0, files_total INTEGER, bytes_total INTEGER, current_path TEXT, error_count INTEGER NOT NULL DEFAULT 0, error TEXT, started_at INTEGER NOT NULL, heartbeat_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_scan_runs_started ON scan_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_runs_volume ON scan_runs(volume_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dirs_vol_pathhash ON dirs(volume_id, path_hash);
-- Name uniqueness is per folder for files on disk, and per folder+archive for
-- entries inside a container: the same `readme.txt` can live on disk and in
-- two different ZIPs of the same folder. Dropped unconditionally so catalogs
-- created before archives were indexed get migrated on open.
DROP INDEX IF EXISTS idx_files_vol_dir_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_vol_dir_name_disk ON files(volume_id, dir_id, name) WHERE container_path IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_vol_dir_name_cont ON files(volume_id, dir_id, name, container_path) WHERE container_path IS NOT NULL;
