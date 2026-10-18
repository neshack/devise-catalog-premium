import { formatCount } from "../lib/format";
import { isDemo } from "../lib/ipc";
import { useCatalog } from "../stores/catalog";
import { IconClock, IconDisc, IconDrive, IconSpinner } from "./icons";

export default function StatusBar() {
  const { dbPath, volumes, scan } = useCatalog();
  const totalFiles = volumes.reduce((a, v) => a + v.file_count, 0);

  return (
    <footer className="statusbar">
      <span className={`badge ${isDemo ? "badge--demo" : "badge--live"}`}>
        {isDemo ? "modo demo" : "catálogo activo"}
      </span>
      <span className="statusbar__path" title={dbPath}>
        {dbPath}
      </span>
      {scan.running && (
        <span className="status-scan">
          <IconSpinner size={12} />
          Escaneando… {formatCount(scan.filesSeen)} archivos
        </span>
      )}
      <span style={{ flex: 1 }} />
      <span className="statusbar__item">
        <IconDrive size={12} /> {volumes.length} {volumes.length === 1 ? "volumen" : "volúmenes"}
      </span>
      <span className="statusbar__item">
        <IconDisc size={12} /> {formatCount(totalFiles)} archivos
      </span>
      <span className="statusbar__item">
        <IconClock size={12} /> 100 % local
      </span>
    </footer>
  );
}
