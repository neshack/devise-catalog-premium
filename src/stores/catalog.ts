import { create } from "zustand";
import { call, onScanProgress, resolveDbPath } from "../lib/ipc";
import type {
  DuplicateGroup,
  ExportFormat,
  FileDuplicate,
  Hit,
  SortDir,
  SortKey,
  VolumeSummary,
} from "../lib/types";

export type View = "results" | "duplicates";
export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ScanState {
  running: boolean;
  phase: "walk" | "index" | null;
  filesSeen: number;
  bytesSeen: number;
  error: string | null;
  lastCount: number | null;
}

interface CatalogState {
  dbPath: string;
  volumes: VolumeSummary[];
  volumesError: string | null;

  query: string;
  hits: Hit[];
  searchStatus: "idle" | "searching" | "error";
  searchedFor: string;
  elapsedMs: number | null;

  selected: Hit | null;
  fileDups: FileDuplicate[];
  fileDupsLoading: boolean;

  view: View;
  volumeFilter: string | null;
  sortKey: SortKey;
  sortDir: SortDir;

  dupGroups: DuplicateGroup[];
  dupLoading: boolean;
  dupError: string | null;

  scan: ScanState;
  scanOpen: boolean;

  toasts: Toast[];

  init: () => Promise<void>;
  setQuery: (q: string) => void;
  runSearch: () => Promise<void>;
  refreshVolumes: () => Promise<void>;
  select: (h: Hit | null) => void;
  setView: (v: View) => void;
  setVolumeFilter: (label: string | null) => void;
  setSort: (key: SortKey, dir?: SortDir) => void;
  loadDuplicates: () => Promise<void>;
  setScanOpen: (open: boolean) => void;
  runScan: (root: string, label: string, serial: string) => Promise<void>;
  cancelScan: () => Promise<void>;
  runExport: (fmt: ExportFormat) => Promise<void>;
  pushToast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const useCatalog = create<CatalogState>((set, get) => ({
  dbPath: "",
  volumes: [],
  volumesError: null,

  query: "",
  hits: [],
  searchStatus: "idle",
  searchedFor: "",
  elapsedMs: null,

  selected: null,
  fileDups: [],
  fileDupsLoading: false,

  view: "results",
  volumeFilter: null,
  sortKey: "name",
  sortDir: "asc",

  dupGroups: [],
  dupLoading: false,
  dupError: null,

  scan: { running: false, phase: null, filesSeen: 0, bytesSeen: 0, error: null, lastCount: null },
  scanOpen: false,

  toasts: [],

  init: async () => {
    set({ dbPath: await resolveDbPath() });
    const off = await onScanProgress((p) =>
      set({ scan: { ...get().scan, running: true, phase: p.phase, filesSeen: p.files_seen, bytesSeen: p.bytes_seen } }),
    );
    void off; // unsubscribe handled by app lifetime (single-page session)
    await get().refreshVolumes();
  },

  setQuery: (query) => set({ query }),

  runSearch: async () => {
    const { query, volumeFilter } = get();
    const effective = volumeFilter ? `${query} volume:"${volumeFilter}"`.trim() : query.trim();
    if (effective === "") {
      set({ hits: [], searchedFor: "", searchStatus: "idle", elapsedMs: null, selected: null });
      return;
    }
    set({ searchStatus: "searching" });
    const t0 = performance.now();
    try {
      const rows = await call<Hit[]>("search", { dbPath: get().dbPath, raw: effective, limit: 200 });
      const elapsed = performance.now() - t0;
      // Ignore stale responses after rapid edits.
      if (get().query !== query || get().volumeFilter !== volumeFilter) return;
      set({
        hits: rows,
        searchStatus: "idle",
        searchedFor: effective,
        elapsedMs: elapsed,
        selected: null,
        fileDups: [],
      });
    } catch (e) {
      set({ searchStatus: "error", hits: [], fileDups: [] });
      get().pushToast("error", `Error al buscar: ${String(e)}`);
    }
  },

  refreshVolumes: async () => {
    try {
      const volumes = await call<VolumeSummary[]>("list_volumes", { dbPath: get().dbPath });
      set({ volumes, volumesError: null });
    } catch (e) {
      set({ volumesError: String(e) });
    }
  },

  select: (h) => {
    set({ selected: h, fileDups: [], fileDupsLoading: h !== null });
    if (h === null) return;
    void call<FileDuplicate[]>("file_duplicates", { dbPath: get().dbPath, file_id: h.id })
      .then((dups) => {
        if (get().selected?.id === h.id) set({ fileDups: dups, fileDupsLoading: false });
      })
      .catch(() => set({ fileDups: [], fileDupsLoading: false }));
  },

  setView: (view) => {
    set({ view });
    if (view === "duplicates" && get().dupGroups.length === 0 && !get().dupLoading) void get().loadDuplicates();
  },

  setVolumeFilter: (volumeFilter) => set({ volumeFilter }),

  setSort: (key, dir) =>
    set((s) => ({ sortKey: key, sortDir: dir ?? (s.sortKey === key && s.sortDir === "asc" ? "desc" : "asc") })),

  loadDuplicates: async () => {
    set({ dupLoading: true, dupError: null });
    try {
      const dupGroups = await call<DuplicateGroup[]>("list_duplicates", { dbPath: get().dbPath, limit: 100 });
      set({ dupGroups, dupLoading: false });
    } catch (e) {
      set({ dupError: String(e), dupLoading: false });
    }
  },

  setScanOpen: (scanOpen) => set({ scanOpen }),

  runScan: async (root, label, serial) => {
    set({ scan: { running: true, phase: "walk", filesSeen: 0, bytesSeen: 0, error: null, lastCount: null } });
    try {
      const total = await call<number>("scan_volume", {
        dbPath: get().dbPath,
        root,
        label,
        serial: serial || `AUTO-${Date.now()}`,
      });
      set({ scan: { ...get().scan, running: false, phase: null, lastCount: total } });
      await get().refreshVolumes();
      get().pushToast("success", `Escaneo completado: ${total} archivos procesados en «${label}».`);
    } catch (e) {
      set({ scan: { ...get().scan, running: false, phase: null, error: String(e) } });
      get().pushToast("error", `Error al escanear: ${String(e)}`);
    }
  },

  cancelScan: async () => {
    try {
      await call("cancel_scan");
      get().pushToast("info", "Cancelando escaneo…");
    } catch (e) {
      get().pushToast("error", `No se pudo cancelar: ${String(e)}`);
    }
  },

  runExport: async (fmt) => {
    try {
      const dest = await call<string>("export_" + fmt, { dbPath: get().dbPath, out_path: null });
      get().pushToast("success", `Catálogo exportado (${fmt.toUpperCase()}) → ${dest}`);
    } catch (e) {
      get().pushToast("error", `Error al exportar: ${String(e)}`);
    }
  },

  pushToast: (kind, text) =>
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id: toastSeq++, kind, text }] })),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Client-side sort applied to hits (backend returns relevance order). */
export function sortHits(
  hits: Hit[],
  key: SortKey,
  dir: SortDir,
): Hit[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...hits].sort((a, b) => {
    let c = 0;
    if (key === "size") c = a.size - b.size;
    else if (key === "mtime") c = a.mtime - b.mtime;
    else if (key === "volume") c = a.volume_label.localeCompare(b.volume_label, "es");
    else c = a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true });
    return c * mul || (a.id - b.id) * mul;
  });
}
