import { useEffect } from "react";
import DuplicatesPanel from "./components/DuplicatesPanel";
import ExportMenu from "./components/ExportMenu";
import Inspector from "./components/Inspector";
import ResultsList from "./components/ResultsList";
import ScanDialog from "./components/ScanDialog";
import SearchBar, { SearchHelpButton } from "./components/SearchBar";
import StatusBar from "./components/StatusBar";
import Toasts from "./components/Toasts";
import VolumeSidebar from "./components/VolumeSidebar";
import { LogoMark } from "./components/Brand";
import { IconDuplicates, IconTable } from "./components/icons";
import { useCatalog } from "./stores/catalog";
import type { SortKey } from "./lib/types";

function SortSelect() {
  const { sortKey, sortDir, setSort } = useCatalog();
  return (
    <select
      className="select"
      value={`${sortKey}:${sortDir}`}
      aria-label="Ordenar resultados"
      onChange={(e) => {
        const [k, d] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
        setSort(k, d);
      }}
    >
      <option value="name:asc">Nombre ↑</option>
      <option value="name:desc">Nombre ↓</option>
      <option value="size:desc">Tamaño ↓</option>
      <option value="size:asc">Tamaño ↑</option>
      <option value="mtime:desc">Fecha ↓</option>
      <option value="mtime:asc">Fecha ↑</option>
      <option value="volume:asc">Volumen ↑</option>
    </select>
  );
}

export default function App() {
  const {
    init,
    query,
    volumeFilter,
    runSearch,
    view,
    setView,
    hits,
    searchStatus,
    elapsedMs,
  } = useCatalog();

  useEffect(() => {
    void init();
    // one-time session init
  }, [init]);

  // Debounced live search as the query or the volume filter changes.
  useEffect(() => {
    const t = setTimeout(() => void runSearch(), 180);
    return () => clearTimeout(t);
  }, [query, volumeFilter, runSearch]);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">
            <LogoMark size={28} />
          </span>
          <span className="brand-name">
            CD Catalog
            <span className="brand-sub">Premium</span>
          </span>
        </div>

        <SearchBar />

        <div className="header-actions">
          <SearchHelpButton />
          <div className="divider-v" />
          <ExportMenu />
        </div>
      </header>

      <div className="app-body">
        <VolumeSidebar />

        <main className="app-main">
          <div className="results-toolbar">
            <div className="segmented" role="tablist" aria-label="Vista principal">
              <button
                className={`segmented__btn${view === "results" ? " is-active" : ""}`}
                role="tab"
                aria-selected={view === "results"}
                onClick={() => setView("results")}
              >
                <IconTable size={14} /> Resultados
              </button>
              <button
                className={`segmented__btn${view === "duplicates" ? " is-active" : ""}`}
                role="tab"
                aria-selected={view === "duplicates"}
                onClick={() => setView("duplicates")}
              >
                <IconDuplicates size={14} /> Duplicados
              </button>
            </div>

            {view === "results" && (
              <div className="results-toolbar__info">
                <span className="results-count" aria-live="polite">
                  {searchStatus === "searching"
                    ? "Buscando…"
                    : `${hits.length} ${hits.length === 1 ? "resultado" : "resultados"}`}
                </span>
                {searchStatus !== "searching" && elapsedMs !== null && (
                  <span className="results-elapsed">· {elapsedMs.toFixed(0)} ms</span>
                )}
                {volumeFilter !== null && <span className="results-elapsed">· en «{volumeFilter}»</span>}
              </div>
            )}

            <div className="results-toolbar__spacer" />
            {view === "results" && <SortSelect />}
          </div>

          {view === "results" ? (
            <>
              <div className="results-head" aria-hidden="true">
                <span>Nombre</span>
                <span>Volumen</span>
                <span className="results-head__right">Tamaño</span>
                <span className="results-head__right">Modificado</span>
              </div>
              <ResultsList />
            </>
          ) : (
            <DuplicatesPanel />
          )}
        </main>

        <Inspector />
      </div>

      <StatusBar />
      <ScanDialog />
      <Toasts />
    </div>
  );
}
