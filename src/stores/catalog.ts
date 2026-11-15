import { create } from "zustand";
import type { DeviceKind } from "../lib/devices";
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
  TreePath,
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
  /** Bumped whenever a tag changes, so an open inspector reloads its chips. */
  tagsRevision: number;

  /** The left panel, collapsed to an icon rail. Remembered across sessions. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

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
  /** Forget a volume from the catalog. The files on disk are never touched. */
  deleteVolume: (volume: VolumeSummary) => Promise<boolean>;
  /**
   * Write the identifying data of a volume: what it holds, the image that
   * stands for it, the kind of device it lives on and the one or two colors
   * of its indicator. `null` clears a field; the catalog is the only copy.
   */
  updateVolumeMeta: (
    id: number,
    description: string | null,
    cover: string | null,
    mediaKind: DeviceKind | null,
    indicatorColors: string[],
  ) => Promise<boolean>;
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
  /** Open the volume tree, every folder above the file, and select it. */
  revealInTree: (fileId: number) => Promise<void>;
  /** Keep an already-loaded tree row in sync after its tags change. */
  updateTreeTags: (target: { kind: "file" | "dir"; id: number }, tags: string[]) => void;
  setSort: (key: SortKey, dir?: SortDir) => void;
  loadDuplicates: () => Promise<void>;
  setScanOpen: (open: boolean) => void;
  runScan: (
    root: string,
    label: string,
    serial: string,
    description: string,
    cover: string | null,
  ) => Promise<void>;
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

const SIDEBAR_KEY = "devise.sidebar.collapsed";

/** localStorage is a convenience; a browser that refuses it is not an error. */
function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch {
    // The preference just will not survive a reload.
  }
}

/** Local date for the exported page: the window knows the timezone, Rust not. */
function exportStamp(): string {
  return new Date().toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  tagsRevision: 0,

  sidebarCollapsed: readSidebarCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed;
      writeSidebarCollapsed(sidebarCollapsed);
      return { sidebarCollapsed };
    }),

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
          // The ending is known the moment the backend says it ended: waiting
          // for the command's reply would flash the form again for a beat.
          ...(terminal ? { lastCount: p.files_seen } : {}),
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
    const text = query.trim();
    // A volume filter alone is navigation, not a search: selecting a volume
    // must open its tree instead of throwing the user into an empty results
    // list.
    if (text === "") {
      set({ hits: [], searchedFor: "", searchStatus: "idle", elapsedMs: null, selected: null });
      return;
    }
    const effective = volumeFilter ? `${text} volume:"${volumeFilter.label}"` : text;
    // A search is a question about the catalog, so it opens the results
    // surface even when the user was walking the tree.
    set({ searchStatus: "searching", view: "results" });
    const t0 = performance.now();
    try {
      const rows = await call<Hit[]>("search", {
        dbPath: get().dbPath,
        raw: effective,
        limit: 200,
        volumeSerial: volumeFilter?.serial ?? null,
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
    void call<FileDuplicate[]>("file_duplicates", { dbPath: get().dbPath, fileId: h.id })
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
    if (changed) {
      // With an active query the user is filtering results, not entering the
      // tree: switching surfaces would throw the search away.
      set({
        volumeFilter,
        tree: EMPTY_TREE,
        ...(get().query.trim() === "" ? { view: "tree" as const } : {}),
      });
      if (get().query.trim() !== "") void get().runSearch();
    }
  },

  deleteVolume: async (volume) => {
    if (get().scan.running) {
      get().pushToast("error", "Espera a que termine el escaneo antes de eliminar un volumen.");
      return false;
    }
    try {
      await call("delete_volume", { dbPath: get().dbPath, volumeId: volume.id });
      const current = get().volumeFilter;
      const isCurrent =
        current?.label === volume.label && current?.serial === volume.serial;
      set({
        volumes: get().volumes.filter((v) => v.id !== volume.id),
        // A deleted volume cannot stay selected, and its rows cannot stay in
        // the inspector: both would point at something the catalog no longer
        // knows.
        selected: null,
        fileDups: [],
        ...(isCurrent
          ? { volumeFilter: null, tree: EMPTY_TREE, hits: [], view: "tree" as const }
          : {}),
      });
      get().pushToast(
        "success",
        `Volumen «${volume.label}» eliminado del catálogo. Los archivos del disco siguen intactos.`,
      );
      // The write is done; refreshing the views is bookkeeping and must not
      // keep the dialog (or the user) waiting.
      void get().refreshVolumes();
      void get().refreshScan();
      if (get().query.trim() !== "") void get().runSearch();
      return true;
    } catch (e) {
      get().pushToast("error", `No se pudo eliminar el volumen: ${String(e)}`);
      return false;
    }
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

  setScanOpen: (scanOpen) =>
    set((s) => ({
      scanOpen,
      // Opening "Escanear volumen" starts a new scan, not a rerun of the last
      // report: the ending of the previous attempt already had its toast and
      // its strip. A live or paused scan is left alone.
      scan:
        scanOpen && !s.scan.running
          ? { ...s.scan, lastCount: null, error: null }
          : s.scan,
    })),

  runScan: async (root, label, serial, description, cover) => {
    set({ scan: { ...IDLE_SCAN, running: true, state: "running", phase: "walk" } });
    try {
      const outcome = await call<ScanOutcome>("scan_volume", {
        dbPath: get().dbPath,
        root,
        label,
        serial: serial || `AUTO-${Date.now()}`,
      });
      // Keep how it ended: the dialog says "finished", "cancelled" or
      // "interrupted", not all of them as a happy ending.
      set({
        scan: {
          ...get().scan,
          running: false,
          state: outcome.state,
          phase: null,
          lastCount: outcome.files_seen,
        },
      });
      // The identifying data is optional and only written when the user gave
      // something: re-scanning a known volume must not erase its description.
      const wroteDescription = description.trim() !== "";
      try {
        if (wroteDescription) {
          await call("set_volume_description", {
            dbPath: get().dbPath,
            volumeId: outcome.volume_id,
            description: description.trim(),
          });
        }
        if (cover !== null) {
          await call("set_volume_cover", {
            dbPath: get().dbPath,
            volumeId: outcome.volume_id,
            cover,
          });
        }
      } catch (e) {
        get().pushToast(
          "error",
          `El volumen se escaneó, pero su ficha no se pudo guardar: ${String(e)}`,
        );
      }
      await get().refreshVolumes();
      await get().refreshScan();
    } catch (e) {
      set({
        scan: {
          ...get().scan,
          running: false,
          state: "failed",
          phase: null,
          error: String(e),
        },
      });
      // The run row already knows more than this promise does (it may have
      // been cancelled or interrupted rather than failed).
      await get().refreshScan();
      get().pushToast("error", `Error al escanear: ${String(e)}`);
    }
  },

  updateVolumeMeta: async (id, description, cover, mediaKind, indicatorColors) => {
    try {
      await call("set_volume_description", { dbPath: get().dbPath, volumeId: id, description });
      await call("set_volume_cover", { dbPath: get().dbPath, volumeId: id, cover });
      await call("set_volume_identity", {
        dbPath: get().dbPath,
        volumeId: id,
        mediaKind,
        // Colors without a device type would be an identity with no subject.
        indicatorColors: mediaKind !== null && indicatorColors.length > 0 ? indicatorColors : null,
      });
      await get().refreshVolumes();
      return true;
    } catch (e) {
      get().pushToast("error", `No se pudo guardar la ficha del volumen: ${String(e)}`);
      return false;
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
      const hit = await call<Hit | null>("get_hit", { dbPath: get().dbPath, fileId });
      if (hit !== null) get().select(hit);
    } catch (e) {
      get().pushToast("error", `No se pudo abrir el archivo seleccionado: ${String(e)}`);
    }
  },

  revealInTree: async (fileId) => {
    try {
      const path = await call<TreePath | null>("tree_path", { dbPath: get().dbPath, fileId });
      if (path === null) {
        get().pushToast("error", "Ese archivo ya no está en el catálogo.");
        return;
      }
      const volume = { label: path.volume_label, serial: path.volume_serial };
      const fetchLevel = (parent: number | null) =>
        call<TreeChildren>("tree_children", {
          dbPath: get().dbPath,
          volume: volume.label,
          serial: volume.serial,
          parent,
        });
      // The path arrives root-first; the root level is already the first load,
      // then each folder above the file is read and left open.
      const root = await fetchLevel(null);
      const children: Record<string, TreeChildren> = { [TREE_ROOT]: root };
      const expanded: string[] = [];
      for (const dirId of path.dir_ids.slice(1)) {
        const key = String(dirId);
        children[key] = await fetchLevel(dirId);
        expanded.push(key);
      }
      set({
        volumeFilter: volume,
        view: "tree",
        tree: { loading: null, children, expanded, error: null },
      });
      await get().selectTreeFile(fileId);
    } catch (e) {
      get().pushToast("error", `No se pudo ubicar el archivo en el árbol: ${String(e)}`);
    }
  },

  updateTreeTags: (target, tags) =>
    set((s) => {
      const children = { ...s.tree.children };
      for (const [key, level] of Object.entries(children)) {
        if (target.kind === "dir") {
          const dirs = level.dirs.map((dir) => (dir.id === target.id ? { ...dir, tags } : dir));
          if (dirs.some((dir, i) => dir !== level.dirs[i])) {
            children[key] = { ...level, dirs };
          }
        } else {
          const files = level.files.map((file) =>
            file.id === target.id ? { ...file, tags } : file,
          );
          if (files.some((file, i) => file !== level.files[i])) {
            children[key] = { ...level, files };
          }
        }
      }
      return {
        tree: { ...s.tree, children },
        tagsRevision: s.tagsRevision + 1,
      };
    }),

  runExport: async (fmt) => {
    const filter = get().volumeFilter;
    const volume =
      filter === null
        ? null
        : get().volumes.find((v) => v.label === filter.label && v.serial === filter.serial) ?? null;
    try {
      const dest = await call<string>("export_" + fmt, {
        dbPath: get().dbPath,
        outPath: null,
        volumeId: volume?.id ?? null,
        ...(fmt === "html" ? { generated: exportStamp() } : {}),
      });
      const what = volume !== null ? `Volumen «${volume.label}»` : "Catálogo completo";
      get().pushToast("success", `${what} exportado (${fmt.toUpperCase()}) → ${dest}`);
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
