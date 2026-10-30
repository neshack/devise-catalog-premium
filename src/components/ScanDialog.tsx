import { useEffect, useRef, useState } from "react";
import { pickScanFolder } from "../lib/cover";
import { formatBytes, formatCount, formatEta, percentOf } from "../lib/format";
import { isDemo } from "../lib/ipc";
import { useCatalog } from "../stores/catalog";
import VolumeCoverField from "./VolumeCoverField";
import { IconAlert, IconFolder, IconScan, IconSpinner, IconX } from "./icons";

/** A last path segment that reads as a volume name, not as a drive letter. */
function suggestLabel(path: string): string {
  const clean = path.replace(/[\\/]+$/, "");
  const cut = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  const base = clean.slice(cut + 1);
  return /^[A-Za-z]:$/.test(base) ? `Disco ${base.slice(0, 1).toUpperCase()}` : base;
}

export default function ScanDialog() {
  const { scanOpen, setScanOpen, scan, runScan, cancelScan } = useCatalog();
  const [root, setRoot] = useState("");
  const [label, setLabel] = useState("");
  const [serial, setSerial] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const rootRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!scanOpen) return;
    setError(null);
    // Opening "Escanear volumen" means starting one: the last report lives in
    // the strip and a toast, not in a form that refuses to be filled again.
    if (!useCatalog.getState().scan.running) {
      setRoot("/media/");
      setLabel("");
      setSerial("");
      setDescription("");
      setCover(null);
      rootRef.current?.focus();
    }
  }, [scanOpen]);

  useEffect(() => {
    if (!scanOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // Closing the dialog never stops the scan: the strip above the list
      // keeps telling what is happening, so the window is the user's again.
      if (e.key === "Escape") setScanOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanOpen, setScanOpen]);

  if (!scanOpen) return null;

  const submit = () => {
    const r = root.trim();
    const l = label.trim();
    if (r === "") {
      setError("Indica la carpeta raíz a escanear o elígela con el botón de la carpeta.");
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
    void runScan(r, l, serial.trim(), description, cover);
  };

  const chooseFolder = async () => {
    setError(null);
    setPicking(true);
    try {
      const picked = await pickScanFolder();
      if (picked === null) return;
      const hadLabel = label.trim() !== "";
      setRoot(picked);
      if (!hadLabel) {
        setLabel(suggestLabel(picked));
        labelRef.current?.focus();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPicking(false);
    }
  };

  const running = scan.running;
  const done = !running && scan.lastCount !== null;
  const pct = percentOf(scan.filesSeen, scan.filesTotal);
  const eta = formatEta(scan.etaSecs);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !running && setScanOpen(false)}>
      <div className="modal modal--scan" role="dialog" aria-modal="true" aria-label="Escanear volumen">
        <div className="modal__head">
          <IconScan size={18} />
          <span className="modal__title">Escanear volumen</span>
          <button className="btn btn--ghost btn--icon" aria-label="Cerrar" onClick={() => setScanOpen(false)}>
            <IconX size={15} />
          </button>
        </div>

        <div className="modal__body">
          {running || done ? (
            <>
              {running ? (
                <>
                  <div className="scan-phase">
                    <IconSpinner size={15} />
                    {scan.state === "paused"
                      ? "Escaneo en pausa: reanúdalo desde la tira superior."
                      : scan.phase === "index"
                        ? "Indexando en el catálogo…"
                        : "Recorriendo la estructura de carpetas…"}
                  </div>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label="Progreso del escaneo"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct ?? undefined}
                  >
                    {pct !== null ? (
                      <div className="progress__bar" style={{ width: `${pct}%` }} />
                    ) : (
                      <div className="progress__bar progress__bar--indeterminate" />
                    )}
                  </div>
                  <div className="scan-stats">
                    <div className="stat">
                      <span className="stat__value">{formatCount(scan.filesSeen)}</span>
                      <span className="stat__label">
                        {scan.filesTotal !== null
                          ? `de ~${formatCount(scan.filesTotal)} archivos`
                          : "archivos vistos"}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="stat">
                        <span className="stat__value">{pct} %</span>
                        <span className="stat__label">completado</span>
                      </div>
                    )}
                    {eta !== null && (
                      <div className="stat">
                        <span className="stat__value">{eta}</span>
                        <span className="stat__label">restante</span>
                      </div>
                    )}
                    <div className="stat">
                      <span className="stat__value">{formatBytes(scan.bytesSeen)}</span>
                      <span className="stat__label">procesados</span>
                    </div>
                  </div>
                  {scan.currentPath !== null && (
                    <p className="scan-path mono" title={scan.currentPath}>
                      {scan.currentPath}
                    </p>
                  )}
                  {scan.errorCount > 0 && (
                    <p className="form-field__help">
                      {formatCount(scan.errorCount)} rutas no se pudieron leer; quedan anotadas en el catálogo.
                    </p>
                  )}
                  {scan.error !== null && (
                    <p className="form-field__error" role="alert">
                      <IconAlert size={12} /> {scan.error}
                    </p>
                  )}
                </>
              ) : scan.state === "failed" ? (
                <p className="scan-summary scan-summary--error" role="alert">
                  <IconAlert size={15} />
                  <span>
                    El escaneo se interrumpió
                    {scan.error !== null ? `: ${scan.error}` : "."} Lo que ya estaba
                    indexado sigue en el catálogo.
                  </span>
                </p>
              ) : scan.state === "cancelled" ? (
                <p className="scan-summary">
                  Escaneo cancelado tras <strong>{formatCount(scan.lastCount ?? 0)}</strong>{" "}
                  archivos. El volumen conserva lo que ya estaba indexado.
                </p>
              ) : (
                <p className="scan-summary">
                  Escaneo finalizado: <strong>{formatCount(scan.lastCount ?? 0)}</strong> archivos procesados.
                  El volumen ya está disponible en la barra lateral y en las búsquedas.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="form-field">
                <label className="form-field__label" htmlFor="scan-root">
                  Unidad o carpeta raíz <span className="req">*</span>
                </label>
                <div className="input-row">
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
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void chooseFolder()}
                    disabled={picking || isDemo}
                    title={
                      isDemo
                        ? "El diálogo del sistema sólo existe en la app de escritorio"
                        : "Elegir la unidad en el diálogo del sistema"
                    }
                  >
                    <IconFolder size={14} />
                    {picking ? "Abriendo…" : "Elegir…"}
                  </button>
                </div>
                <span className="form-field__help">
                  {isDemo
                    ? "En la app de escritorio este botón abre el diálogo del sistema; en la demo, escribe la ruta."
                    : "Elige el disco, USB, NAS o carpeta. La ruta se toma del diálogo del sistema."}
                </span>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="scan-label">
                    Etiqueta <span className="req">*</span>
                  </label>
                  <input
                    id="scan-label"
                    ref={labelRef}
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
                    Nº de serie <span className="form-field__optional">(opcional)</span>
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
              </div>

              <div className="form-field">
                <label className="form-field__label" htmlFor="scan-description">
                  Descripción <span className="form-field__optional">(opcional)</span>
                </label>
                <textarea
                  id="scan-description"
                  className="input input--area"
                  rows={2}
                  maxLength={280}
                  placeholder="Qué guarda este volumen: fotos de 2016, instaladores, copias del NAS…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <span className="form-field__help">
                  Ayuda a reconocerlo sin insertarlo. También puedes cambiarla después.
                </span>
              </div>

              <div className="form-field">
                <span className="form-field__label">
                  Imagen del volumen <span className="form-field__optional">(opcional)</span>
                </span>
                <VolumeCoverField value={cover} onChange={setCover} />
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
