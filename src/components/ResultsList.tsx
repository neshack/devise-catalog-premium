import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { fileKind, formatBytes, formatDate } from "../lib/format";
import { sortHits, useCatalog } from "../stores/catalog";
import type { Hit } from "../lib/types";
import { IconSearch, IconSpinner, KindIcon } from "./icons";
import { EmptyState } from "./EmptyState";

const EXAMPLES = ["*.mp3", "size:>100MB", "ext:{jpg,png}", "*.zip"];

export default function ResultsList() {
  const {
    hits,
    searchedFor,
    searchStatus,
    selected,
    select,
    sortKey,
    sortDir,
    setQuery,
  } = useCatalog();

  const scrollRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => sortHits(hits, sortKey, sortDir), [hits, sortKey, sortDir]);

  const virt = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });

  // Keyboard navigation over the result list (↑/↓/Enter).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && selected !== null) return; // inspector already shows it
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (sorted.length === 0) return;
      e.preventDefault();
      const cur = selected ? sorted.findIndex((h) => h.id === selected.id) : -1;
      const next = e.key === "ArrowDown" ? Math.min(cur + 1, sorted.length - 1) : Math.max(cur - 1, 0);
      if (next !== cur) select(sorted[next]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sorted, selected, select]);

  if (searchedFor === "" && searchStatus !== "searching") {
    return (
      <EmptyState
        icon={<IconSearch size={26} />}
        title="Busca en todo tu catálogo"
        hint="Encuentra archivos en cualquier disco escaneado sin insertarlo. Combina texto libre con filtros de extensión, tamaño y volumen."
        examples={EXAMPLES}
        onExample={setQuery}
      />
    );
  }

  if (searchStatus === "searching" && sorted.length === 0) {
    return (
      <div className="empty">
        <IconSpinner size={22} />
        <span className="empty__hint">Consultando el índice…</span>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={<IconSearch size={26} />}
        title={`Sin resultados para «${searchedFor}»`}
        hint="Revisa la sintaxis o prueba con otros términos. La búsqueda es tolerante: no necesitas escribir el nombre completo."
        examples={EXAMPLES}
        onExample={setQuery}
      />
    );
  }

  return (
    <div className="results-scroll" ref={scrollRef} role="list" aria-label="Resultados de búsqueda">
      <div style={{ height: virt.getTotalSize(), position: "relative" }}>
        {virt.getVirtualItems().map((vi) => {
          const h = sorted[vi.index];
          return (
            <Row
              key={h.id}
              hit={h}
              selected={selected?.id === h.id}
              onSelect={select}
              offset={vi.start}
            />
          );
        })}
      </div>
    </div>
  );
}

function Row({
  hit,
  selected: isSelected,
  onSelect,
  offset,
}: {
  hit: Hit;
  selected: boolean;
  onSelect: (h: Hit) => void;
  offset: number;
}) {
  return (
    <div
      data-testid="result-row"
      role="listitem"
      aria-selected={isSelected}
      tabIndex={-1}
      className={`row${isSelected ? " is-selected" : ""}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${offset}px)`,
      }}
      onClick={() => onSelect(hit)}
      title={`${hit.path === "/" ? "" : hit.path}/${hit.name}`}
    >
      <span className="row__icon">
        <KindIcon kind={fileKind(hit.ext)} size={15} />
      </span>
      <span style={{ minWidth: 0 }}>
        <div className="row__name">{hit.name}</div>
        <div className="row__path">{hit.path === "/" ? "" : hit.path}</div>
      </span>
      <span className="row__volume">{hit.volume_label}</span>
      <span className="row__size">{formatBytes(hit.size)}</span>
      <span className="row__date">{formatDate(hit.mtime)}</span>
    </div>
  );
}
