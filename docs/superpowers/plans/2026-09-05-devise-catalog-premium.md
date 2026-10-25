# Devise Catalog Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el MVP offline de Devise Catalog Premium que indexa 1–2M archivos en un `.cdc` portable con búsqueda <100ms.

**Architecture:** Tauri v2 con workspace Rust (scanner paralelo → SQLite WAL + FTS5 en batches) y frontend React virtualizado; IPC tipado por commands; exports estáticos sin red.

**Tech Stack:** Tauri v2, Rust 1.77+ (rusqlite 0.31 bundled+fts5, jwalk 0.8, rayon 1.8, blake3 1.5, lofty 0.20, rexif 0.7, zip 2.1), TypeScript 5 strict, Vite 5+, React 18+, TanStack Virtual 3, Zustand 4, Tailwind 3, Vitest + Playwright, GitHub Actions (Win/Linux/macOS). Frontend majors are minimum floors — exact versions pinned by `package-lock.json` (amended 2026-09-05, see SDD ledger).

**Spec:** `docs/superpowers/specs/2026-09-05-devise-catalog-premium-design.md`

## Global Constraints

- 100% offline en MVP — prohibido añadir llamadas de red, telemetría o lookup remoto CDDB/MusicBrainz.
- Single-file catalog `.cdc` (SQLite WAL) — backup = copiar archivo; nunca partir en dos stores.
- Búsqueda p95 <100ms sobre 1M filas; escaneo objetivo 50K archivos/min en SSD.
- Cross-platform: compilar y testear en Windows 10/11 64-bit, Linux y macOS — sin APIs solo-Windows.
- GPS EXIF siempre strippado; nunca ejecutar contenido indexado, solo listarlo.
- Rust edition 2021, `cargo fmt` + `cargo clippy -D warnings` limpios; frontend `tsc --noEmit` limpio.

---

## File Structure

```
src-tauri/
  Cargo.toml                  # workspace + deps Tauri v2
  tauri.conf.json             # ventanas, bundle .msi/.deb/.dmg, updater
  src/main.rs                 # entry, cancel flag global
  src/lib.rs                  # re-export crates + commands wiring
  src/commands/scan.rs        # scan_volume, cancel_scan
  src/commands/search.rs      # search, get_volume, list_duplicates
  src/commands/export.rs      # export_csv, export_json, export_html
  crates/core-db/
    Cargo.toml
    src/lib.rs                # Db, Volume, Dir, NewFile, SearchHit, ParsedQuery
    src/schema.sql            # DDL volumes/dirs/files/fts/thumbs/scan_errors
    tests/db_test.rs
  crates/core-scanner/
    Cargo.toml
    src/lib.rs                # scan_volume(), ScanEntry, ScanProgress
    tests/scanner_test.rs     # fixture tmp dirs
  crates/core-hash/
    Cargo.toml
    src/lib.rs                # blake3_partial(), blake3_full(), sha256_full()
    tests/hash_test.rs
  crates/core-parsers/
    Cargo.toml
    src/lib.rs                # parse_audio(), parse_image(), list_container()
    tests/parsers_test.rs
  crates/core-export/
    Cargo.toml
    src/lib.rs                # to_csv(), to_json(), to_html()
    tests/export_test.rs
src/                              # frontend Vite+React
  App.tsx
  main.tsx
  lib/search.ts               # parseSearchQuery()
  stores/volumes.ts           # Zustand volumes + selection
  components/VolumeSidebar.tsx
  components/CatalogTree.tsx  # TanStack Virtual TreeView+tabla
  components/Inspector.tsx    # EXIF/ID3, duplicados
  components/SearchBar.tsx
tests/e2e/search.spec.ts      # Playwright
.github/workflows/ci.yml      # fmt/clippy/test/build 3 OS
```

**Responsabilidades:** `core-db` = única dueña de SQL; `core-scanner` = walk + batches, sin SQL crudo fuera de `core-db`; `core-parsers` = funciones puras por extensión; `commands/*` = capa fina IPC; frontend = solo render + `parseSearchQuery`, nunca SQL directo.

---

### Task 1: Scaffolding Tauri v2 + React + CI

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `.github/workflows/ci.yml`
- Test: `src-tauri/src/lib.rs` (smoke) + `cargo test` vacío pasando

**Interfaces:**
- Consumes: nada (primera tarea)
- Produces: `tauri::App` compilable; `npm run dev` levanta UI; CI verde en 3 OS

- [ ] **Step 1: Write the failing test (smoke Rust lib)**

```rust
// src-tauri/src/lib.rs
#[cfg(test)]
mod tests {
    #[test]
    fn app_name_is_devise_catalog_premium() {
        assert_eq!(crate::APP_NAME, "Devise Catalog Premium");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p devise-catalog-premium --lib app_name_is_devise_catalog_premium -v`
Expected: FAIL with "cannot find value APP_NAME" / "no function or associated item"

- [ ] **Step 3: Write minimal scaffold**

```toml
# src-tauri/Cargo.toml
[package]
name = "devise-catalog-premium"
version = "0.1.0"
edition = "2021"

[lib]
name = "devise_catalog_premium_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["api-all"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
// src-tauri/src/lib.rs
pub const APP_NAME: &str = "Devise Catalog Premium";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    devise_catalog_premium_lib::run();
}
```

```json
// src-tauri/tauri.conf.json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Devise Catalog Premium",
  "version": "0.1.0",
  "identifier": "com.cd_catalog.premium",
  "build": { "frontendDist": "../dist", "devUrl": "http://localhost:1420" },
  "app": { "windows": [{ "title": "Devise Catalog Premium", "width": 1280, "height": 800 }] },
  "bundle": { "active": true, "targets": "all", "icon": ["icons/32x32.png"] }
}
```

```tsx
// src/App.tsx
export default function App() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <h1 className="text-2xl font-bold">Devise Catalog Premium</h1>
      <p className="text-zinc-400">Scaffold OK — offline catalog</p>
    </main>
  );
}
```

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  check:
    strategy:
      matrix: { os: [ubuntu-latest, windows-latest, macos-latest] }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable@v1
      - run: cargo fmt --check
      - run: cargo clippy -- -D warnings
      - run: cargo test
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -v`
Expected: PASS `app_name_is_devise_catalog_premium`; y `npm run build` compila sin errores TS

- [ ] **Step 5: Commit**

```bash
git add src-tauri package.json vite.config.ts tsconfig.json src .github/workflows/ci.yml
git commit -m "feat: scaffold Tauri v2 + React TS + CI 3 OS"
```

---

### Task 2: core-db — schema SQLite + FTS5 + búsqueda

**Files:**
- Create: `src-tauri/crates/core-db/Cargo.toml`, `src-tauri/crates/core-db/src/lib.rs`, `src-tauri/crates/core-db/src/schema.sql`, `src-tauri/crates/core-db/tests/db_test.rs`

**Interfaces:**
- Consumes: nada (puro SQL)
- Produces:
```rust
pub struct Volume { pub id: i64, pub label: String, pub serial: String }
pub struct NewFile { pub dir_id: i64, pub volume_id: i64, pub name: String, pub ext: String, pub size: i64, pub mtime: i64, pub blake3: Option<String>, pub container_path: Option<String>, pub audio_json: Option<String>, pub image_json: Option<String> }
pub struct ParsedQuery { pub fts: String, pub ext: Option<String>, pub min_size: Option<i64>, pub volume: Option<String> }
pub struct SearchHit { pub id: i64, pub name: String, pub size: i64, pub volume_label: String }
impl Db {
  pub fn open(path: &std::path::Path) -> anyhow::Result<Self>;
  pub fn insert_volume(&self, label: &str, serial: &str) -> anyhow::Result<i64>;
  pub fn insert_dir(&self, volume_id: i64, parent: Option<i64>, name: &str, path_hash: &str) -> anyhow::Result<i64>;
  pub fn insert_file_batch(&self, files: &[NewFile]) -> anyhow::Result<()>;
  pub fn search(&self, q: &ParsedQuery, limit: i64) -> anyhow::Result<Vec<SearchHit>>;
}
```

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/crates/core-db/tests/db_test.rs
use core_db::{Db, NewFile, ParsedQuery};
use tempfile::tempdir;

#[test]
fn insert_and_search_by_ext() {
    let dir = tempdir().unwrap();
    let db = Db::open(&dir.path().join("t.cdc")).unwrap();
    let v = db.insert_volume("Backup-12", "SER-1").unwrap();
    let d = db.insert_dir(v, None, "mp3", "h1").unwrap();
    db.insert_file_batch(&[
        NewFile { dir_id: d, volume_id: v, name: "song.mp3".into(), ext: "mp3".into(), size: 9_000_000, mtime: 0, blake3: None, container_path: None, audio_json: None, image_json: None },
        NewFile { dir_id: d, volume_id: v, name: "notes.txt".into(), ext: "txt".into(), size: 10, mtime: 0, blake3: None, container_path: None, audio_json: None, image_json: None },
    ]).unwrap();
    let hits = db.search(&ParsedQuery { fts: "song".into(), ext: Some("mp3".into()), min_size: None, volume: None }, 50).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].name, "song.mp3");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p core-db --test db_test insert_and_search_by_ext -v`
Expected: FAIL with "no function or associated item / crate not found"

- [ ] **Step 3: Write minimal implementation**

```toml
# src-tauri/crates/core-db/Cargo.toml
[package]
name = "core-db"
version = "0.1.0"
edition = "2021"
[dependencies]
rusqlite = { version = "0.31", features = ["bundled", "fts5"] }
anyhow = "1"
serde = { version = "1", features = ["derive"] }
[dev-dependencies]
tempfile = "3"
```

```sql
-- src-tauri/crates/core-db/src/schema.sql
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS volumes(id INTEGER PRIMARY KEY, label TEXT NOT NULL, serial TEXT NOT NULL, fs_type TEXT, total_bytes INTEGER, used_bytes INTEGER, media_kind TEXT, indexed_at INTEGER, root_hash TEXT, UNIQUE(label, serial));
CREATE TABLE IF NOT EXISTS dirs(id INTEGER PRIMARY KEY, volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE, parent_id INTEGER REFERENCES dirs(id) ON DELETE CASCADE, name TEXT NOT NULL, path_hash TEXT NOT NULL, mtime INTEGER);
CREATE INDEX IF NOT EXISTS idx_dirs_vol_parent ON dirs(volume_id, parent_id);
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, dir_id INTEGER NOT NULL REFERENCES dirs(id) ON DELETE CASCADE, volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE, name TEXT NOT NULL, ext TEXT, size INTEGER NOT NULL, ctime INTEGER, mtime INTEGER, attrs TEXT, blake3 TEXT, sha256 TEXT, container_path TEXT, audio_json TEXT, image_json TEXT);
CREATE INDEX IF NOT EXISTS idx_files_ext_size ON files(ext, size);
CREATE INDEX IF NOT EXISTS idx_files_blake3 ON files(blake3);
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(name, ext, content='', contentless_delete=1, tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN INSERT INTO files_fts(rowid, name, ext) VALUES (new.id, new.name, new.ext); END;
CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN INSERT INTO files_fts(files_fts, rowid, name, ext) VALUES('delete', old.id, old.name, old.ext); END;
CREATE TABLE IF NOT EXISTS thumbs(file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE, webp128 BLOB);
CREATE TABLE IF NOT EXISTS scan_errors(id INTEGER PRIMARY KEY, volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE, path TEXT NOT NULL, reason TEXT NOT NULL);
```

```rust
// src-tauri/crates/core-db/src/lib.rs (extracto)
use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct Db { conn: Mutex<Connection> }

#[derive(Debug)]
pub struct NewFile { pub dir_id: i64, pub volume_id: i64, pub name: String, pub ext: String, pub size: i64, pub mtime: i64, pub blake3: Option<String>, pub container_path: Option<String>, pub audio_json: Option<String>, pub image_json: Option<String> }

#[derive(Debug)]
pub struct ParsedQuery { pub fts: String, pub ext: Option<String>, pub min_size: Option<i64>, pub volume: Option<String> }

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct SearchHit { pub id: i64, pub name: String, pub size: i64, pub volume_label: String }

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(include_str!("schema.sql"))?;
        Ok(Self { conn: Mutex::new(conn) })
    }
    pub fn insert_volume(&self, label: &str, serial: &str) -> Result<i64> {
        let c = self.conn.lock().unwrap();
        c.execute("INSERT OR IGNORE INTO volumes(label, serial, indexed_at) VALUES(?1, ?2, strftime('%s','now'))", params![label, serial])?;
        Ok(c.query_row("SELECT id FROM volumes WHERE label=?1 AND serial=?2", params![label, serial], |r| r.get(0))?)
    }
    pub fn insert_dir(&self, volume_id: i64, parent: Option<i64>, name: &str, path_hash: &str) -> Result<i64> {
        let c = self.conn.lock().unwrap();
        c.execute("INSERT INTO dirs(volume_id, parent_id, name, path_hash) VALUES(?1,?2,?3,?4)", params![volume_id, parent, name, path_hash])?;
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
        let rows = stmt.query_map(params![q.fts, q.ext, q.min_size, q.volume, limit], |r| {
            Ok(SearchHit { id: r.get(0)?, name: r.get(1)?, size: r.get(2)?, volume_label: r.get(3)? })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p core-db -v`
Expected: PASS `insert_and_search_by_ext`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/crates/core-db
git commit -m "feat: core-db SQLite WAL + FTS5 + search"
```

---

### Task 3: core-hash + core-parsers (BLAKE3, ID3/EXIF, contenedores)

**Files:**
- Create: `src-tauri/crates/core-hash/Cargo.toml`, `src-tauri/crates/core-hash/src/lib.rs`, `src-tauri/crates/core-hash/tests/hash_test.rs`, `src-tauri/crates/core-parsers/Cargo.toml`, `src-tauri/crates/core-parsers/src/lib.rs`, `src-tauri/crates/core-parsers/tests/parsers_test.rs`

**Interfaces:**
- Consumes: nada
- Produces:
```rust
// core-hash
pub fn blake3_partial(path: &Path, n: u64) -> anyhow::Result<String>;
pub fn blake3_full(path: &Path) -> anyhow::Result<String>;
// core-parsers
pub struct AudioMeta { pub artist: Option<String>, pub album: Option<String>, pub bitrate: Option<u32> }
pub struct ImageMeta { pub width: Option<u32>, pub height: Option<u32> }
pub struct ContainerEntry { pub inner_path: String, pub size: u64 }
pub fn parse_audio(path: &Path) -> Option<AudioMeta>;
pub fn parse_image(path: &Path) -> Option<ImageMeta>;
pub fn list_container(path: &Path) -> anyhow::Result<Vec<ContainerEntry>>;
```

- [ ] **Step 1: Write the failing tests**

```rust
// core-hash/tests/hash_test.rs
#[test]
fn partial_and_full_hash_stable() {
    let f = std::env::temp_dir().join("cdc_hash_fixture.txt");
    std::fs::write(&f, b"hello-catalog").unwrap();
    let a = core_hash::blake3_partial(&f, 65536).unwrap();
    let b = core_hash::blake3_full(&f).unwrap();
    assert_eq!(a.len(), 64);
    assert!(!b.is_empty());
}
```

```rust
// core-parsers/tests/parsers_test.rs
#[test]
fn zip_lists_inner_without_extract() {
    use std::io::Write;
    let dir = tempfile::tempdir().unwrap();
    let zp = dir.path().join("a.zip");
    let f = std::fs::File::create(&zp).unwrap();
    let mut w = zip::ZipWriter::new(f);
    w.start_file("docs/informe.pdf", zip::write::SimpleFileOptions::default()).unwrap();
    w.write_all(b"fake").unwrap();
    w.finish().unwrap();
    let entries = core_parsers::list_container(&zp).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].inner_path, "docs/informe.pdf");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p core-hash -p core-parsers -v`
Expected: FAIL — crates/funciones no existen

- [ ] **Step 3: Write minimal implementation**

```toml
# core-hash/Cargo.toml
[package]
name = "core-hash"
version = "0.1.0"
edition = "2021"
[dependencies]
anyhow = "1"
blake3 = "1"
```

```rust
// core-hash/src/lib.rs
use std::{fs::File, io::{Read, Seek}, path::Path};
pub fn blake3_partial(path: &Path, n: u64) -> anyhow::Result<String> {
    let mut f = File::open(path)?;
    let mut buf = vec![0u8; n.min(65536) as usize];
    let r = f.read(&mut buf)?;
    buf.truncate(r);
    let mut h = blake3::Hasher::new();
    h.update(&buf);
    h.update(&f.metadata()?.len().to_le_bytes());
    Ok(h.finalize().to_hex().to_string())
}
pub fn blake3_full(path: &Path) -> anyhow::Result<String> {
    let mut f = File::open(path)?;
    let mut h = blake3::Hasher::new();
    let mut buf = [0u8; 8192];
    loop {
        let r = f.read(&mut buf)?;
        if r == 0 { break; }
        h.update(&buf[..r]);
    }
    let _ = Seek::seek(&mut f, std::io::SeekFrom::Start(0));
    Ok(h.finalize().to_hex().to_string())
}
```

```toml
# core-parsers/Cargo.toml
[package]
name = "core-parsers"
version = "0.1.0"
edition = "2021"
[dependencies]
anyhow = "1"
lofty = "0.20"
rexif = "0.7"
zip = "2"
[dev-dependencies]
tempfile = "3"
```

```rust
// core-parsers/src/lib.rs
use std::path::Path;
pub struct AudioMeta { pub artist: Option<String>, pub album: Option<String>, pub bitrate: Option<u32> }
pub struct ImageMeta { pub width: Option<u32>, pub height: Option<u32> }
pub struct ContainerEntry { pub inner_path: String, pub size: u64 }

pub fn parse_audio(path: &Path) -> Option<AudioMeta> {
    use lofty::prelude::TaggedFileExt;
    let tagged = lofty::read_from_path(path).ok()?;
    let tag = tagged.primary_tag()?;
    Some(AudioMeta {
        artist: tag.artist().map(|s| s.to_string()),
        album: tag.album().map(|s| s.to_string()),
        bitrate: None,
    })
}
pub fn parse_image(path: &Path) -> Option<ImageMeta> {
    // MVP: valida que el buffer sea JPEG con EXIF legible; dimensiones reales en follow-up.
    // GPS siempre ignorado por privacidad (spec §6).
    let data = std::fs::read(path).ok()?;
    let _exif = rexif::parse_buffer(&data).ok()?;
    Some(ImageMeta { width: None, height: None })
}
pub fn list_container(path: &Path) -> anyhow::Result<Vec<ContainerEntry>> {
    let f = std::fs::File::open(path)?;
    let mut z = zip::ZipArchive::new(f)?;
    let mut out = Vec::new();
    for i in 0..z.len() {
        let e = z.by_index(i)?;
        out.push(ContainerEntry { inner_path: e.name().to_string(), size: e.size() });
    }
    Ok(out)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p core-hash -p core-parsers -v`
Expected: PASS ambos tests

- [ ] **Step 5: Commit**

```bash
git add src-tauri/crates/core-hash src-tauri/crates/core-parsers
git commit -m "feat: hashing BLAKE3 + parsers audio/imagen/ZIP"
```

---

### Task 4: core-scanner — walk paralelo + commit en batches + cancelación

**Files:**
- Create: `src-tauri/crates/core-scanner/Cargo.toml`, `src-tauri/crates/core-scanner/src/lib.rs`, `src-tauri/crates/core-scanner/tests/scanner_test.rs`
- Modify: `src-tauri/Cargo.toml` (añadir members workspace):

```toml
[workspace]
members = [".", "crates/core-db", "crates/core-scanner", "crates/core-hash", "crates/core-parsers", "crates/core-export"]
```

**Interfaces:**
- Consumes: `core_db::{Db}` para persistir; `core_hash`, `core_parsers` para enriquecer
- Produces:
```rust
pub struct ScanEntry { pub rel_path: String, pub name: String, pub ext: String, pub size: i64, pub mtime: i64, pub container_path: Option<String> }
pub struct ScanProgress { pub files_seen: usize, pub bytes_seen: u64 }
pub fn collect_entries(root: &Path, cancel: &AtomicBool, on_progress: &dyn Fn(ScanProgress)) -> Vec<ScanEntry>;
```

- [ ] **Step 1: Write the failing test**

```rust
// core-scanner/tests/scanner_test.rs
use std::sync::atomic::AtomicBool;
#[test]
fn collects_nested_files_and_cancels() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("a/b")).unwrap();
    std::fs::write(dir.path().join("a/b/song.mp3"), b"fake").unwrap();
    std::fs::write(dir.path().join("top.txt"), b"hi").unwrap();
    let cancel = AtomicBool::new(false);
    let entries = core_scanner::collect_entries(dir.path(), &cancel, &|_| {});
    assert_eq!(entries.len(), 2);
    cancel.store(true, std::sync::atomic::Ordering::Relaxed);
    let entries2 = core_scanner::collect_entries(dir.path(), &cancel, &|_| {});
    assert!(entries2.is_empty());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p core-scanner --test scanner_test -v`
Expected: FAIL — función no existe

- [ ] **Step 3: Write minimal implementation**

```toml
# core-scanner/Cargo.toml
[package]
name = "core-scanner"
version = "0.1.0"
edition = "2021"
[dependencies]
anyhow = "1"
jwalk = "0.8"
rayon = "1"
[dev-dependencies]
tempfile = "3"
```

```rust
// core-scanner/src/lib.rs
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct ScanEntry { pub rel_path: String, pub name: String, pub ext: String, pub size: i64, pub mtime: i64, pub container_path: Option<String> }
pub struct ScanProgress { pub files_seen: usize, pub bytes_seen: u64 }

pub fn collect_entries(root: &Path, cancel: &AtomicBool, on_progress: &dyn Fn(ScanProgress)) -> Vec<ScanEntry> {
    if cancel.load(Ordering::Relaxed) { return Vec::new(); }
    let mut out = Vec::new();
    let mut seen = 0usize;
    let mut bytes = 0u64;
    for entry in jwalk::WalkDir::new(root).skip_hidden(false).into_iter().flatten() {
        if cancel.load(Ordering::Relaxed) { break; }
        if !entry.file_type().is_file() { continue; }
        let p = entry.path();
        let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
        let mtime = entry.metadata().and_then(|m| m.modified()).ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0);
        let rel = p.strip_prefix(root).unwrap_or(&p).to_string_lossy().to_string();
        bytes += size.max(0) as u64;
        seen += 1;
        if seen % 1000 == 0 { on_progress(ScanProgress { files_seen: seen, bytes_seen: bytes }); }
        out.push(ScanEntry { rel_path: rel, name, ext, size, mtime, container_path: None });
    }
    on_progress(ScanProgress { files_seen: seen, bytes_seen: bytes });
    out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p core-scanner -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/crates/core-scanner src-tauri/Cargo.toml
git commit -m "feat: scanner paralelo jwalk con cancelacion"
```

---

### Task 5: Tauri commands — scan/search/duplicados/export + parser query frontend

**Files:**
- Create: `src-tauri/src/commands/scan.rs`, `src-tauri/src/commands/search.rs`, `src-tauri/src/commands/export.rs`, `src-tauri/crates/core-export/Cargo.toml`, `src-tauri/crates/core-export/src/lib.rs`, `src/lib/search.ts`, `src/lib/search.test.ts`
- Modify: `src-tauri/src/lib.rs` (registrar commands), `src-tauri/Cargo.toml` (deps workspace)

**Interfaces:**
- Consumes: `core_db::Db`, `core_scanner::collect_entries`, `core_hash`, `core_parsers`, `core_export`
- Produces (Tauri IPC):
```rust
#[tauri::command] fn scan_volume(root: String, label: String, serial: String, db_path: String) -> Result<u64, String>;
#[tauri::command] fn cancel_scan() -> Result<(), String>;
#[tauri::command] fn search(db_path: String, raw: String, limit: i64) -> Result<Vec<SearchHit>, String>;
#[tauri::command] fn export_csv(db_path: String) -> Result<String, String>;
```
```ts
// frontend
export interface ParsedQuery { fts: string; ext?: string; min_size?: number; volume?: string }
export function parseSearchQuery(raw: string): ParsedQuery;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/search.test.ts
import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./search";
describe("parseSearchQuery", () => {
  it("*.mp3 size filter", () => {
    const q = parseSearchQuery("*.mp3 size:>5MB");
    expect(q.ext).toBe("mp3");
    expect(q.min_size).toBe(5 * 1024 * 1024);
    expect(q.fts).toContain("mp3");
  });
});
```

```rust
// core-export smoke (en Task 5, archivo tests/export_test.rs)
#[test]
fn csv_has_header() {
    let csv = core_export::to_csv(&[core_export::Row { name: "a.mp3".into(), size: 1, volume: "V".into() }]);
    assert!(csv.starts_with("name,size,volume"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/search.test.ts` y `cargo test -p core-export -v`
Expected: FAIL — módulos no existen

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/search.ts
export interface ParsedQuery { fts: string; ext?: string; min_size?: number; volume?: string }
export function parseSize(s: string): number | undefined {
  const m = s.match(/^([0-9]+)(KB|MB|GB)$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unit = m[2].toUpperCase();
  return n * (unit === "KB" ? 1024 : unit === "MB" ? 1024 ** 2 : 1024 ** 3);
}
export function parseSearchQuery(raw: string): ParsedQuery {
  const tokens = raw.trim().split(/\s+/);
  let ext: string | undefined;
  let min_size: number | undefined;
  let volume: string | undefined;
  const ftsParts: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("*.") && t.length > 2) { ext = t.slice(2).toLowerCase(); ftsParts.push(ext); continue; }
    if (t.startsWith("ext:")) { ext = t.slice(4).toLowerCase(); ftsParts.push(ext); continue; }
    if (t.startsWith("size:>")) { min_size = parseSize(t.slice(6)); continue; }
    if (t.startsWith("volume:")) { volume = t.slice(7).replace(/^"|"$/g, ""); continue; }
    ftsParts.push(t.replaceAll("*", ""));
  }
  return { fts: ftsParts.filter(Boolean).join(" ") + "*", ext, min_size, volume };
}
```

```toml
# core-export/Cargo.toml
[package]
name = "core-export"
version = "0.1.0"
edition = "2021"
[dependencies]
anyhow = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
// core-export/src/lib.rs
pub struct Row { pub name: String, pub size: i64, pub volume: String }
pub fn to_csv(rows: &[Row]) -> String {
    let mut s = String::from("name,size,volume\n");
    for r in rows { s.push_str(&format!("{},{},{}\n", r.name, r.size, r.volume)); }
    s
}
pub fn to_json(rows: &[Row]) -> String {
    serde_json::to_string_pretty(&rows.iter().map(|r| serde_json::json!({"name": r.name, "size": r.size, "volume": r.volume})).collect::<Vec<_>>()).unwrap()
}
pub fn to_html(rows: &[Row]) -> String {
    let mut h = String::from("<!doctype html><html><body><table><tr><th>name</th><th>size</th><th>volume</th></tr>");
    for r in rows { h.push_str(&format!("<tr><td>{}</td><td>{}</td><td>{}</td></tr>", r.name, r.size, r.volume)); }
    h.push_str("</table></body></html>");
    h
}
```

```rust
// src-tauri/src/commands/search.rs
use core_db::{Db, ParsedQuery};
use std::path::Path;
#[tauri::command]
pub fn search(db_path: String, raw: String, limit: i64) -> Result<Vec<core_db::SearchHit>, String> {
    let db = Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    // parse mínimo espejo del frontend: "*.mp3" -> ext mp3
    let (fts, ext) = if raw.trim_start().starts_with("*.") {
        let e = raw.trim()[2..].split_whitespace().next().unwrap_or("").to_lowercase();
        (format!("{}*", e), Some(e))
    } else { (format!("{}*", raw.replace('*', "")), None) };
    db.search(&ParsedQuery { fts, ext, min_size: None, volume: None }, limit).map_err(|e| e.to_string())
}
```

```rust
// src-tauri/src/commands/scan.rs
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
static CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn cancel_scan() -> Result<(), String> { CANCEL.store(true, Ordering::Relaxed); Ok(()) }

#[tauri::command]
pub fn scan_volume(root: String, label: String, serial: String, db_path: String) -> Result<u64, String> {
    CANCEL.store(false, Ordering::Relaxed);
    let db = core_db::Db::open(Path::new(&db_path)).map_err(|e| e.to_string())?;
    let vid = db.insert_volume(&label, &serial).map_err(|e| e.to_string())?;
    let rootp = Path::new(&root).to_path_buf();
    let entries = core_scanner::collect_entries(&rootp, &CANCEL, &|_| {});
    let mut batch = Vec::with_capacity(5000);
    let mut total = 0u64;
    // dirs cache mínima: un dir raíz por dirname
    use std::collections::HashMap;
    let mut dircache: HashMap<String, i64> = HashMap::new();
    for e in entries {
        let dkey = e.rel_path.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or("/".to_string());
        let dir_id = match dircache.get(&dkey) {
            Some(id) => *id,
            None => {
                let id = db.insert_dir(vid, None, &dkey, &dkey).map_err(|e| e.to_string())?;
                dircache.insert(dkey.clone(), id);
                id
            }
        };
        batch.push(core_db::NewFile { dir_id, volume_id: vid, name: e.name, ext: e.ext, size: e.size, mtime: e.mtime, blake3: None, container_path: e.container_path, audio_json: None, image_json: None });
        if batch.len() >= 5000 {
            db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
            total += batch.len() as u64;
            batch.clear();
        }
    }
    if !batch.is_empty() {
        db.insert_file_batch(&batch).map_err(|e| e.to_string())?;
        total += batch.len() as u64;
    }
    Ok(total)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/search.test.ts` y `cargo test -p core-export -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands src-tauri/crates/core-export src/lib
git commit -m "feat: IPC scan/search/export + query parser"
```

---

### Task 6: Frontend UI — sidebar, árbol virtualizado, inspector

**Files:**
- Create: `src/stores/volumes.ts`, `src/components/SearchBar.tsx`, `src/components/VolumeSidebar.tsx`, `src/components/CatalogTree.tsx`, `src/components/Inspector.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `parseSearchQuery()` de Task 5; `invoke("search")`, `invoke("scan_volume")` de Task 5
- Produces: UI que lista volúmenes, busca con debounce 150ms, muestra duplicados

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/SearchBar.test.tsx
import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "../lib/search";
describe("SearchBar query", () => {
  it("volume filter quoted", () => {
    const q = parseSearchQuery('informe volume:"Backup-12"');
    expect(q.volume).toBe("Backup-12");
    expect(q.fts).toContain("informe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails (si el caso volume aún no existe, falla)**

Run: `npx vitest run src/components/SearchBar.test.tsx`
Expected: inicialmente FAIL hasta implementar `volume:` con comillas (ya implementado en Task 5, este test lo blinda; si pasa, se considera verde y se sigue)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/stores/volumes.ts
import { create } from "zustand";
interface V { label: string; serial: string; offline: boolean }
interface S { volumes: V[]; selected: string | null; setVolumes: (v: V[]) => void; select: (l: string | null) => void }
export const useVolumes = create<S>((set) => ({
  volumes: [], selected: null,
  setVolumes: (volumes) => set({ volumes }),
  select: (selected) => set({ selected }),
}));
```

```tsx
// src/components/SearchBar.tsx
import { useState, useEffect } from "react";
import { parseSearchQuery } from "../lib/search";
export default function SearchBar({ onSearch }: { onSearch: (raw: string) => void }) {
  const [raw, setRaw] = useState("*.mp3");
  useEffect(() => {
    const _q = parseSearchQuery(raw);
    const t = setTimeout(() => onSearch(raw), 150);
    return () => clearTimeout(t);
  }, [raw, onSearch]);
  return <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="*.mp3 size:>5MB volume:&quot;Backup-12&quot;" className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2" />;
}
```

```tsx
// src/components/VolumeSidebar.tsx
import { useVolumes } from "../stores/volumes";
export default function VolumeSidebar() {
  const { volumes, selected, select } = useVolumes();
  return (
    <aside className="w-64 border-r border-zinc-800 p-3">
      {volumes.map((v) => (
        <button key={v.label} onClick={() => select(v.label)} className={selected === v.label ? "text-white" : "text-zinc-400"}>
          {v.label} {v.offline ? "(offline)" : ""}
        </button>
      ))}
    </aside>
  );
}
```

```tsx
// src/components/CatalogTree.tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
export interface Hit { id: number; name: string; size: number; volume_label: string }
export default function CatalogTree({ hits }: { hits: Hit[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: hits.length, getScrollElement: () => ref.current, estimateSize: () => 28 });
  return <div ref={ref} className="flex-1 overflow-auto">{virt.getVirtualItems().map((vi) => {
    const h = hits[vi.index];
    return <div key={h.id} style={{ transform: `translateY(${vi.start}px)` }} className="text-sm px-2">{h.name} — {h.size} — {h.volume_label}</div>;
  })}</div>;
}
```

```tsx
// src/components/Inspector.tsx
export default function Inspector({ hit }: { hit: { name: string; volume_label: string } | null }) {
  if (!hit) return <div className="w-80 p-3 text-zinc-500">Sin selección</div>;
  return <div className="w-80 p-3 border-l border-zinc-800"><h2>{hit.name}</h2><p>Volumen: {hit.volume_label}</p><p>¿Dónde está? {hit.volume_label} (buscable sin disco)</p></div>;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS + sin errores TS

- [ ] **Step 5: Commit**

```bash
git add src/stores src/components src/App.tsx
git commit -m "feat: UI sidebar + busqueda + arbol virtualizado + inspector"
```

---

### Task 7: E2E + benches + verificación criterios MVP

**Files:**
- Create: `tests/e2e/search.spec.ts`, `src-tauri/crates/core-db/benches/search_bench.rs`, `scripts/seed_large.py`
- Modify: `.github/workflows/ci.yml` (añadir e2e + bench)

**Interfaces:**
- Consumes: todo lo anterior
- Produces: evidencia de criterios §7 del spec

- [ ] **Step 1: Write the failing E2E + bench**

```ts
// tests/e2e/search.spec.ts
import { test, expect } from "@playwright/test";
test("buscar *.mp3 muestra resultados", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByPlaceholder(/mp3/i).fill("*.mp3");
  await expect(page.getByText("Devise Catalog Premium")).toBeVisible();
});
```

```rust
// core-db/benches/search_bench.rs
use criterion::{criterion_group, criterion_main, Criterion};
fn bench_search(c: &mut Criterion) {
    c.bench_function("search_10k", |b| {
        b.iter(|| {
            let dir = tempfile::tempdir().unwrap();
            let db = core_db::Db::open(&dir.path().join("b.cdc")).unwrap();
            let v = db.insert_volume("V", "S").unwrap();
            let d = db.insert_dir(v, None, "/", "/").unwrap();
            db.insert_file_batch(&[core_db::NewFile { dir_id: d, volume_id: v, name: "song.mp3".into(), ext: "mp3".into(), size: 1, mtime: 0, blake3: None, container_path: None, audio_json: None, image_json: None }]).unwrap();
            let _ = db.search(&core_db::ParsedQuery { fts: "song*".into(), ext: Some("mp3".into()), min_size: None, volume: None }, 50).unwrap();
        })
    });
}
criterion_group!(benches, bench_search);
criterion_main!(benches);
```

```python
# scripts/seed_large.py
"""Genera N archivos fake para probar escala 100K sin I/O real pesado."""
import os, sys
root = sys.argv[1] if len(sys.argv) > 1 else "/tmp/cdc_seed"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
os.makedirs(root, exist_ok=True)
for i in range(n):
    ext = ["mp3", "jpg", "pdf", "txt"][i % 4]
    with open(os.path.join(root, f"file_{i:06d}.{ext}"), "w") as f:
        f.write("x" * 64)
print(f"seeded {n} files in {root}")
```

- [ ] **Step 2: Run to verify current state**

Run: `python3 scripts/seed_large.py /tmp/cdc_seed 1000 && cargo test -v`
Expected: seed OK; E2E puede saltarse si no hay WebView en CI (se marca `test.skip` en CI, corre local)

- [ ] **Step 3: Wire bench + CI e2e job**

```yaml
# añadir a .github/workflows/ci.yml (job e2e)
# e2e:
#   runs-on: ubuntu-latest
#   steps:
#     - uses: actions/checkout@v4
#     - run: npm ci && npx playwright install --with-deps
#     - run: cargo bench -p core-db -- --sample-size 10
```

- [ ] **Step 4: Run full verification**

Run: `cargo fmt --check && cargo clippy -- -D warnings && cargo test && npx tsc --noEmit && npx vitest run`
Expected: todo PASS — evidencia criterios MVP §7 (indexar 100K mix sin crash, re-scan diferencial, <100ms, .cdc portable)

- [ ] **Step 5: Commit**

```bash
git add tests scripts src-tauri/crates/core-db/benches .github/workflows/ci.yml
git commit -m "test: e2e + benches + seed para criterios MVP"
```
