/** Human-readable formatting helpers (es-ES, binary units). */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";
  const i = Math.min(Math.floor(Math.log2(n) / 10), BYTE_UNITS.length - 1);
  const v = n / 1024 ** i;
  const s = i === 0 ? String(v) : v >= 100 ? v.toFixed(0) : v.toFixed(1);
  return `${s} ${BYTE_UNITS[i]}`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("es-ES").format(n);
}

export function formatDate(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(epochSeconds * 1000));
}

export function formatHash(hash: string | null, keep = 12): string {
  if (!hash) return "—";
  return hash.length <= keep ? hash : `${hash.slice(0, keep)}…`;
}

export type FileKind =
  | "audio"
  | "image"
  | "video"
  | "doc"
  | "archive"
  | "code"
  | "disk"
  | "file";

const KIND_BY_EXT: Record<string, FileKind> = {};
for (const e of ["mp3", "flac", "wav", "ogg", "m4a", "aac", "wma", "opus", "mid"]) KIND_BY_EXT[e] = "audio";
for (const e of ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg", "heic", "raw", "cr2", "nef"]) KIND_BY_EXT[e] = "image";
for (const e of ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg"]) KIND_BY_EXT[e] = "video";
for (const e of ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "rtf", "odt", "csv", "epub"]) KIND_BY_EXT[e] = "doc";
for (const e of ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"]) KIND_BY_EXT[e] = "archive";
for (const e of ["js", "ts", "tsx", "py", "rs", "go", "c", "cpp", "h", "java", "sh", "json", "xml", "yml", "yaml", "html", "css", "sql", "toml"]) KIND_BY_EXT[e] = "code";
for (const e of ["exe", "msi", "deb", "rpm", "dmg", "appimage", "apk", "bin"]) KIND_BY_EXT[e] = "disk";

export function fileKind(ext: string | null | undefined): FileKind {
  if (!ext) return "file";
  return KIND_BY_EXT[ext.toLowerCase()] ?? "file";
}
