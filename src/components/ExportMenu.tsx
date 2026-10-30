import { useEffect, useRef, useState } from "react";
import type { ExportFormat } from "../lib/types";
import { useCatalog } from "../stores/catalog";
import { IconDownload } from "./icons";

const FORMATS: Array<{ fmt: ExportFormat; name: string; desc: string }> = [
  { fmt: "csv", name: "CSV", desc: "hojas de cálculo" },
  { fmt: "json", name: "JSON", desc: "datos estructurados" },
  { fmt: "html", name: "HTML", desc: "página navegable con la marca" },
];

export default function ExportMenu() {
  const { runExport, volumeFilter, volumes } = useCatalog();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Exporting follows the selected volume: the sidebar says what the catalog
  // is focused on, and that is also what the file will contain.
  const volume =
    volumeFilter === null
      ? null
      : volumes.find((v) => v.label === volumeFilter.label && v.serial === volumeFilter.serial) ??
        null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={
          volume !== null
            ? `Exportar el volumen «${volume.label}»`
            : "Exportar el catálogo completo"
        }
      >
        <IconDownload size={15} />
        Exportar
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Formato de exportación">
          <span className="menu__label">
            {volume !== null ? `Exportar volumen «${volume.label}»` : "Exportar catálogo completo"}
          </span>
          {FORMATS.map(({ fmt, name, desc }) => (
            <button
              key={fmt}
              className="menu__item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void runExport(fmt);
              }}
            >
              {name}
              <span className="menu__hint">{desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
