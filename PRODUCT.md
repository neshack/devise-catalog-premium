# Product

<!-- impeccable:product-schema 1 -->

<!-- Derived 2026-10-25 from the repository itself: docs/superpowers/specs/
     2026-09-05-devise-catalog-premium-design.md, README.md, the Rust commands and
     the shipped UI copy. Marked inferred where the spec does not state it;
     correct anything that reads wrong. -->

## Platform

desktop

<!-- A Tauri v2 shell around a React web view. Desktop window, 1280×800
     default, 960×600 minimum. No mobile, no touch. -->

## Stack

Tauri v2 + Rust backend, TypeScript + React 19 + Vite frontend. Custom design
system in `src/index.css` (CSS variables; no Tailwind). Zustand for state,
TanStack Virtual for lists. SQLite WAL + FTS5 in a single `.cdc` file.
Offline-first is a hard constraint: no external fonts, CDNs, or network calls
at runtime.

## Users

Inferred: one person — a collector, archivist, or hoarder-of-backups — with
their files spread across burned discs, USB drives, external disks, a NAS, and
ISOs. The job: finding where a file actually lives, years later, without
hunting for the media. Long focused sessions at a desk; keyboard first; not a
team tool, not a shared catalog, not a service.

## Product Purpose

Offline successor of the original **CD Catalog Expert**. Scans whole volumes
(discs, USB, NAS, ISOs) and lets the user search the catalog **without the media
being inserted**. Success is: any question about "where is this file?" answered
in under a second, from a catalog that was built once and stays honest as disks
change. The product was renamed **Devise Catalog Premium** in 0.3.0.

## Positioning

The catalog is a single portable file that belongs to the user: copied,
backed up, or carried on a USB stick, and answering searches with no network,
no account, and no server. Nothing about a neighboring product is required for
it to work.

## Operating Context

- Volumes come and go: a disk is scanned, unplugged, re-scanned months later.
  Differential re-scans (size + mtime) are the normal case, not a special one.
- Scan lengths run from seconds to hours. Machines suspend, drives get yanked,
  the app gets closed mid-scan. An interrupted scan is a normal event, not an
  exception, and the user's mental model is "continue what I started".
- The UI language is Spanish (Mexico-neutral). Code, comments, and commits are
  English.
- The current media appear in the sidebar with file counts and sizes; the
  Inspector shows metadata read from the files themselves (ID3, EXIF) plus the
  archive an entry lives in.
- Duplicates are reported as identical content (BLAKE3) across volumes.

## Capabilities and Constraints

Confirmed: volume scan with differential re-scan; full-text search with filters
(extension, size, volume) over a virtualized result list; tree view with one
level per query; duplicate groups by BLAKE3; inspector with audio/image
metadata and "inside <archive>" provenance; ZIP contents indexed without
extracting them; exports (CSV, JSON, HTML); a .cdc catalog file; demo mode with
seeded data; light, dark and system themes with persisted preference; tags on
files and folders with inherited search; "locate in tree" from results; full
paths in the inspector and duplicate list; per-volume device type from eight
bundled plates, with one or two indicator colors drawn in the sidebar.

Scan attempts persist in `scan_runs` with a heartbeat, so a suspended or killed
process can be resumed. Pausing parks the walk without busy-waiting. Unreadable
paths are written to `scan_errors`. Removing a volume requires typing its label,
never touches the disk, and runs off the main thread so a large cascade cannot
freeze the window; the old `com.cdcatalog.premium` catalog is copied into the
new `com.devise.catalog` data directory on first launch.

Terminology in play: volumen, escaneo, catálogo, entrada (fila dentro de un
contenedor), contenedor, duplicados, ficha.

Undecided / not built: 7z and ISO container parsers; archive entries are not
hashed, so they do not participate in duplicate detection; no updater; Linux
packages ship unsigned by design.

## Brand Commitments

- The product name is **Devise Catalog Premium** and stays.
- The mark is a disc read by a spectral arc. The same geometry lives in the
  in-app logo, the favicon and the generated OS icon set.
- Spanish is the interface language, including error and empty-state copy.
- No accounts, no telemetry, no network: this is a promise, not a setting.

## Evidence on Hand

- `docs/superpowers/specs/2026-09-05-devise-catalog-premium-design.md` — the design
  spec, including the five MVP success criteria (§7).
- `docs/images/*.png` — reviewed captures of the shipped UI, produced by
  `scripts/capture.mjs` (Playwright) against demo mode.
- `src/lib/mock.ts` — seeded demo catalog (volumes, files, ZIP entries,
  duplicates) usable as honest demo material.
- Absent, must not be fabricated: real testimonials, pricing, customers,
  benchmarks, or telemetry of any kind.

## Product Principles

1. **Sin el disco insertado.** The catalog answers when the media is in a
   drawer; anything that needs the media present has failed the product.
2. **El catálogo no miente.** Counts, progress, and states describe what is
   really happening, including "stopped here", "interrupted", and "these files
   could not be read".
3. **Nada sale de tu máquina.** No network, ever; portability of one file.
4. **Búsqueda primero, teclado primero.** Search is the primary surface and the
   keyboard is the primary input.
5. **Lento es un estado, no un cuelgue.** Hours-long work must always show what
   it is doing, how far it has come, and how much is left.

## Accessibility & Inclusion

Keyboard-first operation with visible focus (the incumbent styles it), reduced
motion honored, and WCAG AA contrast as the floor. The window is resizable down
to 960×600 and 400 % zoom must not destroy the layout.
