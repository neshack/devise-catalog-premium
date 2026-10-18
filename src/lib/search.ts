export interface ParsedQuery {
  fts: string;
  ext?: string;
  min_size?: number;
  max_size?: number;
  volume?: string;
  exts?: string[];
}
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
  let max_size: number | undefined;
  let volume: string | undefined;
  const exts: string[] = [];
  const ftsParts: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("*.") && t.length > 2) {
      ext = t.slice(2).toLowerCase();
      if (!exts.includes(ext)) exts.push(ext);
      ftsParts.push(ext);
      continue;
    }
    if (t.startsWith("ext:")) {
      const inner = t.slice(4);
      const list = inner.match(/^\{(.*)\}$/);
      const parts = (list ? list[1] : inner)
        .split(",")
        .map((p) => p.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
      if (parts.length > 0) {
        ext = parts[0];
        for (const p of parts) if (!exts.includes(p)) exts.push(p);
        continue;
      }
    }
    if (t.startsWith("size:>")) {
      min_size = parseSize(t.slice(6));
      if (min_size !== undefined) continue;
    }
    if (t.startsWith("size:<")) {
      max_size = parseSize(t.slice(6));
      if (max_size !== undefined) continue;
    }
    if (t.startsWith("volume:")) {
      volume = t.slice(7).replace(/^"|"$/g, "");
      continue;
    }
    ftsParts.push(t.replaceAll("*", ""));
  }
  return {
    fts: ftsParts.filter(Boolean).join(" ") + "*",
    ext,
    min_size,
    max_size,
    volume,
    exts: exts.length > 0 ? exts : undefined,
  };
}

/** Structured filter chips for the UI, derived from the raw query string. */
export interface QueryChip {
  kind: "text" | "ext" | "size-min" | "size-max" | "volume";
  /** Token(s) in the raw query that produced this chip (for removal). */
  token: string;
  label: string;
}

export function describeQuery(raw: string): QueryChip[] {
  const chips: QueryChip[] = [];
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    const low = t.toLowerCase();
    if (low.startsWith("*.") && t.length > 2) {
      chips.push({ kind: "ext", token: t, label: `.${t.slice(2).toLowerCase()}` });
    } else if (low.startsWith("ext:")) {
      const inner = t.slice(4);
      chips.push({ kind: "ext", token: t, label: `.${inner.replace(/[{}.]/g, ",").split(",").filter(Boolean).join(" .")}` });
    } else if (low.startsWith("size:>")) {
      chips.push({ kind: "size-min", token: t, label: `≥ ${t.slice(6)}` });
    } else if (low.startsWith("size:<")) {
      chips.push({ kind: "size-max", token: t, label: `≤ ${t.slice(6)}` });
    } else if (low.startsWith("volume:")) {
      chips.push({ kind: "volume", token: t, label: t.slice(7).replace(/^"|"$/g, "") || t });
    } else if (t.replace(/\*/g, "").length > 0) {
      chips.push({ kind: "text", token: t, label: t.replace(/\*/g, "") });
    }
  }
  return chips;
}

/** Remove a token from the raw query (chip removal → query rewrite). */
export function removeToken(raw: string, token: string): string {
  const kept = raw.trim().split(/\s+/).filter((t) => t !== token);
  return kept.join(" ");
}
