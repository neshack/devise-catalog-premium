/**
 * In-memory demo catalog used when the UI runs without the Tauri backend
 * (`npm run dev`, e2e). Mirrors the backend command semantics closely enough
 * to exercise every screen: search filters, duplicates, exports and scans.
 */
import type {
  DuplicateGroup,
  FileDuplicate,
  Hit,
  ScanOutcome,
  ScanProgress,
  ScanRun,
  TreeDir,
  TreeFile,
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
  container_path: string | null;
  tags: string[];
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
  /**
   * Mirrors `files.container_path`: the archive this entry lives inside,
   * relative to the volume root. `name` is then the path inside the archive.
   */
  container?: string;
  /** Direct tags; folder tags live in `dirTags`. */
  tags?: string[];
}

function seeds(): Seed[] {
  const s: Seed[] = [];
  const push = (seed: Seed) => s.push(seed);

  // ── Backup-12: documents, projects, VMs ──────────────────────────────
  const docs = ["informe-anual", "contrato-arrendamiento", "notas-reunion", "presupuesto", "manual-usuario", "factura-0142", "cv-actualizado", "tesis-borrador"];
  docs.forEach((d, i) =>
    push({ volume: "Backup-12", path: "/Documentos", name: `${d}.pdf`, ext: "pdf", size: 240_000 + i * 91_237, ageDays: 12 + i * 9, tags: ["documentos"] }),
  );
  ["fotos-vacaciones", "proyecto-web", "musica-importada", "backup-movil"].forEach((z, i) =>
    push({ volume: "Backup-12", path: "/Comprimidos", name: `${z}.zip`, ext: "zip", size: (i + 2) * 734_003_217, ageDays: 30 + i * 15 }),
  );
  // Contents of those archives: indexed without extracting, so the row name
  // is the entry's path inside the ZIP and no metadata is parsed for it.
  [
    { name: "DCIM/IMG_7001.jpg", size: 3_910_244, container: "Comprimidos/fotos-vacaciones.zip" },
    { name: "notas-de-viaje.txt", size: 8_412, container: "Comprimidos/fotos-vacaciones.zip" },
    { name: "src/components/Button.tsx", size: 2_048, container: "Comprimidos/proyecto-web.zip" },
    { name: "DCIM/IMG_9001.jpg", size: 4_112_088, container: "Comprimidos/backup-movil.zip" },
  ].forEach((entry, i) =>
    push({
      volume: "Backup-12",
      path: "/Comprimidos",
      name: entry.name,
      ext: entry.name.split(".").pop() ?? "txt",
      size: entry.size,
      ageDays: 30 + i * 5,
      container: entry.container,
    }),
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
        tags: ["música"],
      });
      push({
        volume: "Música-90s",
        path: `/Musica/${album}/mp3`,
        name: `${String(i + 1).padStart(2, "0")}-${t.trim()}.mp3`,
        ext: "mp3",
        size: 6_400_000 + i * 812_311,
        ageDays: 380 + i * 3,
        audio: { artist, album, bitrate: 320 },
        tags: ["música"],
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
      tags: ["vacaciones"],
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
    // Container entries are never hashed on disk, same as the scanner.
    if (sd.container === undefined && sd.ext !== "m3u" && !sd.name.endsWith(".txt")) {
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
      container_path: sd.container ?? null,
      tags: sd.tags ?? [],
    };
  });
}

const files: MockFile[] = buildFiles();
const scanListeners = new Set<(p: ScanProgress) => void>();
let scanTimer: ReturnType<typeof setInterval> | null = null;
// Demo bookkeeping so the strip behaves like the real thing: a pause that
// keeps beating, a run that survives in the catalog, a cancel that closes it.
let scanPaused = false;
let scanProgress: ScanProgress | null = null;
let scanFinish: ((outcome: ScanOutcome) => void) | null = null;
// The demo's catalog lives in localStorage, so reloading the page mid-scan
// leaves the same evidence a killed app leaves behind.
const DEMO_RUN_KEY = "devise-catalog-demo-run";

function loadDemoRun(): ScanRun | null {
  try {
    const raw = localStorage.getItem(DEMO_RUN_KEY);
    return raw === null ? null : (JSON.parse(raw) as ScanRun);
  } catch {
    return null;
  }
}

function saveDemoRun(run: ScanRun | null): void {
  try {
    if (run === null) localStorage.removeItem(DEMO_RUN_KEY);
    else localStorage.setItem(DEMO_RUN_KEY, JSON.stringify(run));
  } catch {
    // Modo privado sin almacenamiento: el demo sigue, sólo no recuerda.
  }
}

function setRun(run: ScanRun | null): void {
  lastRun = run;
  saveDemoRun(run);
}

let lastRun: ScanRun | null = loadDemoRun();

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
    container_path: f.container_path,
  };
}

// Stable demo identities: deleting one volume must not renumber or rename the
// rest mid-session.
const volumeSerials = new Map<string, string>();
const volumeIds = new Map<string, number>();
const volumeMeta = new Map<
  string,
  {
    description: string | null;
    cover: string | null;
    media_kind: string | null;
    indicator_colors: string | null;
  }
>([
  // Demo material: the fictional volumes say what they hold.
  [
    "Fotos-2024",
    {
      description: "Fotos familiares y viajes, 2024",
      cover: null,
      media_kind: "card",
      indicator_colors: '["#35c6d6"]',
    },
  ],
  [
    "Música-90s",
    {
      description: "Discos de los 90 y MP3 sueltos",
      cover: null,
      media_kind: "optical",
      indicator_colors: '["#ff4d6d","#ffb02e"]',
    },
  ],
  [
    "Backup-12",
    {
      description: "Documentos, proyectos y copias",
      cover: null,
      media_kind: "external",
      indicator_colors: '["#8fd96a"]',
    },
  ],
]);
let nextVolumeId = 1;

function demoVolumeIdentity(label: string): { serial: string; id: number } {
  let serial = volumeSerials.get(label);
  if (serial === undefined) {
    serial = `SER-${label.slice(0, 3).toUpperCase()}-${100 + volumeSerials.size + 1}`;
    volumeSerials.set(label, serial);
  }
  const key = `${label}\u0000${serial}`;
  let id = volumeIds.get(key);
  if (id === undefined) {
    id = nextVolumeId++;
    volumeIds.set(key, id);
  }
  return { serial, id };
}

function volumeSummaries(): VolumeSummary[] {
  const map = new Map<string, VolumeSummary>();
  const order: string[] = [];
  for (const f of files) {
    if (!map.has(f.volume)) {
      order.push(f.volume);
      const identity = demoVolumeIdentity(f.volume);
      const meta = volumeMeta.get(f.volume);
      map.set(f.volume, {
        id: identity.id,
        label: f.volume,
        serial: identity.serial,
        indexed_at: NOW - order.length * DAY,
        file_count: 0,
        total_size: 0,
        description: meta?.description ?? null,
        cover: meta?.cover ?? null,
        media_kind: meta?.media_kind ?? null,
        indicator_colors: meta?.indicator_colors ?? null,
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
  fileId?: number;
  root?: string;
  label?: string;
  serial?: string;
  volumeSerial?: string | null;
  volume_serial?: string | null;
  volume?: string;
  volume_id?: number;
  volumeId?: number;
  dirId?: number;
  dir_id?: number;
  name?: string;
  parent?: number | null;
  out_path?: string | null;
  outPath?: string | null;
  description?: string | null;
  cover?: string | null;
  media_kind?: string | null;
  mediaKind?: string | null;
  indicator_colors?: string[] | null;
  indicatorColors?: string[] | null;
  generated?: string;
}

interface MockLevel {
  dirs: TreeDir[];
  files: TreeFile[];
}

/**
 * One volume's levels, built from the demo files the same way the scanner's
 * dirs table holds them: direct children per folder, direct counts per folder.
 */
// Folder tags live by volume+path; the demo has no database ids to key them.
const dirTags = new Map<string, string[]>([
  ["Fotos-2024\u0000/2024/07-vacaciones", ["playa"]],
  ["Música-90s\u0000/Musica/Nevermind-1991", ["grunge"]],
]);

function dirTagKey(volume: string, path: string): string {
  return `${volume}\u0000${path}`;
}

let nextTreeDirId = 1;

function buildTreeLevels(volumeLabel: string) {
  const mine = files.filter((f) => f.volume === volumeLabel);
  const dirPaths = new Set<string>();
  for (const f of mine) {
    let p = f.path === "/" ? "" : f.path;
    while (p !== "") {
      dirPaths.add(p);
      const cut = p.lastIndexOf("/");
      p = cut <= 0 ? "" : p.slice(0, cut);
    }
  }
  const byPath = new Map<string, MockLevel>();
  const pathOfId = new Map<number, string>();
  const levelAt = (p: string): MockLevel => {
    const found = byPath.get(p);
    if (found !== undefined) return found;
    const fresh: MockLevel = { dirs: [], files: [] };
    byPath.set(p, fresh);
    return fresh;
  };
  levelAt("");
  for (const p of [...dirPaths].sort()) {
    const cut = p.lastIndexOf("/");
    const parent = cut <= 0 ? "" : p.slice(0, cut);
    const id = nextTreeDirId++;
    pathOfId.set(id, p);
    levelAt(parent).dirs.push({
      id,
      name: p.slice(cut + 1),
      files: 0,
      dirs: 0,
      size: 0,
      tags: dirTags.get(dirTagKey(volumeLabel, p)) ?? [],
    });
  }
  for (const f of mine) {
    levelAt(f.path === "/" ? "" : f.path).files.push({
      id: f.id,
      name: f.name,
      ext: f.ext,
      size: f.size,
      mtime: f.mtime,
      container_path: f.container_path,
      tags: f.tags,
    });
  }
  for (const [p, level] of byPath) {
    for (const dir of level.dirs) {
      const own = byPath.get(pathOfId.get(dir.id) ?? p);
      if (own === undefined) continue;
      dir.files = own.files.length;
      dir.dirs = own.dirs.length;
      dir.size = own.files.reduce((sum, f) => sum + f.size, 0);
    }
    level.dirs.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    level.files.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  }
  return { byPath, pathOfId };
}

const treeLevels = new Map<string, ReturnType<typeof buildTreeLevels>>();

function findMockDir(id: number): { volume: string; path: string } | null {
  for (const summary of volumeSummaries()) {
    let built = treeLevels.get(summary.label);
    if (built === undefined) {
      built = buildTreeLevels(summary.label);
      treeLevels.set(summary.label, built);
    }
    for (const [dirId, path] of built.pathOfId) {
      if (dirId === id) return { volume: summary.label, path };
    }
  }
  return null;
}

function normalizeMockTag(name: string): string {
  return name.trim().replace(/^#/, "").trim();
}

function sortedTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function allMockTags(): string[] {
  const found = new Set<string>();
  for (const file of files) for (const tag of file.tags) found.add(tag);
  for (const tags of dirTags.values()) for (const tag of tags) found.add(tag);
  return sortedTags([...found]);
}

/** Mock implementation of every Tauri command the UI calls. */
export function mockCall<T>(cmd: string, args: MockArgs = {}): Promise<T> {
  const raw = (args.raw ?? "").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const terms = tokens
    .filter(
      (t) =>
        !/^\*\./.test(t) &&
        !/^ext:/i.test(t) &&
        !/^size:[<>=]/i.test(t) &&
        !/^volume:/i.test(t) &&
        !/^tag:/i.test(t) &&
        !t.startsWith("#"),
    )
    .map((t) => t.replaceAll("*", "").replaceAll('"', "").toLowerCase())
    .filter(Boolean);
  const exts: string[] = [];
  const sizes: Array<[string, number]> = [];
  const tags: string[] = [];
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
    else if (low.startsWith("tag:")) tags.push(t.slice(4).replace(/^"|"$/g, ""));
    else if (t.startsWith("#")) tags.push(t.slice(1).replace(/^"|"$/g, ""));
  }

  const delay = <X,>(v: X): Promise<X> => new Promise((r) => setTimeout(() => r(v), 60));

  switch (cmd) {
    case "search": {
      const byLabel = new Map(volumeSummaries().map((v) => [v.label, v.serial]));
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
        const serialFilter = args.volume_serial ?? args.volumeSerial;
        if (serialFilter !== null && serialFilter !== undefined) {
          if ((byLabel.get(f.volume) ?? null) !== serialFilter) return false;
        }
        if (tags.length > 0) {
          const available = new Set(f.tags.map((tag) => tag.toLowerCase()));
          let p = f.path === "/" ? "" : f.path;
          while (p !== "") {
            for (const tag of dirTags.get(dirTagKey(f.volume, p)) ?? []) {
              available.add(tag.toLowerCase());
            }
            const cut = p.lastIndexOf("/");
            p = cut <= 0 ? "" : p.slice(0, cut);
          }
          for (const tag of dirTags.get(dirTagKey(f.volume, "")) ?? []) {
            available.add(tag.toLowerCase());
          }
          if (!tags.every((tag) => available.has(tag.toLowerCase()))) return false;
        }
        return (
          terms.length > 0 ||
          exts.length > 0 ||
          sizes.length > 0 ||
          volume !== null ||
          tags.length > 0
        );
      });
      return delay(rows.slice(0, args.limit ?? 200).map(toHit) as T);
    }
    case "list_volumes":
      return delay(volumeSummaries() as T);
    case "set_volume_description": {
      const id = args.volume_id ?? args.volumeId;
      const volume = volumeSummaries().find((v) => v.id === id);
      if (volume === undefined) return Promise.reject(new Error("el volumen ya no existe en el catálogo"));
      const text = String(args.description ?? "").trim();
      volumeMeta.set(volume.label, {
        description: text === "" ? null : text,
        cover: volumeMeta.get(volume.label)?.cover ?? null,
        media_kind: volumeMeta.get(volume.label)?.media_kind ?? null,
        indicator_colors: volumeMeta.get(volume.label)?.indicator_colors ?? null,
      });
      return delay(undefined as T);
    }
    case "set_volume_cover": {
      const id = args.volume_id ?? args.volumeId;
      const volume = volumeSummaries().find((v) => v.id === id);
      if (volume === undefined) return Promise.reject(new Error("el volumen ya no existe en el catálogo"));
      volumeMeta.set(volume.label, {
        description: volumeMeta.get(volume.label)?.description ?? null,
        cover: typeof args.cover === "string" ? args.cover : null,
        media_kind: volumeMeta.get(volume.label)?.media_kind ?? null,
        indicator_colors: volumeMeta.get(volume.label)?.indicator_colors ?? null,
      });
      return delay(undefined as T);
    }
    case "set_volume_identity": {
      const id = args.volume_id ?? args.volumeId;
      const volume = volumeSummaries().find((v) => v.id === id);
      if (volume === undefined) return Promise.reject(new Error("el volumen ya no existe en el catálogo"));
      const kind = args.media_kind ?? args.mediaKind ?? null;
      const colors = args.indicator_colors ?? args.indicatorColors ?? null;
      volumeMeta.set(volume.label, {
        description: volumeMeta.get(volume.label)?.description ?? null,
        cover: volumeMeta.get(volume.label)?.cover ?? null,
        media_kind: kind === "" ? null : kind,
        indicator_colors:
          colors === null || colors.length === 0 ? null : JSON.stringify(colors.slice(0, 2)),
      });
      return delay(undefined as T);
    }
    case "delete_volume": {
      const id = args.volume_id ?? args.volumeId;
      const volume = volumeSummaries().find((v) => v.id === id);
      if (volume === undefined) return Promise.reject(new Error("el volumen ya no existe en el catálogo"));
      for (let i = files.length - 1; i >= 0; i--) {
        if (files[i].volume === volume.label) files.splice(i, 1);
      }
      for (const key of [...dirTags.keys()]) {
        if (key.startsWith(`${volume.label}\u0000`)) dirTags.delete(key);
      }
      treeLevels.delete(volume.label);
      if (lastRun?.volume_label === volume.label) setRun(null);
      return delay(undefined as T);
    }
    case "file_tags": {
      const id = args.file_id ?? args.fileId;
      const file = files.find((f) => f.id === id);
      return delay(sortedTags(file?.tags ?? []) as T);
    }
    case "add_file_tag": {
      const id = args.file_id ?? args.fileId;
      const file = files.find((f) => f.id === id);
      const tag = normalizeMockTag(String(args.name ?? ""));
      if (file !== undefined && tag !== "" && !file.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        file.tags.push(tag);
      }
      return delay(sortedTags(file?.tags ?? []) as T);
    }
    case "remove_file_tag": {
      const id = args.file_id ?? args.fileId;
      const file = files.find((f) => f.id === id);
      const tag = normalizeMockTag(String(args.name ?? "")).toLowerCase();
      if (file !== undefined) file.tags = file.tags.filter((t) => t.toLowerCase() !== tag);
      return delay(sortedTags(file?.tags ?? []) as T);
    }
    case "dir_tags": {
      const id = args.dir_id ?? args.dirId;
      const dir = id === undefined ? null : findMockDir(id);
      return delay(sortedTags(dir === null ? [] : (dirTags.get(dirTagKey(dir.volume, dir.path)) ?? [])) as T);
    }
    case "add_dir_tag": {
      const id = args.dir_id ?? args.dirId;
      const dir = id === undefined ? null : findMockDir(id);
      const tag = normalizeMockTag(String(args.name ?? ""));
      if (dir !== null && tag !== "") {
        const key = dirTagKey(dir.volume, dir.path);
        const current = dirTags.get(key) ?? [];
        if (!current.some((t) => t.toLowerCase() === tag.toLowerCase())) {
          dirTags.set(key, [...current, tag]);
          const built = treeLevels.get(dir.volume);
          const level = built?.byPath.get(dir.path);
          if (level !== undefined) {
            const node = level.dirs.find((d) => d.id === id);
            if (node !== undefined) node.tags = sortedTags([...node.tags, tag]);
          }
        }
      }
      return delay(sortedTags(dir === null ? [] : (dirTags.get(dirTagKey(dir.volume, dir.path)) ?? [])) as T);
    }
    case "remove_dir_tag": {
      const id = args.dir_id ?? args.dirId;
      const dir = id === undefined ? null : findMockDir(id);
      const tag = normalizeMockTag(String(args.name ?? "")).toLowerCase();
      if (dir !== null) {
        const key = dirTagKey(dir.volume, dir.path);
        dirTags.set(
          key,
          (dirTags.get(key) ?? []).filter((t) => t.toLowerCase() !== tag),
        );
        const built = treeLevels.get(dir.volume);
        const level = built?.byPath.get(dir.path);
        if (level !== undefined) {
          const node = level.dirs.find((d) => d.id === id);
          if (node !== undefined) node.tags = node.tags.filter((t) => t.toLowerCase() !== tag);
        }
      }
      return delay(sortedTags(dir === null ? [] : (dirTags.get(dirTagKey(dir.volume, dir.path)) ?? [])) as T);
    }
    case "list_tags":
      return delay(allMockTags() as T);
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
      const f = files.find((x) => x.id === (args.file_id ?? args.fileId));
      const rows: FileDuplicate[] =
        f && f.blake3
          ? files
              .filter((x) => x.blake3 === f.blake3 && x.id !== f.id)
              .map((x) => ({ id: x.id, name: x.name, size: x.size, volume_label: x.volume, path: x.path }))
          : [];
      return delay(rows as T);
    }
    case "get_hit": {
      const id = args.file_id ?? args.fileId;
      const row = id === undefined ? null : files.find((x) => x.id === id) ?? null;
      return delay((row ? toHit(row) : null) as T);
    }
    case "export_csv":
    case "export_json":
    case "export_html": {
      const suffix = cmd.split("_")[1];
      const id = args.volume_id ?? args.volumeId;
      const volume =
        id === undefined || id === null ? null : volumeSummaries().find((v) => v.id === id) ?? null;
      const name =
        volume === null
          ? `catalogo-demo-export.${suffix}`
          : `${volume.label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-demo-export.${suffix}`;
      return delay(`/tmp/${name}` as T);
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
            container_path: null,
            tags: [],
          });
        }
      }
      const total = 42;
      const bytesTotal = total * 1_204_112;
      const runId = (lastRun?.id ?? 0) + 1;
      const root = String(args.root ?? "/media/demo");
      const volumeId = demoVolumeIdentity(label).id;
      let seen = 0;
      scanPaused = false;
      // The row exists before the first file is read, exactly like the real
      // one: it is what makes an interruption visible in the demo too.
      setRun({
        id: runId,
        volume_id: 99,
        volume_label: label,
        volume_serial: "DEMO",
        root,
        state: "running",
        phase: "walk",
        files_seen: 0,
        bytes_seen: 0,
        files_total: total,
        bytes_total: bytesTotal,
        current_path: null,
        error_count: 0,
        error: null,
        started_at: Math.floor(Date.now() / 1000),
        heartbeat_at: Math.floor(Date.now() / 1000),
      });
      return new Promise((resolve) => {
        if (scanTimer) clearInterval(scanTimer);
        scanFinish = (outcome) => {
          if (scanTimer) clearInterval(scanTimer);
          scanTimer = null;
          scanFinish = null;
          resolve(outcome as T);
        };
        scanTimer = setInterval(() => {
          if (scanPaused) {
            // A paused scan keeps saying so, exactly like the real one does.
            if (scanProgress) for (const l of scanListeners) l({ ...scanProgress, state: "paused" });
            return;
          }
          seen += Math.ceil(total / 12);
          const filesSeen = Math.min(seen, total);
          const done = filesSeen >= total;
          scanProgress = {
            run_id: runId,
            phase: done ? "index" : "walk",
            state: done ? "completed" : "running",
            files_seen: filesSeen,
            bytes_seen: filesSeen * 1_204_112,
            files_total: total,
            bytes_total: bytesTotal,
            current_path: done
              ? null
              : `/Documentos recuperados/archivo-recuperado-${String(filesSeen).padStart(3, "0")}.docx`,
            error_count: 0,
            bytes_per_sec: 7_400_000,
            eta_secs: done ? null : Math.max(1, Math.ceil(((total - filesSeen) / total) * 5)),
          };
          for (const l of scanListeners) l(scanProgress);
          if (lastRun !== null) {
            setRun({
              ...lastRun,
              phase: scanProgress.phase,
              files_seen: filesSeen,
              bytes_seen: scanProgress.bytes_seen,
              current_path: scanProgress.current_path,
              heartbeat_at: Math.floor(Date.now() / 1000),
            });
          }
          if (done) {
            setRun({
              id: runId,
              volume_id: 99,
              volume_label: label,
              volume_serial: "DEMO",
              root,
              state: "completed",
              phase: "done",
              files_seen: total,
              bytes_seen: bytesTotal,
              files_total: total,
              bytes_total: bytesTotal,
              current_path: null,
              error_count: 0,
              error: null,
              started_at: Math.floor(Date.now() / 1000),
              heartbeat_at: Math.floor(Date.now() / 1000),
            });
            setTimeout(
              () =>
                scanFinish?.({
                  run_id: runId,
                  volume_id: volumeId,
                  files_seen: total,
                  state: "completed",
                }),
              350,
            );
          }
        }, 160);
      });
    }
    case "cancel_scan": {
      if (scanProgress) {
        if (lastRun !== null) setRun({ ...lastRun, state: "cancelled" });
        for (const l of scanListeners) l({ ...scanProgress, state: "cancelled" });
        scanFinish?.({
          run_id: scanProgress.run_id,
          volume_id: demoVolumeIdentity(String(lastRun?.volume_label ?? "")).id,
          files_seen: scanProgress.files_seen,
          state: "cancelled",
        });
      }
      if (scanTimer) clearInterval(scanTimer);
      scanTimer = null;
      return delay(undefined as T);
    }
    case "pause_scan": {
      scanPaused = scanTimer !== null;
      return delay(undefined as T);
    }
    case "resume_scan": {
      scanPaused = false;
      if (scanTimer !== null) return delay(false as T);
      // Nothing live to unpause: a dead run has to be walked again, which is
      // what the real resume does when the process that started it is gone.
      if (lastRun !== null && lastRun.state !== "completed" && lastRun.state !== "cancelled") {
        return mockCall("scan_volume", {
          root: lastRun.root,
          label: lastRun.volume_label,
          serial: lastRun.volume_serial,
        }) as Promise<T>;
      }
      return delay(false as T);
    }
    case "scan_status": {
      return delay({
        live: scanTimer !== null ? (scanPaused ? "paused" : "running") : "idle",
        run: lastRun,
      } as T);
    }
    case "tree_children": {
      const volume = String(args.volume ?? "");
      let built = treeLevels.get(volume);
      if (built === undefined) {
        built = buildTreeLevels(volume);
        treeLevels.set(volume, built);
      }
      const path = args.parent === null || args.parent === undefined ? "" : (built.pathOfId.get(args.parent) ?? "");
      const level = built.byPath.get(path) ?? { dirs: [], files: [] };
      return delay({
        dirs: level.dirs,
        files: level.files,
        files_total: level.files.length,
        dirs_total: level.dirs.length,
      } as T);
    }
    case "tree_path": {
      const id = args.file_id ?? args.fileId;
      const file = files.find((f) => f.id === id);
      if (file === undefined) return delay(null as T);
      const summary = volumeSummaries().find((v) => v.label === file.volume);
      if (summary === undefined) return delay(null as T);
      let built = treeLevels.get(file.volume);
      if (built === undefined) {
        built = buildTreeLevels(file.volume);
        treeLevels.set(file.volume, built);
      }
      const pathToId = new Map<string, number>();
      for (const [dirId, path] of built.pathOfId) pathToId.set(path, dirId);
      const chain: string[] = [];
      let p = file.path === "/" ? "" : file.path;
      while (p !== "") {
        chain.push(p);
        const cut = p.lastIndexOf("/");
        p = cut <= 0 ? "" : p.slice(0, cut);
      }
      chain.reverse();
      const dirIds = [0, ...chain.map((path) => pathToId.get(path)).filter((v): v is number => v !== undefined)];
      return delay({
        volume_label: summary.label,
        volume_serial: summary.serial,
        dir_ids: dirIds,
        file_id: file.id,
      } as T);
    }
    case "recover_stale_scans": {
      // A run still marked live when the page reloads belongs to a session
      // that is gone: the demo says so instead of pretending it never ran.
      if (lastRun !== null && lastRun.state === "running") {
        setRun({ ...lastRun, state: "interrupted" });
        return delay(1 as T);
      }
      return delay(0 as T);
    }
    default:
      return Promise.reject(new Error(`comando no disponible en modo demo: ${cmd}`));
  }
}

export function onScanProgress(cb: (p: ScanProgress) => void): () => void {
  scanListeners.add(cb);
  return () => scanListeners.delete(cb);
}
