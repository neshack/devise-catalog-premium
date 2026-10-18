# CD Catalog Premium

Sucesor offline y cross-platform de **CD Catalog Expert**: escanea volúmenes completos
(discos, USB, NAS, ISOs) y permite buscar en el catálogo **sin tener el disco insertado**.

Todo el catálogo vive en un único archivo portable `.cdc` (SQLite WAL + FTS5).
100 % local: sin cuentas, sin telemetría, sin red.

## Stack

- **App:** Tauri v2 + Rust (backend) + TypeScript + React + Vite (sin Tailwind:
  design system propio en `src/index.css` con variables CSS)
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

Renderiza la UI completa en **modo demo** (badge en la barra de estado): el
catálogo vive en memoria con datos de ejemplo, así que todas las pantallas —
búsqueda, inspector, duplicados, escaneo, exportación — son navegables sin
backend. Con `tauri dev` / la app compilada el badge pasa a «catálogo activo»
y todo opera sobre el `.cdc` real.

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

### Instaladores firmados (CI)

`.github/workflows/release.yml` compila los tres sistemas en cada tag `v*` —o a
mano con *Actions → release → Run workflow*— y sube los instaladores como
artefactos del run.

La firma depende de secretos del repositorio y es opcional por plataforma: sin
ellos el mismo workflow compila y sube instaladores **sin firmar** (lo que ve
una bifurcación o un dry-run), y con ellos firma, notariza (macOS) y **verifica
la firma antes de publicar** — un artefacto que solo lo parece falla el job.

`scripts/wizard-signing.sh` recorre la parte que solo puede hacer una persona
(portal de Apple, autoridad certificadora, contraseñas) y deja los secretos en
el repositorio:

| Grupo | Secretos | Lo que habilita |
|---|---|---|
| Firma macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_SIGNING_IDENTITY` | `codesign` + `codesign --verify` |
| Notarización macOS | `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | notarización + `spctl` + `stapler validate` |
| Firma Windows | `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` | Authenticode + `Get-AuthenticodeSignature` |

Los paquetes de Linux quedan sin firma **a propósito**: `.deb` y `.AppImage` no
tienen comprobación de firma a nivel de sistema; lo equivalente es un repositorio
de paquetes firmado con GPG, que este proyecto todavía no publica.

## Primer catálogo: escanear un volumen

1. Botón **Escanear volumen** (barra lateral izquierda).
2. Carpeta raíz absoluta (`/media/backup`, `D:\`, un NAS montado…), etiqueta
   y — opcionalmente — nº de serie.
3. El progreso se muestra en vivo (archivos vistos / bytes procesados) y se
   puede cancelar. Al terminar, el volumen aparece en la barra lateral.

Re-escanear el mismo volumen es **diferencial**: solo inserta/actualiza lo
cambiado y borra lo que ya no existe.

La app resuelve `catalog.cdc` en su carpeta de datos automáticamente
(`appDataDir`). Desde consola DevTools también vale (uso manual/avanzado):

```js
const { invoke } = await import("@tauri-apps/api/core");
await invoke("scan_volume", {
  root: "/media/backup",
  label: "Backup-12",
  serial: "VOL-001",
  dbPath: "/home/tu-usuario/catalog.cdc",  // ruta ABSOLUTA
});
```

## Buscar

En la barra de búsqueda (`Ctrl+K`, Escape limpia; los filtros activos se
muestran como chips quitables dentro del propio campo):

```
*.mp3                    → todos los mp3
informe size:>5MB        → "informe" de más de 5 MB
ext:{mp3,flac} size:<10MB   → lista de extensiones + tamaño máximo
volume:"Backup-12"       → solo ese volumen (o clic en un volumen de la barra lateral)
Beatles                  → full-text (tolerante a * " ( ) :)
```

Sintaxis completa en `src/lib/search.ts` (frontend) y
`src-tauri/src/commands/search.rs` (`parse_raw_query`, lado autoritativo);
también disponible desde el botón «?» de la cabecera.

### Duplicados, inspector y exportación

- Pestaña **Duplicados**: grupos de archivos con idéntico hash BLAKE3
  (`list_duplicates`), con nº de copias y espacio recuperable.
- **Inspector** (panel derecho): ruta completa, tamaño, fecha, tipo y hash del
  archivo seleccionado; con `file_duplicates` lista sus copias exactas en
  otros volúmenes.
- Menú **Exportar**: catálogo completo a CSV, JSON o HTML (`export_*`); el
  archivo se escribe junto al `.cdc` y la ruta se muestra en un aviso.

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
  lib/{search,types,format,ipc,mock}.ts  # parser de queries, tipos, formato,
                                         # IPC Tauri + modo demo
  stores/catalog.ts   # Zustand: búsqueda, volúmenes, escaneo, toasts
  components/         # SearchBar (chips), VolumeSidebar, ResultsList (virtual),
                      # Inspector, DuplicatesPanel, ScanDialog, ExportMenu,
                      # Toasts, StatusBar, icons (SVG)
tests/e2e/            # Playwright (corren sobre el modo demo)
scripts/capture.mjs   # capturas de la UI para revisión visual
scripts/wizard-signing.sh  # secretos de firma para el CI (portal Apple, CA)
scripts/seed_large.py # 10 000 archivos fake para probar escala
docs/superpowers/
  specs/2026-09-05-cd-catalog-premium-design.md  # diseño aprobado
  plans/2026-09-05-cd-catalog-premium.md         # plan de implementación
```

## Estado del MVP y límites conocidos

- ✅ Escaneo diferencial, búsqueda <100 ms, duplicados por BLAKE3, export.
- ✅ UI completa: escaneo con progreso en vivo, vista Duplicados, inspector
  con copias idénticas por hash, exportación, chips de filtros, modo demo.
- ✅ Metadatos leídos por el escáner y visibles en el Inspector: ID3 vía
  `lofty` (intérprete, álbum, bitrate) y EXIF vía `rexif` (dimensiones).
- ✅ Contenido de los ZIP indexado sin extraer: una fila por entrada, con el
  ZIP de origen visible en la fila y en el Inspector.
- ✅ Empaquetado en los tres sistemas (`release.yml`): firmado y notarizado en
  macOS y firmado en Windows cuando los secretos están puestos, sin firma en
  Linux (`.deb`/`.AppImage` no verifican firmas).
- 🔜 7z e ISO siguen pendientes: `zip` es hoy el único parser de contenedores.
- 🔜 La firma real todavía no se ha estrenado: el workflow y el asistente están
  listos, pero los certificados de Apple y de la CA se compran aparte.
- El catálogo es un archivo: llévalo a otro PC y ábrelo intacto.
