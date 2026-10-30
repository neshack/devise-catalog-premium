# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Elegir la unidad con el diálogo del sistema.** The scan dialog opens the
  native folder picker and takes the absolute path from there; the label is
  suggested from the chosen folder. Typing a path still works.
- **Volumes can be identified without their disc.** Each volume accepts a
  description and a catalog image. The image is shrunk, embedded in the
  catalog as a data URL and shown in the sidebar, so the original file can
  move or disappear.
- **The left panel collapses to an icon rail**, with covers, monograms,
  tooltips and accessible names; the preference survives a restart.
- **Exports follow the selected volume.** The menu names the volume, the file
  is named after it, and CSV/JSON now include the full location of every file.
- **The HTML export is a page from this app**: the disc mark, the graphite and
  amber palette, the volume cover and description, stats, and an offline
  filter over the table. Pages are capped at 25 000 rows and say so; CSV and
  JSON remain complete.

### Fixed

- A finished scan no longer leaves the dialog stuck on its summary: opening
  **Escanear volumen** again starts a new scan.
- The ending of a scan says whether it finished, was cancelled or was
  interrupted, instead of reporting every outcome as a success.
- A long path in the scan progress wraps inside the dialog instead of running
  past its edge.
- Dialogs taller than the window scroll their body; their buttons stay
  reachable.

## [0.4.0] — 2026-10-25

### Added

- Tags on files and folders. Folder tags are inherited by their subtree when
  searching. Search syntax: `tag:playa` or `#playa`.
- Result context menu with **Ubicar en el árbol**, which opens every folder
  above the file and leaves it selected.
- Full paths in the inspector and in the duplicate list, wrapped instead of
  truncated.

### Fixed

- Volume removal runs off the main thread, so a large cascade no longer freezes
  the window. The dialog stays open if the removal fails.
- `files(volume_id)` is indexed: the same 100k-file cascade dropped from ~3.6 s
  to ~1.0 s on the development machine.
- Searching from the tree opens the results screen; selecting a volume with no
  query opens the tree instead of an empty results list.
- A pending search can no longer pull the user back to results while
  "Ubicar en el árbol" is opening the tree.

## [0.3.0] — 2026-10-25

### Changed

- Renamed the product to **Devise Catalog Premium**.
- New bundle identifier `com.devise.catalog`; the old `catalog.cdc` is copied
  from `com.cdcatalog.premium` on first launch.
- The tree is the primary view; selecting a file updates the inspector without
  leaving the tree.
- Volume selection is keyed by `(label, serial)`, so two discs with the same
  label no longer select together.
- The native window title and the header include the running version.

### Added

- Safe volume removal: typing the volume label is required; the disk is never
  modified.
- Light, dark and system themes, selected from the header, applied before the
  first paint and remembered across launches.
- Splash screen with the brand, the version and the author's profile
  ([@neshack](https://x.com/neshack)).
- Linux post-install script refreshes the icon and desktop caches, and the
  bundle ships a 512 px icon.

### Fixed

- Tauri v2 IPC arguments are sent in camelCase. Selecting a tree file no longer
  fails with `missing required key fileId`; duplicate lookups and exports use
  the same normalization.
- `formatBytes` uses Spanish separators instead of `toFixed`.

## [0.2.0] — 2026-10-18

### Added

- Scan runs persisted in `scan_runs` with a heartbeat, startup sweep and manual
  resume after a crash or suspend.
- Scan strip with phase, current path, files seen, percentage, ETA, speed and
  unreadable-path count; pause/resume/cancel.
- Volume tree with one level per query and direct folder counts.
- In-app brand mark, favicon and the complete OS icon set.

### Changed

- Version has a single source: `package.json` (Tauri reads it, Vite injects it).
- Status bar shows the running version.

## [0.1.0] — 2026-09-05

### Added

- First MVP: differential volume scan, SQLite FTS5 search, duplicate detection,
  inspector, ZIP entries, exports and demo mode.
