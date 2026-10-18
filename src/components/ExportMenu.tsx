import { useEffect, useRef, useState } from "react";
import type { ExportFormat } from "../lib/types";
import { useCatalog } from "../stores/catalog";
import { IconDownload } from "./icons";

const FORMATS: Array<{ fmt: ExportFormat; name: string; desc: string }> = [
  { fmt: "csv", name: "CSV", desc: "hojas de cálculo" },
  { fmt: "json", name: "JSON", desc: "datos estructurados" },
  { fmt: "html", name: "HTML", desc: "página navegable" },
];

export default function ExportMenu() {
  const { runExport } = useCatalog();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
      <button className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconDownload size={15} />
        Exportar
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Formato de exportación">
          <span className="menu__label">Exportar catálogo completo</span>
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
