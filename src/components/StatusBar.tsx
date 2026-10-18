import { formatCount } from "../lib/format";
import { isDemo } from "../lib/ipc";
import { useCatalog } from "../stores/catalog";

/** Lámparas de estado: ámbar = atención/vivo · rojo = falla · verde = sano. */
export default function StatusBar() {
  const { dbPath, volumes, scan } = useCatalog();
  const totalFiles = volumes.reduce((a, v) => a + v.file_count, 0);

  return (
    <footer className="statusbar">
      <span className="statusbar__item">
        <i className={`lamp ${isDemo ? "lamp--live" : "lamp--ok"}`} aria-hidden="true" />
        {isDemo ? "modo demo" : "catálogo activo"}
      </span>
      <span className="statusbar__path" title={dbPath}>
        {dbPath}
      </span>
      {scan.running && (
        <span className="status-scan">
          <i className="lamp lamp--hot" aria-hidden="true" />
          Escaneando… <span className="mono">{formatCount(scan.filesSeen)}</span> archivos
        </span>
      )}
      <span className="statusbar__spacer" />
      <span className="statusbar__item">
        <span className="mono">{volumes.length}</span>{" "}
        {volumes.length === 1 ? "volumen" : "volúmenes"}
      </span>
      <span className="statusbar__item">
        <span className="mono">{formatCount(totalFiles)}</span> archivos
      </span>
      <span className="statusbar__item">100 % local</span>
    </footer>
  );
}
