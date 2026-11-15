import { useState } from "react";
import {
  deviceType,
  indicatorBackground,
  parseIndicatorColors,
} from "../lib/devices";
import { formatBytes, formatCount, formatDate } from "../lib/format";
import type { VolumeSummary } from "../lib/types";
import { useCatalog } from "../stores/catalog";
import DeleteVolumeDialog from "./DeleteVolumeDialog";
import VolumeMetaDialog from "./VolumeMetaDialog";
import {
  IconDisc,
  IconEdit,
  IconPanelCollapse,
  IconPanelExpand,
  IconScan,
  IconTrash,
} from "./icons";

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

/** Two letters that still say which volume this is when the panel is a rail. */
function monogram(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.trim().slice(0, 2).toUpperCase();
}

function volumeTitle(v: VolumeSummary): string {
  const type = deviceType(v.media_kind);
  const lines = [
    `${v.label} — ${v.serial}`,
    `${formatCount(v.file_count)} archivos · ${formatBytes(v.total_size)}`,
  ];
  if (type !== null) lines.push(`Tipo: ${type.label}`);
  if (v.description !== null) lines.push(v.description);
  return lines.join("\n");
}

export default function VolumeSidebar() {
  const {
    volumes,
    volumesError,
    volumeFilter,
    setVolumeFilter,
    setScanOpen,
    sidebarCollapsed,
    toggleSidebar,
  } = useCatalog();
  const [toDelete, setToDelete] = useState<VolumeSummary | null>(null);
  const [toEdit, setToEdit] = useState<VolumeSummary | null>(null);
  const lastScan = volumes.reduce<number | null>(
    (acc, v) => (acc === null || (v.indexed_at ?? 0) > acc ? v.indexed_at : acc),
    null,
  );

  const isSameVolume = (label: string, serial: string): boolean =>
    volumeFilter?.label === label && volumeFilter?.serial === serial;

  return (
    <>
      <aside
        className={`sidebar${sidebarCollapsed ? " is-rail" : ""}`}
        aria-label="Volúmenes del catálogo"
        id="volume-panel"
      >
        <div className="sidebar__head">
          {!sidebarCollapsed && <span className="sidebar__title">Volúmenes</span>}
          {!sidebarCollapsed && (
            <span className="sidebar__title mono">{String(volumes.length).padStart(2, "0")}</span>
          )}
          <button
            className="sidebar__toggle"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-controls="volume-panel"
            aria-label={sidebarCollapsed ? "Expandir panel de volúmenes" : "Contraer panel de volúmenes"}
            title={sidebarCollapsed ? "Expandir panel de volúmenes" : "Contraer panel de volúmenes"}
          >
            {sidebarCollapsed ? <IconPanelExpand size={15} /> : <IconPanelCollapse size={15} />}
          </button>
        </div>

        <div className="side-items">
          <button
            className={`side-item${volumeFilter === null ? " is-active" : ""}`}
            onClick={() => setVolumeFilter(null)}
            aria-pressed={volumeFilter === null}
            aria-label="Todos los volúmenes"
            title={`Todos los volúmenes — ${formatCount(
              volumes.reduce((a, v) => a + v.file_count, 0),
            )} archivos`}
          >
            <span className="side-item__led" aria-hidden="true" />
            <span className="side-item__media">
              {sidebarCollapsed ? (
                <IconDisc size={18} />
              ) : (
                <span className="side-item__tag">ALL</span>
              )}
            </span>
            {!sidebarCollapsed && (
              <span className="side-item__body">
                <span className="side-item__label">Todos los volúmenes</span>
                <span className="side-item__meta">
                  {formatCount(volumes.reduce((a, v) => a + v.file_count, 0))} arch
                </span>
              </span>
            )}
          </button>

          {volumesError !== null && (
            <p className="side-item__meta" role="alert">
              {volumesError}
            </p>
          )}

          {volumes.map((v) => {
            const active = isSameVolume(v.label, v.serial);
            const device = deviceType(v.media_kind);
            const colors = parseIndicatorColors(v.indicator_colors);
            return (
              <div className={`side-item-row${active ? " is-active" : ""}`} key={v.id}>
                <button
                  className={`side-item${active ? " is-active" : ""}`}
                  onClick={() =>
                    setVolumeFilter(active ? null : { label: v.label, serial: v.serial })
                  }
                  aria-pressed={active}
                  aria-label={`${v.label} — ${v.serial}${
                    device !== null ? `. ${device.label}` : ""
                  }${v.description !== null ? `. ${v.description}` : ""}`}
                  title={volumeTitle(v)}
                >
                  <span
                    className="side-item__led"
                    aria-hidden="true"
                    style={
                      colors.length > 0
                        ? { background: indicatorBackground(colors, "column") }
                        : undefined
                    }
                  />
                  <span
                    className={`side-item__media${
                      v.cover !== null ? " has-cover" : device !== null ? " has-device" : ""
                    }`}
                  >
                    {v.cover !== null ? (
                      <img src={v.cover} alt="" />
                    ) : device !== null ? (
                      <img src={device.image} alt="" />
                    ) : (
                      <span className="side-item__tag">
                        {sidebarCollapsed ? monogram(v.label) : volumeTag(v.label, v.serial)}
                      </span>
                    )}
                  </span>
                  {!sidebarCollapsed && (
                    <span className="side-item__body">
                      <span className="side-item__label">{v.label}</span>
                      <span className="side-item__meta">
                        {formatCount(v.file_count)} arch · {formatBytes(v.total_size)}
                      </span>
                      {v.description !== null && (
                        <span className="side-item__desc">{v.description}</span>
                      )}
                    </span>
                  )}
                </button>
                {!sidebarCollapsed && (
                  <div className="side-item__actions">
                    <button
                      className="side-item__action"
                      aria-label={`Editar volumen ${v.label}`}
                      title="Editar descripción e imagen…"
                      onClick={() => setToEdit(v)}
                    >
                      <IconEdit size={13} />
                    </button>
                    <button
                      className="side-item__action side-item__action--danger"
                      aria-label={`Eliminar volumen ${v.label}`}
                      title="Eliminar del catálogo…"
                      onClick={() => setToDelete(v)}
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar__foot">
          <button
            className="btn btn--primary"
            onClick={() => setScanOpen(true)}
            aria-label="Escanear volumen"
            title="Escanear volumen"
          >
            <IconScan size={14} />
            {!sidebarCollapsed && "Escanear volumen"}
          </button>
          {!sidebarCollapsed && (
            <span className="side-item__meta">
              {lastScan !== null
                ? `Último escaneo: ${formatDate(lastScan)}`
                : "Escanea tu primer disco o USB para empezar."}
            </span>
          )}
        </div>
      </aside>

      {toDelete !== null && (
        <DeleteVolumeDialog volume={toDelete} onClose={() => setToDelete(null)} />
      )}
      {toEdit !== null && (
        <VolumeMetaDialog volume={toEdit} onClose={() => setToEdit(null)} />
      )}
    </>
  );
}
