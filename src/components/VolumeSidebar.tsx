import { formatBytes, formatCount, formatDate } from "../lib/format";
import { useCatalog } from "../stores/catalog";
import { IconDisc, IconDrive, IconScan } from "./icons";

export default function VolumeSidebar() {
  const { volumes, volumesError, volumeFilter, setVolumeFilter, setScanOpen } = useCatalog();

  return (
    <aside className="sidebar" aria-label="Volúmenes del catálogo">
      <div className="sidebar__head">
        <span className="sidebar__title">Volúmenes</span>
        <span className="badge badge--muted">{volumes.length}</span>
      </div>

      <div className="side-items">
        <button
          className={`side-item${volumeFilter === null ? " is-active" : ""}`}
          onClick={() => setVolumeFilter(null)}
          aria-pressed={volumeFilter === null}
        >
          <span className="side-item__icon">
            <IconDisc size={16} />
          </span>
          <span className="side-item__body">
            <span className="side-item__label">Todos los volúmenes</span>
            <span className="side-item__meta">
              {formatCount(volumes.reduce((a, v) => a + v.file_count, 0))} archivos
            </span>
          </span>
        </button>

        {volumesError !== null && (
          <p className="side-item__meta" role="alert" style={{ padding: "0 8px" }}>
            {volumesError}
          </p>
        )}

        {volumes.map((v) => (
          <button
            key={v.label}
            className={`side-item${volumeFilter === v.label ? " is-active" : ""}`}
            onClick={() => setVolumeFilter(volumeFilter === v.label ? null : v.label)}
            aria-pressed={volumeFilter === v.label}
            title={`${v.label} — ${v.serial}`}
          >
            <span className="side-item__icon">
              <IconDrive size={16} />
            </span>
            <span className="side-item__body">
              <span className="side-item__label">{v.label}</span>
              <span className="side-item__meta">
                {formatCount(v.file_count)} arch. · {formatBytes(v.total_size)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="sidebar__foot">
        <button className="btn btn--primary" onClick={() => setScanOpen(true)}>
          <IconScan size={16} />
          Escanear volumen
        </button>
        <span className="side-item__meta" style={{ padding: "0 2px" }}>
          {volumes.length > 0
            ? `Último escaneo: ${formatDate(
                volumes.reduce<number | null>(
                  (acc, v) => (acc === null || (v.indexed_at ?? 0) > acc ? v.indexed_at : acc),
                  null,
                ),
              )}`
            : "Escanea tu primer disco o USB para empezar."}
        </span>
      </div>
    </aside>
  );
}
