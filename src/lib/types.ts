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
}

export interface VolumeSummary {
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

export interface ScanProgress {
  phase: "walk" | "index";
  files_seen: number;
  bytes_seen: number;
}

export type ExportFormat = "csv" | "json" | "html";

export type SortKey = "name" | "size" | "mtime" | "volume";
export type SortDir = "asc" | "desc";
