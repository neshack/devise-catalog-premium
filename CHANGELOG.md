# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
