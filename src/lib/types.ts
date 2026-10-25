/** Shared shapes mirrored from the Tauri backend (serde snake_case). */

export interface Hit {
  id: number;
  name: string;
  size: number;
  volume_label: string;
  ext: string | null;
  mtime: number;
  path: string;
  blake3: string | null;
  /** Raw `core-parsers` payloads; parse them with `lib/media.ts`. */
  audio_json: string | null;
  image_json: string | null;
  /**
   * Archive this hit lives inside, relative to the volume root. `null` for
   * files on disk; when set, `name` is the path the entry has inside the
   * archive (see `scan.rs`).
   */
  container_path: string | null;
}

export interface VolumeSummary {
  /** Stable identity: labels can repeat, ids cannot. */
  id: number;
  label: string;
  serial: string;
  indexed_at: number | null;
  file_count: number;
  total_size: number;
}

export interface DuplicateGroup {
  blake3: string;
  size: number;
  count: number;
  sample_name: string;
}

export interface FileDuplicate {
  id: number;
  name: string;
  size: number;
  volume_label: string;
  path: string;
}

/** Live scan figures pushed by the backend while it works (`scan://progress`). */
export interface ScanProgress {
  run_id: number;
  /** `walk` while folders are being read, `index` while rows are written. */
  phase: "walk" | "index";
  state: ScanEventState;
  files_seen: number;
  bytes_seen: number;
  /** An estimate during the walk (the previous scan's count), exact while indexing. */
  files_total: number | null;
  bytes_total: number | null;
  current_path: string | null;
  error_count: number;
  bytes_per_sec: number | null;
  eta_secs: number | null;
}

/** What a scan can be doing in this process, plus how it ended. */
export type ScanEventState =
  | "idle"
  | "running"
  | "paused"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "failed";

/** Terminal states mean the strip can say what happened and stop moving. */
export const SCAN_DONE_STATES: ScanEventState[] = ["completed", "cancelled", "failed"];

export type ScanRunState =
  | "running"
  | "paused"
  | "interrupted"
  | "completed"
  | "cancelled"
  | "failed";

/**
 * A scan attempt as the catalog remembers it. This is what makes "dónde se
 * quedó" answerable after the app was killed: the row outlives the process.
 */
export interface ScanRun {
  id: number;
  volume_id: number;
  volume_label: string;
  volume_serial: string;
  root: string;
  state: ScanRunState;
  phase: "walk" | "index" | "done";
  files_seen: number;
  bytes_seen: number;
  files_total: number | null;
  bytes_total: number | null;
  current_path: string | null;
  error_count: number;
  error: string | null;
  started_at: number;
  heartbeat_at: number;
}

export interface ScanStatus {
  live: "idle" | "running" | "paused" | "cancelling";
  run: ScanRun | null;
}

export interface ScanOutcome {
  run_id: number;
  files_seen: number;
  state: "completed" | "cancelled" | "failed";
}

export type ExportFormat = "csv" | "json" | "html";

export type SortKey = "name" | "size" | "mtime" | "volume";
export type SortDir = "asc" | "desc";

/** A folder as the tree shows it, with direct (not recursive) counts. */
export interface TreeDir {
  id: number;
  name: string;
  files: number;
  dirs: number;
  size: number;
  /** Tags attached directly to this folder (not inherited ones). */
  tags: string[];
}

export interface TreeFile {
  id: number;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  container_path: string | null;
  /** Tags attached directly to this file. */
  tags: string[];
}

/** One level of the tree: folders and files inside a folder. */
export interface TreeChildren {
  dirs: TreeDir[];
  files: TreeFile[];
  files_total: number;
  dirs_total: number;
}

/** Where a file lives inside its volume's tree. */
export interface TreePath {
  volume_label: string;
  volume_serial: string;
  /** Root first, the file's own folder last. */
  dir_ids: number[];
  file_id: number;
}
