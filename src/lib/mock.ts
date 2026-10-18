/**
 * In-memory demo catalog used when the UI runs without the Tauri backend
 * (`npm run dev`, e2e). Mirrors the backend command semantics closely enough
 * to exercise every screen: search filters, duplicates, exports and scans.
 */
import type {
  DuplicateGroup,
  FileDuplicate,
  Hit,
  ScanProgress,
  VolumeSummary,
} from "./types";

interface MockFile {
  id: number;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  volume: string;
  path: string;
  blake3: string | null;
  audio_json: string | null;
  image_json: string | null;
}

const DAY = 86_400;
const NOW = 1_778_000_000; // fixed epoch so demo data never shifts

interface Seed {
  volume: string;
  path: string;
  name: string;
  ext: string;
  size: number;
  ageDays: number;
  dupOf?: string; // seed key to share a hash with
  /** Mirrors `files.audio_json` as the scanner stores it. */
  audio?: { artist?: string; album?: string; bitrate?: number };
  /** Mirrors `files.image_json` as the scanner stores it. */
  image?: { width?: number; height?: number };
}

function seeds(): Seed[] {
  const s: Seed[] = [];
  const push = (seed: Seed) => s.push(seed);

  // ── Backup-12: documents, projects, VMs ──────────────────────────────
  const docs = ["informe-anual", "contrato-arrendamiento", "notas-reunion", "presupuesto", "manual-usuario", "factura-0142", "cv-actualizado", "tesis-borrador"];
  docs.forEach((d, i) =>
    push({ volume: "Backup-12", path: "/Documentos", name: `${d}.pdf`, ext: "pdf", size: 240_000 + i * 91_237, ageDays: 12 + i * 9 }),
  );
  ["fotos-vacaciones", "proyecto-web", "musica-importada", "backup-movil"].forEach((z, i) =>
    push({ volume: "Backup-12", path: "/Comprimidos", name: `${z}.zip`, ext: "zip", size: (i + 2) * 734_003_217, ageDays: 30 + i * 15 }),
  );
  ["main.py", "catalog.rs", "schema.sql", "app.tsx", "utils.go", "Makefile.txt"].forEach((c, i) =>
    push({ volume: "Backup-12", path: "/Proyectos/catalogo/src", name: c, ext: c.split(".").pop() ?? "txt", size: 1_200 + i * 3_457, ageDays: 3 + i }),
  );
  push({ volume: "Backup-12", path: "/VMs", name: "win11-dev.img", ext: "img", size: 86_400_000_000, ageDays: 60 });
  // true content duplicates (same size + same BLAKE3 as their original, other folder)
  push({ volume: "Backup-12", path: "/Documentos/antiguos", name: "informe-anual (copia).pdf", ext: "pdf", size: 240_000, ageDays: 40, dupOf: "informe-anual.pdf" });
  push({ volume: "Backup-12", path: "/Descargas", name: "notas-reunion.pdf", ext: "pdf", size: 240_000 + 2 * 91_237, ageDays: 5, dupOf: "notas-reunion.pdf" });

  // ── Música-90s: albums ───────────────────────────────────────────────
  const albums: Array<[string, string, string[]]> = [
    ["Nevermind-1991", "Nirvana", ["Smells-Like-Teen-Spirit", "Come-As-You-Are", "Lithium", "In-Bloom"]],
    ["OK-Computer-1997", "Radiohead", ["Paranoid-Android", "Karma-Police", "No-Surprises", "Exit-Music"]],
    ["The-Shape-of-Punk-1999", "Refused", [" Liberation-Frequency", "New-Noise", "Refused-Are-Dead"]],
    ["Homework-1997", "Daft Punk", ["Da-Funk", "Around-the-World", "Burnin"]],
  ];
  for (const [album, artist, tracks] of albums) {
    for (const [i, t] of tracks.entries()) {
      push({
        volume: "Música-90s",
        path: `/Musica/${album}`,
        name: `${String(i + 1).padStart(2, "0")}-${t.trim()}.flac`,
        ext: "flac",
        size: 28_000_000 + i * 4_213_997,
        ageDays: 400 + i * 3,
        audio: { artist, album, bitrate: 1411 },
      });
      push({
        volume: "Música-90s",
        path: `/Musica/${album}/mp3`,
        name: `${String(i + 1).padStart(2, "0")}-${t.trim()}.mp3`,
        ext: "mp3",
        size: 6_400_000 + i * 812_311,
        ageDays: 380 + i * 3,
        audio: { artist, album, bitrate: 320 },
      });
    }
  }
  push({ volume: "Música-90s", path: "/Musica/lists", name: "playlist-verano.m3u", ext: "m3u", size: 4_210, ageDays: 90 });

  // ── Fotos-2024: imágenes y vídeo ─────────────────────────────────────
  ["IMG_4412", "IMG_4413", "IMG_4414", "IMG_5501", "IMG_5502", "DSC_0118", "DSC_0119"].forEach((p, i) =>
    push({
      volume: "Fotos-2024",
      path: "/2024/07-vacaciones",
      name: `${p}.jpg`,
      ext: "jpg",
      size: 4_800_000 + i * 213_771,
      ageDays: 70 + i,
      image: { width: 4032, height: 3024 },
    }),
  );
  ["IMG_4412", "DSC_0118"].forEach((p, i) =>
    push({ volume: "Fotos-2024", path: "/2024/07-vacaciones/RAW", name: `${p}.nef`, ext: "nef", size: 24_100_000 + i * 1_004_223, ageDays: 70 + i }),
  );
  ["resumen-viaje.mp4", "cumple-ana.mp4", "timelapse-obra.mp4"].forEach((v, i) =>
    push({ volume: "Fotos-2024", path: "/2024/video", name: v, ext: "mp4", size: (i + 1) * 1_284_399_001, ageDays: 50 + i * 10 }),
  );
  push({ volume: "Fotos-2024", path: "/2024/backup-movil", name: "IMG_4412.jpg", ext: "jpg", size: 4_800_000, ageDays: 20, dupOf: "IMG_4412.jpg" });
  return s;
}

function buildFiles(): MockFile[] {
  const byKey = new Map<string, string>(); // seed identity -> blake3
  let id = 1;
  let n = 0;
  return seeds().map((sd) => {
    let blake3: string | null = null;
    if (sd.ext !== "m3u" && !sd.name.endsWith(".txt")) {
      const key = sd.dupOf ? `${sd.volume}/${sd.dupOf}` : `${sd.volume}/${sd.name}`;
      let h = byKey.get(key);
      if (!h) {
        // deterministic pseudo-hash
        h = `d${(n++ * 2654435761 >>> 0).toString(16).padStart(8, "0")}c0ffee${(n * 97 + 13).toString(16)}be`;
        byKey.set(key, h);
      }
      blake3 = h;
    }
    return {
      id: id++,
      name: sd.name,
      ext: sd.ext,
      size: sd.size,
      mtime: NOW - sd.ageDays * DAY,
      volume: sd.volume,
      path: sd.path,
      blake3,
      audio_json: sd.audio ? JSON.stringify(sd.audio) : null,
      image_json: sd.image ? JSON.stringify(sd.image) : null,
    };
  });
}

const files: MockFile[] = buildFiles();
const scanListeners = new Set<(p: ScanProgress) => void>();
let scanTimer: ReturnType<typeof setInterval> | null = null;

function toHit(f: MockFile): Hit {
  return {
    id: f.id,
    name: f.name,
    size: f.size,
    volume_label: f.volume,
    ext: f.ext,
    mtime: f.mtime,
    path: f.path,
    blake3: f.blake3,
    audio_json: f.audio_json,
    image_json: f.image_json,
  };
}

function volumeSummaries(): VolumeSummary[] {
  const map = new Map<string, VolumeSummary>();
  const order: string[] = [];
  for (const f of files) {
    if (!map.has(f.volume)) {
      order.push(f.volume);
      map.set(f.volume, {
        label: f.volume,
        serial: `SER-${f.volume.slice(0, 3).toUpperCase()}-${100 + order.length}`,
        indexed_at: NOW - order.length * DAY,
        file_count: 0,
        total_size: 0,
      });
    }
    const v = map.get(f.volume)!;
    v.file_count += 1;
    v.total_size += f.size;
  }
  return order.map((l) => map.get(l)!).reverse();
}

interface MockArgs {
  dbPath?: string;
  raw?: string;
  limit?: number;
  file_id?: number;
  root?: string;
  label?: string;
  out_path?: string | null;
}

/** Mock implementation of every Tauri command the UI calls. */
export function mockCall<T>(cmd: string, args: MockArgs = {}): Promise<T> {
  const raw = (args.raw ?? "").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const terms = tokens
    .filter((t) => !/^\*\./.test(t) && !/^ext:/i.test(t) && !/^size:[<>=]/i.test(t) && !/^volume:/i.test(t))
    .map((t) => t.replaceAll("*", "").replaceAll('"', "").toLowerCase())
    .filter(Boolean);
  const exts: string[] = [];
  const sizes: Array<[string, number]> = [];
  let volume: string | null = null;
  for (const t of tokens) {
    const low = t.toLowerCase();
    if (low.startsWith("*.")) exts.push(low.slice(2));
    else if (low.startsWith("ext:")) {
      const inner = low.startsWith("ext:{") ? low.slice(5, -1) : low.slice(4);
      for (const p of inner.split(",")) if (p) exts.push(p.replace(/^\./, ""));
    } else if (low.startsWith("size:")) {
      const m = low.slice(5).match(/^([<>]=?)?(\d+)(kb|mb|gb)?$/);
      if (m) {
        const mult = m[3] === "gb" ? 1024 ** 3 : m[3] === "mb" ? 1024 ** 2 : m[3] === "kb" ? 1024 : 1;
        sizes.push([m[1] ?? "=", Number(m[2]) * mult]);
      }
    } else if (low.startsWith("volume:")) volume = t.slice(7).replace(/^"|"$/g, "");
  }

  const delay = <X,>(v: X): Promise<X> => new Promise((r) => setTimeout(() => r(v), 60));

  switch (cmd) {
    case "search": {
      const rows = files.filter((f) => {
        if (terms.length > 0 && !terms.every((t) => f.name.toLowerCase().includes(t))) return false;
        if (exts.length > 0 && !(f.ext && exts.includes(f.ext.toLowerCase()))) return false;
        for (const [op, v] of sizes) {
          if (op === ">" && !(f.size > v)) return false;
          if (op === ">=" && !(f.size >= v)) return false;
          if (op === "<" && !(f.size < v)) return false;
          if (op === "<=" && !(f.size <= v)) return false;
          if (op === "=" && f.size !== v) return false;
        }
        if (volume && f.volume !== volume) return false;
        return terms.length > 0 || exts.length > 0 || sizes.length > 0 || volume !== null;
      });
      return delay(rows.slice(0, args.limit ?? 200).map(toHit) as T);
    }
    case "list_volumes":
      return delay(volumeSummaries() as T);
    case "list_duplicates": {
      const groups = new Map<string, DuplicateGroup>();
      for (const f of files) {
        if (!f.blake3) continue;
        const g = groups.get(f.blake3);
        if (g) {
          g.count += 1;
          g.sample_name = g.sample_name < f.name ? g.sample_name : f.name;
        } else {
          groups.set(f.blake3, { blake3: f.blake3, size: f.size, count: 1, sample_name: f.name });
        }
      }
      return delay([...groups.values()].filter((g) => g.count > 1).slice(0, args.limit ?? 100) as T);
    }
    case "file_duplicates": {
      const f = files.find((x) => x.id === args.file_id);
      const rows: FileDuplicate[] =
        f && f.blake3
          ? files
              .filter((x) => x.blake3 === f.blake3 && x.id !== f.id)
              .map((x) => ({ id: x.id, name: x.name, size: x.size, volume_label: x.volume, path: x.path }))
          : [];
      return delay(rows as T);
    }
    case "export_csv":
    case "export_json":
    case "export_html": {
      const suffix = cmd.split("_")[1];
      return delay(`/tmp/catalogo-demo-export.${suffix}` as T);
    }
    case "scan_volume": {
      const label = args.label ?? "USB-Nuevo";
      if (!files.some((f) => f.volume === label)) {
        const base = files.length;
        for (let i = 0; i < 42; i++) {
          files.push({
            id: base + i + 1,
            name: `archivo-recuperado-${String(i + 1).padStart(3, "0")}.docx`,
            ext: "docx",
            size: 120_000 + i * 54_321,
            mtime: NOW - i * DAY,
            volume: label,
            path: "/Documentos recuperados",
            blake3: null,
            audio_json: null,
            image_json: null,
          });
        }
      }
      const total = 42;
      let seen = 0;
      return new Promise((resolve) => {
        if (scanTimer) clearInterval(scanTimer);
        scanTimer = setInterval(() => {
          seen += Math.ceil(total / 12);
          const done = seen >= total;
          const p: ScanProgress = {
            phase: done ? "index" : "walk",
            files_seen: Math.min(seen, total),
            bytes_seen: Math.min(seen, total) * 1_204_112,
          };
          for (const l of scanListeners) l(p);
          if (done) {
            if (scanTimer) clearInterval(scanTimer);
            scanTimer = null;
            setTimeout(() => resolve(total as T), 350);
          }
        }, 160);
      });
    }
    case "cancel_scan": {
      if (scanTimer) clearInterval(scanTimer);
      scanTimer = null;
      return delay(undefined as T);
    }
    default:
      return Promise.reject(new Error(`comando no disponible en modo demo: ${cmd}`));
  }
}

export function onScanProgress(cb: (p: ScanProgress) => void): () => void {
  scanListeners.add(cb);
  return () => scanListeners.delete(cb);
}
