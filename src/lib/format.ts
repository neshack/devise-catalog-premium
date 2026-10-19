/** Human-readable formatting helpers (es-ES, binary units). */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

// Sizes are read by people: a Spanish catalog writes 36,3 MB, not 36.3 MB.
// Both formatters skip decimals where they would only add noise.
const SIZE_ONE_DECIMAL = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const SIZE_WHOLE = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";
  const i = Math.min(Math.floor(Math.log2(n) / 10), BYTE_UNITS.length - 1);
  const v = n / 1024 ** i;
  const s = i === 0 ? String(v) : (v >= 100 ? SIZE_WHOLE : SIZE_ONE_DECIMAL).format(v);
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

/** Seconds left, said the way a person would say it. `null` = not knowable. */
export function formatEta(secs: number | null): string | null {
  if (secs === null || !Number.isFinite(secs)) return null;
  if (secs < 60) return `${Math.max(1, Math.round(secs))} s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours} h ${mins % 60} min`;
}

/** Percentage of a total that may not exist yet: `null` is an answer too. */
export function percentOf(seen: number, total: number | null): number | null {
  if (total === null || total <= 0) return null;
  return Math.min(100, Math.round((seen / total) * 100));
}

/**
 * Ruta completa de un resultado, tal como la escribiría el usuario.
 *
 * Para lo que vive dentro de un ZIP, `path` sólo apunta a la carpeta que
 * contiene el archivo comprimido: la ruta real es la del contenedor (que ya
 * viene relativa a la raíz del volumen) más la ruta interna.
 */
export function hitFullPath(hit: {
  path: string;
  name: string;
  container_path: string | null;
}): string {
  if (hit.container_path !== null) {
    return `/${hit.container_path.replace(/^\/+/, "")}/${hit.name}`;
  }
  const dir = hit.path === "/" ? "" : hit.path;
  return `${dir}/${hit.name}`;
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
