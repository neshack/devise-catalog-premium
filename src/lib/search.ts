export interface ParsedQuery { fts: string; ext?: string; min_size?: number; volume?: string }
export function parseSize(s: string): number | undefined {
  const m = s.match(/^([0-9]+)(KB|MB|GB)$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unit = m[2].toUpperCase();
  return n * (unit === "KB" ? 1024 : unit === "MB" ? 1024 ** 2 : 1024 ** 3);
}
export function parseSearchQuery(raw: string): ParsedQuery {
  const tokens = raw.trim().split(/\s+/);
  let ext: string | undefined;
  let min_size: number | undefined;
  let volume: string | undefined;
  const ftsParts: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("*.") && t.length > 2) { ext = t.slice(2).toLowerCase(); ftsParts.push(ext); continue; }
    if (t.startsWith("ext:")) { ext = t.slice(4).toLowerCase(); ftsParts.push(ext); continue; }
    if (t.startsWith("size:>")) { min_size = parseSize(t.slice(6)); continue; }
    if (t.startsWith("volume:")) { volume = t.slice(7).replace(/^"|"$/g, ""); continue; }
    ftsParts.push(t.replaceAll("*", ""));
  }
  return { fts: ftsParts.filter(Boolean).join(" ") + "*", ext, min_size, volume };
}
