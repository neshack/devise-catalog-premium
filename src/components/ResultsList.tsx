import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { formatBytes, formatDate, hitFullPath } from "../lib/format";
import { sortHits, useCatalog } from "../stores/catalog";
import type { Hit } from "../lib/types";
import { IconSearch, IconSpinner } from "./icons";
import { EmptyState } from "./EmptyState";

const EXAMPLES = ["*.mp3", "size:>100MB", "ext:{jpg,png}", "*.zip"];

/**
 * Términos del texto libre que se pueden resaltar dentro de un nombre: sin
 * comodines ni filtros (`ext:`, `size:`), porque esos ya recortan la lista.
 */
function highlightTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2 && /^[\w.\-]+$/.test(t));
}

/** Marca los aciertos del texto libre dentro de un nombre. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const lower = text.toLowerCase();
  const spans = terms
    .flatMap((t) => {
      const found: [number, number][] = [];
      let from = 0;
      for (;;) {
        const at = lower.indexOf(t, from);
        if (at === -1) break;
        found.push([at, at + t.length]);
        from = at + t.length;
      }
      return found;
    })
    .sort((a, b) => a[0] - b[0]);
  if (spans.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of spans) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) parts.push(text.slice(cursor, from));
    parts.push(<mark key={`${from}-${end}`}>{text.slice(from, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export default function ResultsList() {
  const {
    hits,
    query,
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
  const terms = useMemo(() => highlightTerms(query), [query]);

  const virt = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
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

  const items = virt.getVirtualItems();
  const first = items.length > 0 ? sorted[items[0].index] : undefined;
  const last = items.length > 0 ? sorted[items[items.length - 1].index] : undefined;

  return (
    <>
      {/* Tramo visible: qué parte de la lista estás mirando, sin scrollbar. */}
      <div className="results-span">
        <span className="results-span__label">Tramo</span>
        <span className="results-span__words">
          {first !== undefined && last !== undefined && (
            <>
              <b>{first.name}</b> → <b>{last.name}</b> ·{" "}
            </>
          )}
          {sorted.length} {sorted.length === 1 ? "ficha" : "fichas"}
        </span>
      </div>

      <div className="results-scroll" ref={scrollRef} role="list" aria-label="Resultados de búsqueda">
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {items.map((vi) => {
            const h = sorted[vi.index];
            return (
              <Row
                key={h.id}
                hit={h}
                selected={selected?.id === h.id}
                onSelect={select}
                offset={vi.start}
                terms={terms}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

function Row({
  hit,
  selected: isSelected,
  onSelect,
  offset,
  terms,
}: {
  hit: Hit;
  selected: boolean;
  onSelect: (h: Hit) => void;
  offset: number;
  terms: string[];
}) {
  const dirPath = hit.path === "/" ? "" : hit.path;
  // Entries inside an archive say so: their `name` is the inner path and
  // showing the folder alone would read like a normal file on disk.
  const location =
    hit.container_path === null
      ? dirPath
      : `dentro de ${hit.container_path.split("/").pop() ?? hit.container_path}`;
  const fullPath = hitFullPath(hit);
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
      title={fullPath}
    >
      <span className="row__name">
        <span className="row__label">
          <Highlight text={hit.name} terms={terms} />
        </span>
        {location !== "" && <span className="row__path">{location}</span>}
      </span>
      <span className="row__volume">{hit.volume_label}</span>
      <span className="row__size">{formatBytes(hit.size)}</span>
      <span className="row__date">{formatDate(hit.mtime)}</span>
    </div>
  );
}
