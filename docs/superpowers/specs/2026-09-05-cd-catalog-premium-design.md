# CD Catalog Premium — Design Spec

**Fecha:** 2026-09-05
**Estado:** Aprobado por usuario (brainstorming architectural path)
**Repo:** `cd_catalog_premium` (greenfield)
**Origen:** Reimaginación moderna de CD Catalog Expert (Win32, Jet .mdb, FindFirstFile, ID3/EXIF, ZIP/RAR/ARJ/CAB, CDDB, export TXT/CSV/HTML/XML)

## 1. Resumen y decisiones base

- **Objetivo:** Sucesor desktop offline de CD Catalog Expert. Escanear volúmenes completos y buscar sin tener el disco insertado.
- **Plataforma:** Cross-platform total — Windows 10/11 64-bit + Linux + macOS.
- **Stack elegido:** Tauri v2 + Rust (backend) + TypeScript + Vite + React + Tailwind (frontend).
- **Alcance MVP:** Paridad clásica (árbol recursivo, contenedores internos, ID3/EXIF) + añadidos modernos (hash BLAKE3, deduplicación, búsqueda instantánea FTS5, snapshot diferencial).
- **Escala objetivo:** 1–2M archivos, 100–500 volúmenes, búsqueda <100ms p95, catálogo <1GB en un solo archivo.
- **Enfoque storage elegido (A):** SQLite + FTS5. Descartados B (SQLite+Tantivy, mejor fuzzy pero doble store y 2–3x tamaño) y C (DuckDB analítico, peor en updates incrementales).

## 2. Arquitectura general

```
┌─────────────────────────────────────────────┐
│ Frontend TS: React + Vite + Tailwind        │  WebView nativo OS
│ TreeView virtualizado, búsqueda, inspector  │
├─────────────────────────────────────────────┤
│ Tauri v2 Commands (IPC tipado)              │
│ scan_volume, cancel_scan, search,           │
│ get_volume, list_duplicates, export         │
├─────────────────────────────────────────────┤
│ Rust Core workspace                         │
│ scanner │ parsers │ db │ hash │ export      │
└─────────────────────────────────────────────┘
         ↓ catalog.cdc (SQLite WAL, single-file)
```

- **Por qué Tauri v2:** binario ~10–15MB vs ~150MB Electron, RAM ~80–120MB, WebView nativo, auto-update y firma integrados, backend Rust ideal para I/O masivo. Sucesor espiritual del footprint 8–32MB original.
- **Workspace Rust:**
  - `core-scanner`: walk paralelo (`jwalk` + rayon), canales cancelables.
  - `core-db`: `rusqlite` + WAL + FTS5, migraciones versionadas.
  - `core-hash`: BLAKE3 por defecto, SHA-256 opcional.
  - `core-parsers`: `lofty` (ID3v1/v2, Vorbis, MP4), `rexif/kamadak-exif` (EXIF), `zip`/`sevenz-rust`/`tar` + `iso9660-rs`/UDF para contenedores e imágenes.
  - `core-export`: CSV / JSON / HTML estático auto-contenido.
- **Frontend:** TS strict, Zustand (estado), TanStack Virtual (árboles/tablas de millones de filas a 60fps), shadcn/ui, i18n ES/EN, `Ctrl+K` búsqueda, `Ctrl+E` exportar.
- **Distribución:** GitHub Actions → `.msi` (Win), `.deb/.AppImage` (Linux), `.dmg` universal (macOS). 100% offline, sin telemetría.
- **No-objetivos MVP (YAGNI):** cuentas, cloud/sync, colaboración, AI, impresión de covers/inlays CD (v2), lookup remoto CDDB/MusicBrainz (solo se guarda TOC hash para futuro).

## 3. Modelo de datos (sucesor de .mdb Jet)

```sql
CREATE TABLE volumes(
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  serial TEXT NOT NULL,
  fs_type TEXT,            -- NTFS, APFS, ext4, exFAT, ISO9660, UDF, SMB
  total_bytes INTEGER,
  used_bytes INTEGER,
  media_kind TEXT,         -- hdd, ssd, usb, optical, iso, nas
  indexed_at INTEGER,      -- unix ts
  root_hash TEXT,
  UNIQUE(label, serial)
);

CREATE TABLE dirs(
  id INTEGER PRIMARY KEY,
  volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES dirs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path_hash TEXT NOT NULL, -- para re-mounts / renames
  mtime INTEGER
);
CREATE INDEX idx_dirs_vol_parent ON dirs(volume_id, parent_id);

CREATE TABLE files(
  id INTEGER PRIMARY KEY,
  dir_id INTEGER NOT NULL REFERENCES dirs(id) ON DELETE CASCADE,
  volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ext TEXT,                -- lower, sin punto
  size INTEGER NOT NULL,
  ctime INTEGER, mtime INTEGER,
  attrs TEXT,              -- r/h/s serializado
  blake3 TEXT,             -- null hasta pasada hash completa
  sha256 TEXT,             -- solo bajo demanda
  container_path TEXT,     -- ej. "backup.zip/docs/informe.pdf", null si real
  audio_json TEXT,         -- lofty: artista/album/bitrate/duracion
  image_json TEXT          -- exif: camara/resolucion (GPS strippado)
);
CREATE INDEX idx_files_ext_size ON files(ext, size);
CREATE INDEX idx_files_blake3 ON files(blake3);
CREATE INDEX idx_files_vol_dir ON files(volume_id, dir_id);

-- FTS5 externo para nombres
CREATE VIRTUAL TABLE files_fts USING fts5(name, ext, tokenize='unicode61');
-- triggers insert/update/delete para sync

CREATE TABLE thumbs(
  file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  webp128 BLOB             -- solo bajo demanda
);

CREATE TABLE scan_errors(
  id INTEGER PRIMARY KEY,
  volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  reason TEXT NOT NULL
);
```

- **Estimación:** ~450 bytes/fila → 2M archivos ≈ 900MB con FTS. Thumbs fuera de la tabla caliente.
- **Hashes:** BLAKE3 siempre disponible (~3GB/s); modo rápido MVP = hash parcial (primeros 64KB + size + mtime) para dedup aproximada; hash completo bajo botón. SHA-256 solo checkbox forense.
- **Re-escaneo diferencial:** match por `(serial, label)` + `path_hash`; upsert solo si cambia `size/mtime`; borrados → marcados offline, no borrado físico sin confirmación.

## 4. Motor de escaneo (reemplazo FindFirstFile)

Pipeline en 4 fases, cancelable vía flag atómico + canal crossbeam (el walk es paralelo síncrono con rayon; el async de Tauri solo puentea progreso) + eventos Tauri `scan://progress`:

1. **Enumerate:** `jwalk` paralelo 8–16 hilos. Soporta NTFS/APFS/ext4/exFAT, USB/NAS montado, ISO/UDF montado. Symlinks: no seguir por defecto. Nombres largos/unicode. Objetivo ~50–100K archivos/min en SSD.
2. **Container expand:** `*.zip/7z/tar/iso/img` listados en memoria sin extraer (`sevenz-rust`, `iso9660-rs`). Registrados con `container_path`, sin hash interno en MVP.
3. **Metadata:** solo por extensión: `lofty` (MP3/FLAC/M4A/OGG), `rexif` (JPG/RAW básico). TOC/CDDA hasheado y guardado para lookup futuro, sin red en MVP.
4. **Commit:** batches 5K filas/tx en WAL. Transacción = crash-safe; Cancelar no corrompe.

## 5. Búsqueda, UI y exportación

- **Sintaxis (superset `*.mp3` clásico):**
  - `*.mp3` → `ext:mp3`, `*informe*` → FTS `informe*`
  - Filtros: `size:>100MB ext:{mp3,flac} year:1998-2005 volume:"Backup-12" audio.artist:Beatles`
  - Fallback `LIKE` para patrones con `?`.
- **Perf:** FTS5 + índices, debounce 150ms, <100ms p95, resultados virtualizados (10K visibles).
- **UI:** sidebar volúmenes (barra GB, badge Offline), centro TreeView + tabla (nombre/tamaño/fecha/hash), derecha inspector (EXIF/ID3, thumb, “ver duplicados por BLAKE3”). Tema oscuro premium. Vista “¿Dónde está?”: volumen + última vez visto.
- **Export MVP:** CSV, JSON, HTML estático auto-contenido (paridad con TXT/CSV/HTML/XML original; XML se sustituye por JSON, TXT por CSV). Sin covers CD en MVP.

## 6. Robustez, rendimiento, testing, seguridad

- **Errores:** denegados/largos/corruptos → `scan_errors` + contador, nunca tumban el scan. WAL + `VACUUM` manual.
- **Testing:** `cargo test` (hash, parsers, diff) + fixtures (ISO fake, ZIP anidado, MP3 ID3v1/v2); Vitest + Playwright frontend; `criterion` bench FTS. CI Win/Linux/macOS.
- **Seguridad/privacidad:** 100% local, strip GPS por defecto, nunca se ejecuta contenido indexado, binarios firmados.

## 7. Criterios de éxito MVP

1. Indexar 100K archivos mixtos (incl. ZIP/ISO/MP3/JPG) sin OOM ni crash.
2. Re-escanear sin duplicar y en <30% del tiempo inicial.
3. Buscar `*.mp3 size:>5MB` sobre 1M filas en <100ms p95.
4. Catálogo portable: copiar `.cdc` a otro PC y abrir intacto.
5. Instaladores firmados en 3 OS desde CI.

## 8. Riesgos y mitigaciones

- FTS5 se degrada con 2M filas + CJK → tokenizer unicode61 + tabla externa + `VACUUM`; fallback a Tantivy solo si bench falla.
- EXIF/ID3 corruptos → parsers en `catch_unwind`, error a `scan_errors`.
- Permisos Windows (admin/NTFS) → modo “solo lectura”, mensaje accionable.
