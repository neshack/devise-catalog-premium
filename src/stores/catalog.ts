import { create } from "zustand";
import { formatCount } from "../lib/format";
import { call, onScanProgress, resolveDbPath } from "../lib/ipc";
import type {
  DuplicateGroup,
  ExportFormat,
  FileDuplicate,
  Hit,
  ScanEventState,
  ScanOutcome,
  ScanRun,
  ScanStatus,
  SortDir,
  SortKey,
  TreeChildren,
  VolumeSummary,
} from "../lib/types";
import { SCAN_DONE_STATES } from "../lib/types";
import { TREE_ROOT } from "../lib/tree";

export type View = "results" | "duplicates" | "tree";
export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

/** The explorer: what has been read, and which folders are open. */
interface TreeState {
  /** Folder being fetched right now, by cache key. */
  loading: string | null;
  /** Children by parent key ({@link TREE_ROOT} or a folder id as a string). */
  children: Record<string, TreeChildren>;
  /** Open folders, by cache key. */
  expanded: string[];
  error: string | null;
}

const EMPTY_TREE: TreeState = { loading: null, children: {}, expanded: [], error: null };

interface ScanState {
  /** True while this process is walking or indexing. */
  running: boolean;
  /** What the scan is doing right now, or how the last one ended. */
  state: ScanEventState;
  phase: "walk" | "index" | null;
  filesSeen: number;
  bytesSeen: number;
  /** Estimated while walking, exact while indexing. */
  filesTotal: number | null;
  bytesTotal: number | null;
  /** Where the walk is right now: the answer to "dónde se quedó". */
  currentPath: string | null;
  errorCount: number;
  bytesPerSec: number | null;
  etaSecs: number | null;
  error: string | null;
  lastCount: number | null;
  /** The last attempt as the catalog remembers it, dead or alive. */
  run: ScanRun | null;
}

const IDLE_SCAN: ScanState = {
  running: false,
  state: "idle",
  phase: null,
  filesSeen: 0,
  bytesSeen: 0,
  filesTotal: null,
  bytesTotal: null,
  currentPath: null,
  errorCount: 0,
  bytesPerSec: null,
  etaSecs: null,
  error: null,
  lastCount: null,
  run: null,
};

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
  volumeFilter: { label: string; serial: string } | null;
  sortKey: SortKey;
  sortDir: SortDir;

  dupGroups: DuplicateGroup[];
  dupLoading: boolean;
  dupError: string | null;

  tree: TreeState;

  scan: ScanState;
  scanOpen: boolean;

  toasts: Toast[];

  init: () => Promise<void>;
  setQuery: (q: string) => void;
  runSearch: () => Promise<void>;
  refreshVolumes: () => Promise<void>;
  select: (h: Hit | null) => void;
  setView: (v: View) => void;
  setVolumeFilter: (volume: { label: string; serial: string } | null) => void;
  /** Read (or re-read) the top level of the volume the tree is showing. */
  loadTree: () => Promise<void>;
  /** Open a folder, reading it the first time; close it when already open. */
  toggleTreeDir: (key: string, dirId: number) => Promise<void>;
  /**
   * Select a tree file without leaving the tree view.
   *
   * The inspector reads `Hit`, so the store resolves the row by id first.
   */
  selectTreeFile: (fileId: number) => Promise<void>;
  setSort: (key: SortKey, dir?: SortDir) => void;
  loadDuplicates: () => Promise<void>;
  setScanOpen: (open: boolean) => void;
  runScan: (root: string, label: string, serial: string) => Promise<void>;
  cancelScan: () => Promise<void>;
  pauseScan: () => Promise<void>;
  /** Continue where the last attempt stopped: unpause, or restart the walk. */
  resumeScan: () => Promise<void>;
  /** Re-read what the catalog remembers, after sweeping runs of dead processes. */
  refreshScan: () => Promise<void>;
  /** Close the books on a scan that ended on its own. */
  finishScan: (state: ScanEventState, filesSeen: number, errorCount: number) => Promise<void>;
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

  view: "tree",
  volumeFilter: null,
  sortKey: "name",
  sortDir: "asc",

  dupGroups: [],
  dupLoading: false,
  dupError: null,

  tree: EMPTY_TREE,

  scan: IDLE_SCAN,
  scanOpen: false,

  toasts: [],

  init: async () => {
    set({ dbPath: await resolveDbPath() });
    const off = await onScanProgress((p) => {
      const terminal = SCAN_DONE_STATES.includes(p.state);
      set((s) => ({
        scan: {
          ...s.scan,
          running: !terminal && p.state !== "idle",
          state: p.state,
          phase: p.phase,
          filesSeen: p.files_seen,
          bytesSeen: p.bytes_seen,
          filesTotal: p.files_total,
          bytesTotal: p.bytes_total,
          currentPath: p.current_path,
          errorCount: p.error_count,
          bytesPerSec: p.bytes_per_sec,
          etaSecs: p.eta_secs,
        },
      }));
      // The scan is the only thing that ends without the UI asking, so the
      // story of its ending (and the volumes it changed) is told from here.
      if (terminal) void get().finishScan(p.state, p.files_seen, p.error_count);
    });
    void off; // unsubscribe handled by app lifetime (single-page session)
    await get().refreshVolumes();
    await get().refreshScan();
  },

  setQuery: (query) => set({ query }),

  runSearch: async () => {
    const { query, volumeFilter } = get();
    const effective = volumeFilter ? `${query} volume:"${volumeFilter.label}"`.trim() : query.trim();
    if (effective === "") {
      set({ hits: [], searchedFor: "", searchStatus: "idle", elapsedMs: null, selected: null });
      return;
    }
    set({ searchStatus: "searching" });
    const t0 = performance.now();
    try {
      const rows = await call<Hit[]>("search", {
        dbPath: get().dbPath,
        raw: effective,
        limit: 200,
        volume_serial: volumeFilter?.serial ?? null,
      });
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

  setVolumeFilter: (volumeFilter) => {
    // Levels read from another volume would be wrong here: a folder id only
    // means something inside its own tree.
    const prev = get().volumeFilter;
    const changed =
      prev?.label !== volumeFilter?.label || prev?.serial !== volumeFilter?.serial;
    if (changed) set({ volumeFilter, tree: EMPTY_TREE, view: "tree" });
  },

  loadTree: async () => {
    const volume = get().volumeFilter;
    if (volume === null) {
      set({ tree: EMPTY_TREE });
      return;
    }
    set({ tree: { ...EMPTY_TREE, loading: TREE_ROOT } });
    try {
      const children = await call<TreeChildren>("tree_children", {
        dbPath: get().dbPath,
        volume: volume.label,
        serial: volume.serial,
        parent: null,
      });
      set({ tree: { loading: null, children: { [TREE_ROOT]: children }, expanded: [], error: null } });
    } catch (e) {
      set({ tree: { ...EMPTY_TREE, error: String(e) } });
    }
  },

  toggleTreeDir: async (key, dirId) => {
    const { tree, volumeFilter } = get();
    const { expanded } = tree;
    if (expanded.includes(key)) {
      set({ tree: { ...tree, expanded: expanded.filter((k: string) => k !== key) } });
      return;
    }
    if (tree.children[key] !== undefined) {
      set({ tree: { ...tree, expanded: [...expanded, key] } });
      return;
    }
    if (volumeFilter === null) return;
    set({ tree: { ...tree, loading: key, error: null } });
    try {
      const children = await call<TreeChildren>("tree_children", {
        dbPath: get().dbPath,
        volume: volumeFilter.label,
        serial: volumeFilter.serial,
        parent: dirId,
      });
      set((s) => ({
        tree: {
          ...s.tree,
          loading: null,
          children: { ...s.tree.children, [key]: children },
          expanded: [...s.tree.expanded, key],
        },
      }));
    } catch (e) {
      set((s) => ({ tree: { ...s.tree, loading: null, error: String(e) } }));
    }
  },

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
    set({ scan: { ...IDLE_SCAN, running: true, state: "running", phase: "walk" } });
    try {
      const outcome = await call<ScanOutcome>("scan_volume", {
        dbPath: get().dbPath,
        root,
        label,
        serial: serial || `AUTO-${Date.now()}`,
      });
      set({ scan: { ...get().scan, running: false, state: "idle", phase: null, lastCount: outcome.files_seen } });
      await get().refreshVolumes();
      await get().refreshScan();
    } catch (e) {
      set({ scan: { ...get().scan, running: false, state: "idle", phase: null, error: String(e) } });
      // The run row already knows more than this promise does (it may have
      // been cancelled or interrupted rather than failed).
      await get().refreshScan();
      get().pushToast("error", `Error al escanear: ${String(e)}`);
    }
  },

  pauseScan: async () => {
    try {
      await call("pause_scan", { dbPath: get().dbPath });
    } catch (e) {
      get().pushToast("error", `No se pudo pausar: ${String(e)}`);
    }
  },

  resumeScan: async () => {
    try {
      // Unpausing returns at once; restarting a dead run returns when the walk
      // it started is over, so both paths end with the same refresh.
      const restarted = await call<boolean>("resume_scan", { dbPath: get().dbPath });
      set({ scan: { ...get().scan, running: true, state: "running", error: null } });
      if (restarted) get().pushToast("info", "Reanudando el escaneo desde donde se quedó…");
      await get().refreshVolumes();
      await get().refreshScan();
    } catch (e) {
      get().pushToast("error", `No se pudo reanudar: ${String(e)}`);
    }
  },

  refreshScan: async () => {
    try {
      // A run that never beat again belongs to a process that is gone: close
      // it before reading, so what the strip shows is already the truth.
      await call("recover_stale_scans", { dbPath: get().dbPath });
      const status = await call<ScanStatus>("scan_status", { dbPath: get().dbPath });
      set((s) => ({ scan: { ...s.scan, run: status.run } }));
    } catch {
      // A catalog with no runs yet (or one just created) has nothing to say.
    }
  },

  finishScan: async (state, filesSeen, errorCount) => {
    await get().refreshVolumes();
    await get().refreshScan();
    if (state === "completed") {
      const tail =
        errorCount > 0 ? ` ${formatCount(errorCount)} rutas no se pudieron leer.` : "";
      get().pushToast("success", `Escaneo completado: ${formatCount(filesSeen)} archivos.${tail}`);
    } else if (state === "cancelled") {
      get().pushToast("info", `Escaneo cancelado tras ${formatCount(filesSeen)} archivos.`);
    } else {
      get().pushToast("error", "El escaneo se interrumpió por un error.");
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

  selectTreeFile: async (fileId) => {
    try {
      const hit = await call<Hit | null>("get_hit", { dbPath: get().dbPath, file_id: fileId });
      if (hit !== null) get().select(hit);
    } catch (e) {
      get().pushToast("error", `No se pudo abrir el archivo seleccionado: ${String(e)}`);
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
