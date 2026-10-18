import { useEffect, useRef, useState } from "react";
import { formatBytes, formatCount } from "../lib/format";
import { useCatalog } from "../stores/catalog";
import { IconAlert, IconScan, IconSpinner, IconX } from "./icons";

export default function ScanDialog() {
  const { scanOpen, setScanOpen, scan, runScan, cancelScan } = useCatalog();
  const [root, setRoot] = useState("");
  const [label, setLabel] = useState("");
  const [serial, setSerial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scanOpen) {
      setError(null);
      // prefill a sane default when opening again
      if (root === "") setRoot("/media/");
      rootRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen]);

  useEffect(() => {
    if (!scanOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !scan.running) setScanOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanOpen, scan.running, setScanOpen]);

  if (!scanOpen) return null;

  const submit = () => {
    const r = root.trim();
    const l = label.trim();
    if (r === "") {
      setError("Indica la carpeta raíz a escanear (p. ej. /media/backup o D:\\).");
      return;
    }
    if (!/^(\/|[A-Za-z]:[\\/])/.test(r)) {
      setError("La ruta debe ser absoluta: empezar por «/» (Linux/macOS) o una unidad como «D:\\» (Windows).");
      return;
    }
    if (l === "") {
      setError("Pon una etiqueta para reconocer el volumen en el catálogo.");
      return;
    }
    setError(null);
    void runScan(r, l, serial.trim());
  };

  const running = scan.running;
  const done = !running && scan.lastCount !== null;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !running && setScanOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Escanear volumen">
        <div className="modal__head">
          <IconScan size={18} />
          <span className="modal__title">Escanear volumen</span>
          {!running && (
            <button className="btn btn--ghost btn--icon" aria-label="Cerrar" onClick={() => setScanOpen(false)}>
              <IconX size={15} />
            </button>
          )}
        </div>

        <div className="modal__body">
          {running || done ? (
            <>
              {running ? (
                <>
                  <div className="scan-phase">
                    <IconSpinner size={15} />
                    {scan.phase === "index"
                      ? "Indexando en el catálogo…"
                      : "Recorriendo la estructura de carpetas…"}
                  </div>
                  <div className="progress" role="progressbar" aria-label="Progreso del escaneo">
                    <div className="progress__bar progress__bar--indeterminate" />
                  </div>
                  <div className="scan-stats">
                    <div className="stat">
                      <span className="stat__value">{formatCount(scan.filesSeen)}</span>
                      <span className="stat__label">archivos vistos</span>
                    </div>
                    <div className="stat">
                      <span className="stat__value">{formatBytes(scan.bytesSeen)}</span>
                      <span className="stat__label">procesados</span>
                    </div>
                  </div>
                  {scan.error !== null && (
                    <p className="form-field__error" role="alert">
                      <IconAlert size={12} /> {scan.error}
                    </p>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13.5 }}>
                  Escaneo finalizado: <strong>{formatCount(scan.lastCount ?? 0)}</strong> archivos procesados.
                  El volumen ya está disponible en la barra lateral y en las búsquedas.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="form-field">
                <label className="form-field__label" htmlFor="scan-root">
                  Carpeta raíz <span className="req">*</span>
                </label>
                <input
                  id="scan-root"
                  ref={rootRef}
                  className="input input--mono"
                  placeholder="/media/backup  ·  /mnt/nas/fotos  ·  D:\"
                  value={root}
                  onChange={(e) => setRoot(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  spellCheck={false}
                />
                <span className="form-field__help">Ruta absoluta del disco, USB, NAS o carpeta a indexar.</span>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="scan-label">
                  Etiqueta <span className="req">*</span>
                </label>
                <input
                  id="scan-label"
                  className="input"
                  placeholder="Backup-12"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <span className="form-field__help">Nombre con el que aparecerá en el catálogo.</span>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="scan-serial">
                  Nº de serie <span style={{ color: "var(--fg-faint)", fontWeight: 400 }}>(opcional)</span>
                </label>
                <input
                  id="scan-serial"
                  className="input input--mono"
                  placeholder="VOL-001"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <span className="form-field__help">Se genera automáticamente si lo dejas vacío.</span>
              </div>
              {error !== null && (
                <p className="form-field__error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div className="modal__foot">
          {running ? (
            <button className="btn btn--danger" onClick={() => void cancelScan()}>
              Cancelar escaneo
            </button>
          ) : done ? (
            <button className="btn btn--primary" onClick={() => setScanOpen(false)}>
              Cerrar
            </button>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={() => setScanOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn--primary" onClick={submit}>
                <IconScan size={15} />
                Escanear
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
