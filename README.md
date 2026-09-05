# CD Catalog Premium

Sucesor offline y cross-platform de **CD Catalog Expert**: escanea volúmenes completos
(discos, USB, NAS, ISOs) y permite buscar en el catálogo **sin tener el disco insertado**.

Todo el catálogo vive en un único archivo portable `.cdc` (SQLite WAL + FTS5).
100 % local: sin cuentas, sin telemetría, sin red.

## Stack

- **App:** Tauri v2 + Rust (backend) + TypeScript + React + Vite + Tailwind
- **Datos:** SQLite WAL + FTS5 (`rusqlite`), un solo archivo `.cdc`
- **Escaneo:** `jwalk` + hash BLAKE3 + parsers (`lofty` audio, `rexif` EXIF, `zip`)
- **UI:** Zustand + TanStack Virtual (listas de millones de filas a 60 fps)

## Prerequisitos

| Requisito | Versión | Notas |
|---|---|---|
| Rust estable | ≥ 1.77 | `rustup` recomendado |
| Node.js | ≥ 20 | incluye `npm` |
| **Linux** | webkit2gtk 4.1 + dependencias | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev` (Debian/Ubuntu) |
| **Windows** | WebView2 | viene preinstalado en Windows 10/11 |
| **macOS** | Xcode Command Line Tools | `xcode-select --install` |

## Instalación

```bash
git clone <repo> && cd cd_catalog_premium
git checkout feat/cd-catalog-mvp   # rama de desarrollo actual
npm install
```

## Ejecución

### App de escritorio (modo desarrollo)

```bash
npm run tauri dev
```

Abre la ventana nativa con recarga en caliente del frontend (`http://localhost:1420`).
En Linux sin pantalla usa `xvfb-run -a npm run tauri dev`.

### Solo frontend (sin backend)

```bash
npm run dev        # http://localhost:1420
```

Renderiza la UI, pero `search`/`scan` fallan: los comandos Tauri solo existen
dentro de `tauri dev` / la app compilada.

### Build de producción

```bash
npm run tauri build
```

Genera el binario + instalador en `src-tauri/target/release/bundle/`:

| OS | Artefacto |
|---|---|
| Windows | `.msi` / `.exe` (`bundle/msi`, `bundle/nsis`) |
| Linux | `.deb` / `.AppImage` |
| macOS | `.dmg` / `.app` |

## Primer catálogo: escanear un volumen

> Nota: el botón "Escanear" en la UI es el próximo milestone. Mientras tanto,
> el backend `scan_volume` está completo y se invoca desde la consola DevTools
> de la app (`tauri dev` → clic derecho → Inspeccionar → Consola):

```js
const { invoke } = await import("@tauri-apps/api/core");

// Escanea /media/backup etiquetado como "Backup-12" en el catálogo ./catalog.cdc
await invoke("scan_volume", {
  root: "/media/backup",
  label: "Backup-12",
  serial: "VOL-001",
  dbPath: "/home/tu-usuario/catalog.cdc",  // ruta ABSOLUTA
});
// → devuelve nº de archivos indexados. Re-escanear es diferencial:
// solo inserta/actualiza lo cambiado y borra lo que ya no existe.
```

La app resuelve `catalog.cdc` en su carpeta de datos automáticamente
(`appDataDir`); el `dbPath` absoluto es para uso manual/avanzado.

## Buscar

En la barra de búsqueda (`Ctrl+K`):

```
*.mp3                    → todos los mp3
informe size:>5MB        → "informe" de más de 5 MB
ext:{mp3,flac} size:<10MB   → lista de extensiones + tamaño máximo
volume:"Backup-12"       → solo ese volumen
Beatles                  → full-text (tolerante a * " ( ) :)
```

Sintaxis completa en `src/lib/search.ts` (frontend) y
`src-tauri/src/commands/search.rs` (`parse_raw_query`, lado autoritativo).

Desde consola también vale:

```js
await invoke("search", { dbPath: "<abs>/catalog.cdc", raw: '*.mp3 size:>5MB', limit: 200 });
await invoke("list_duplicates", { dbPath: "<abs>/catalog.cdc", limit: 100 });
await invoke("export_csv", { dbPath: "<abs>/catalog.cdc", outPath: null }); // → ruta del .csv
await invoke("cancel_scan");
```

## Tests y calidad

```bash
# Rust (desde src-tauri/): unit + integración
cargo test --workspace
cargo fmt --check && cargo clippy --all-targets -- -D warnings

# Frontend (desde la raíz)
npx tsc --noEmit && npx vitest run && npm run build

# E2E (levanta vite solo en :1420)
npx playwright test

# Micro-bench de búsqueda FTS5
cargo bench -p core-db -- --sample-size 10 --measurement-time 1   # (en src-tauri/)

# Generar 10 000 archivos fake para probar escala
python3 scripts/seed_large.py /tmp/cdc_seed 10000
```

## Estructura

```
src-tauri/
  src/main.rs  lib.rs  commands/{scan,search,export}.rs   # IPC Tauri
  crates/core-db      # SQLite WAL + FTS5, upsert diferencial
  crates/core-scanner # walk paralelo jwalk, cancelable
  crates/core-hash    # BLAKE3 parcial/completo
  crates/core-parsers # ID3 (lofty), EXIF (rexif), ZIP
  crates/core-export  # CSV / JSON / HTML (con escaping)
src/
  lib/search.ts       # parser de queries (hints de UI)
  stores/volumes.ts   # Zustand
  components/{SearchBar,VolumeSidebar,CatalogTree,Inspector}.tsx
tests/e2e/            # Playwright
docs/superpowers/
  specs/2026-09-05-cd-catalog-premium-design.md  # diseño aprobado
  plans/2026-09-05-cd-catalog-premium.md         # plan de implementación
```

## Estado del MVP y límites conocidos

- ✅ Escaneo diferencial, búsqueda <100 ms, duplicados por BLAKE3, export.
- 🔜 Botón Escanear/Exportar en la UI (hoy vía consola, ver arriba).
- 🔜 Filas de contenido interno de ZIP/7z/ISO y metadatos ID3/EXIF visibles
  en el Inspector (el scan ya guarda hash; parsers listos).
- El catálogo es un archivo: llévalo a otro PC y ábrelo intacto.
