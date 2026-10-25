import { formatBytes, formatCount, formatDate } from "../lib/format";
import { useCatalog } from "../stores/catalog";
import { IconScan } from "./icons";

/**
 * Etiqueta de activo del volumen: código estable derivado de (label, serial),
 * como el número de estante de un archivo físico. El serial real va en el
 * `title`; esta etiqueta sólo existe para reconocer el volumen de un vistazo.
 */
function volumeTag(label: string, serial: string): string {
  let h = 0x811c9dc5;
  const s = `${label}\u0000${serial}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `VOL-${((h >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
}

export default function VolumeSidebar() {
  const { volumes, volumesError, volumeFilter, setVolumeFilter, setScanOpen } = useCatalog();
  const lastScan = volumes.reduce<number | null>(
    (acc, v) => (acc === null || (v.indexed_at ?? 0) > acc ? v.indexed_at : acc),
    null,
  );

  const isSameVolume = (label: string, serial: string): boolean =>
    volumeFilter?.label === label && volumeFilter?.serial === serial;

  return (
    <aside className="sidebar" aria-label="Volúmenes del catálogo">
      <div className="sidebar__head">
        <span className="sidebar__title">Volúmenes</span>
        <span className="sidebar__title mono">
          {String(volumes.length).padStart(2, "0")}
        </span>
      </div>

      <div className="side-items">
        <button
          className={`side-item${volumeFilter === null ? " is-active" : ""}`}
          onClick={() => setVolumeFilter(null)}
          aria-pressed={volumeFilter === null}
        >
          <span className="side-item__led" aria-hidden="true" />
          <span className="side-item__tag">ALL</span>
          <span className="side-item__body">
            <span className="side-item__label">Todos los volúmenes</span>
            <span className="side-item__meta">
              {formatCount(volumes.reduce((a, v) => a + v.file_count, 0))} arch
            </span>
          </span>
        </button>

        {volumesError !== null && (
          <p className="side-item__meta" role="alert">
            {volumesError}
          </p>
        )}

        {volumes.map((v) => (
          <button
            key={`${v.label}\u0000${v.serial}`}
            className={`side-item${isSameVolume(v.label, v.serial) ? " is-active" : ""}`}
            onClick={() =>
              setVolumeFilter(
                isSameVolume(v.label, v.serial)
                  ? null
                  : { label: v.label, serial: v.serial },
              )
            }
            aria-pressed={isSameVolume(v.label, v.serial)}
            title={`${v.label} — ${v.serial}`}
          >
            <span className="side-item__led" aria-hidden="true" />
            <span className="side-item__tag">{volumeTag(v.label, v.serial)}</span>
            <span className="side-item__body">
              <span className="side-item__label">{v.label}</span>
              <span className="side-item__meta">
                {formatCount(v.file_count)} arch · {formatBytes(v.total_size)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="sidebar__foot">
        <button className="btn btn--primary" onClick={() => setScanOpen(true)}>
          <IconScan size={14} />
          Escanear volumen
        </button>
        <span className="side-item__meta">
          {lastScan !== null
            ? `Último escaneo: ${formatDate(lastScan)}`
            : "Escanea tu primer disco o USB para empezar."}
        </span>
      </div>
    </aside>
  );
}
