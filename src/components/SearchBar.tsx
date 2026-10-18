import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { describeQuery, removeToken } from "../lib/search";
import { useCatalog } from "../stores/catalog";
import { IconHelp, IconSearch, IconX } from "./icons";

const SYNTAX_ROWS: Array<[string, string]> = [
  ["texto", "búsqueda por nombre (prefijo automático)"],
  ["*.mp3", "solo archivos con esa extensión"],
  ["ext:{mp3,flac}", "varias extensiones a la vez"],
  ["size:>5MB", "tamaño mínimo (también < >= <= =)"],
  ['volume:"Backup-12"', "limitar a un volumen"],
];

export function SyntaxHelp(): JSX.Element {
  return (
    <div className="help" role="dialog" aria-label="Sintaxis de búsqueda">
      <strong style={{ fontSize: 13 }}>Sintaxis de búsqueda</strong>
      {SYNTAX_ROWS.map(([code, desc]) => (
        <div key={code} className="help__row">
          <code>{code}</code>
          <span>{desc}</span>
        </div>
      ))}
    </div>
  );
}

/** Help toggle anchored in the header actions. */
export function SearchHelpButton(): JSX.Element {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="menu-anchor" onMouseDown={(e) => e.stopPropagation()}>
      <button
        className="btn btn--ghost btn--icon"
        aria-label="Ayuda de sintaxis"
        title="Sintaxis de búsqueda"
        onClick={() => setOpen((o) => !o)}
      >
        <IconHelp size={17} />
      </button>
      {open && <SyntaxHelp />}
    </div>
  );
}

export default function SearchBar() {
  const { query, setQuery, searchStatus } = useCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
  const chips = describeQuery(query);
  const searching = searchStatus === "searching";

  // Global shortcut: Ctrl/Cmd+K focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`searchbar${searching ? " is-searching" : ""}`}>
      <span className="searchbar__icon">
        <IconSearch size={16} />
      </span>
      {chips.length > 0 && (
        <div className="chips" aria-label="Filtros activos">
          {chips.map((c) => (
            <span key={c.token} className="chip" title={c.token}>
              {c.label}
              <button
                className="chip__remove"
                aria-label={`Quitar filtro ${c.label}`}
                onClick={() => setQuery(removeToken(query, c.token))}
              >
                <IconX size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id="search-input"
        ref={inputRef}
        className="searchbar__input"
        type="text"
        aria-label="Buscar en el catálogo"
        placeholder='Beatles  ·  *.mp3  ·  size:>5MB  ·  volume:"Backup-12"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            inputRef.current?.blur();
          }
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {query !== "" && (
        <button
          className="searchbar__clear"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
        >
          <IconX size={13} />
        </button>
      )}
      <span className="searchbar__kbd" aria-hidden="true">
        <span className="kbd">Ctrl</span>
        <span className="kbd">K</span>
      </span>
    </div>
  );
}
