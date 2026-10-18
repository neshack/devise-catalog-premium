import { formatBytes, formatCount, formatHash } from "../lib/format";
import { useCatalog } from "../stores/catalog";
import { IconDuplicates, IconRefresh, IconSpinner } from "./icons";

export default function DuplicatesPanel() {
  const { dupGroups, dupLoading, dupError, loadDuplicates } = useCatalog();

  const totalCopies = dupGroups.reduce((a, g) => a + g.count, 0);
  const wasted = dupGroups.reduce((a, g) => a + (g.count - 1) * g.size, 0);

  return (
    <div className="dup-panel">
      <div className="dup-summary">
        <div className="stat">
          <span className="stat__value">{formatCount(dupGroups.length)}</span>
          <span className="stat__label">grupos de duplicados</span>
        </div>
        <div className="stat">
          <span className="stat__value">{formatCount(totalCopies)}</span>
          <span className="stat__label">copias encontradas</span>
        </div>
        <div className="stat">
          <span className="stat__value stat__value--warn">{formatBytes(wasted)}</span>
          <span className="stat__label">espacio recuperable</span>
        </div>
        <div className="spacer" />
        <button className="btn btn--sm" onClick={() => void loadDuplicates()} disabled={dupLoading}>
          {dupLoading ? <IconSpinner size={13} /> : <IconRefresh size={13} />}
          Actualizar
        </button>
      </div>

      <div className="dup-head" aria-hidden="true">
        <span />
        <span>Archivo de muestra</span>
        <span className="dup-head__right">Tamaño</span>
        <span className="dup-head__right">Recuperable</span>
      </div>

      <div className="results-scroll" role="list" aria-label="Grupos de duplicados">
        {dupError !== null ? (
          <div className="empty">
            <span className="empty__title">No se pudieron cargar los duplicados</span>
            <p className="empty__hint">{dupError}</p>
          </div>
        ) : !dupLoading && dupGroups.length === 0 ? (
          <div className="empty">
            <span className="empty__icon">
              <IconDuplicates size={24} />
            </span>
            <span className="empty__title">Sin duplicados</span>
            <p className="empty__hint">
              No hay dos archivos con el mismo contenido BLAKE3 en el catálogo. Los duplicados se detectan al
              escanear.
            </p>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {dupGroups.map((g) => (
              <div key={g.blake3} className="dup-card" role="listitem" title={g.blake3}>
                <span className="dup-card__icon">
                  <IconDuplicates size={15} />
                </span>
                <span className="dup-card__body">
                  <div className="dup-card__name">{g.sample_name}</div>
                  <div className="dup-card__meta">
                    hash <code>{formatHash(g.blake3, 14)}</code>
                  </div>
                </span>
                <span className="dup-card__size">{formatBytes(g.size)}</span>
                <span className="dup-card__waste">
                  ×{g.count} = {formatBytes((g.count - 1) * g.size)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
