import { useState } from "react";
import { fileKind, formatBytes, formatDate, formatHash, hitFullPath } from "../lib/format";
import type { Hit } from "../lib/types";
import {
  describeAudioMeta,
  describeImageMeta,
  parseAudioMeta,
  parseImageMeta,
  type MetaRow,
} from "../lib/media";
import { useCatalog } from "../stores/catalog";
import { IconCheck, IconCopy, IconDuplicates, IconFile, IconSpinner, KindIcon } from "./icons";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`copy-btn${copied ? " is-copied" : ""}`}
      aria-label={copied ? "Copiado" : label}
      title={copied ? "¡Copiado!" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
    </button>
  );
}

/** Why the duplicates panel has nothing to show. */
function noCopiesReason(hit: Hit): string {
  if (hit.container_path !== null) {
    // Rescanning will never hash it: entries inside archives are indexed from
    // the central directory, without opening the container.
    return "Los archivos dentro de un ZIP no se hashean: extrae este archivo para compararlo con otros.";
  }
  if (hit.blake3 === null) {
    return "Este archivo no tiene hash calculado; vuelve a escanear su volumen para detectar duplicados.";
  }
  return "Sin copias idénticas en el catálogo.";
}

export default function Inspector() {
  const { selected, fileDups, fileDupsLoading } = useCatalog();

  if (selected === null) {
    return (
      <aside className="inspector" aria-label="Detalles">
        <div className="empty">
          <span className="empty__icon">
            <IconFile size={24} />
          </span>
          <span className="empty__title">Nada seleccionado</span>
          <p className="empty__hint">
            Haz clic en un resultado para ver su ruta, tamaño, fecha y copias idénticas en otros volúmenes.
          </p>
        </div>
      </aside>
    );
  }

  const fullPath = hitFullPath(selected);
  const wasted = fileDups.reduce((a, d) => a + d.size, 0);
  const audio = parseAudioMeta(selected.audio_json);
  const image = parseImageMeta(selected.image_json);
  const metaRows: MetaRow[] = [
    ...(audio !== null ? describeAudioMeta(audio) : []),
    ...(image !== null ? describeImageMeta(image) : []),
  ];

  return (
    <aside className="inspector" aria-label="Detalles del archivo">
      <div className="inspector-hero">
        <div className="inspector-hero__head">
          <span className="inspector-hero__name">{selected.name}</span>
          <span className="inspector-hero__meta">
            Ficha {selected.id} · {selected.volume_label}
            {selected.ext !== null ? ` · .${selected.ext}` : ""}
          </span>
        </div>
        <span className="inspector-hero__icon">
          <KindIcon kind={fileKind(selected.ext)} size={34} />
        </span>
      </div>

      <div className="inspector__section">
        <span className="inspector__title">Detalles</span>
        <div className="field-list">
          <div className="field">
            <span className="field__key">Volumen</span>
            <span className="field__value">{selected.volume_label}</span>
          </div>
          <div className="field">
            <span className="field__key">Ruta</span>
            <span className="field__value field__value--mono field__value--wrap hash-row">
              <code>{selected.path}</code>
              <CopyButton text={fullPath} label="Copiar ruta completa" />
            </span>
          </div>
          {selected.container_path !== null && (
            <div className="field">
              <span className="field__key">Contenido en</span>
              <span className="field__value field__value--mono field__value--wrap">
                <code>{selected.container_path}</code>
              </span>
            </div>
          )}
          <div className="field">
            <span className="field__key">Tamaño</span>
            <span className="field__value">
              {formatBytes(selected.size)}{" "}
              <span className="field__key">({selected.size.toLocaleString("es-ES")} bytes)</span>
            </span>
          </div>
          <div className="field">
            <span className="field__key">Modificado</span>
            <span className="field__value">{formatDate(selected.mtime)}</span>
          </div>
          <div className="field">
            <span className="field__key">Tipo</span>
            <span className="field__value">{selected.ext ? `.${selected.ext}` : "sin extensión"}</span>
          </div>
          <div className="field">
            <span className="field__key">Hash</span>
            <span className="field__value field__value--mono hash-row">
              <code>{formatHash(selected.blake3, 16)}</code>
              {selected.blake3 !== null && <CopyButton text={selected.blake3} label="Copiar hash" />}
            </span>
          </div>
        </div>
      </div>

      {metaRows.length > 0 && (
        <div className="inspector__section">
          <span className="inspector__title">Metadatos</span>
          <div className="field-list">
            {metaRows.map(([label, value]) => (
              <div className="field" key={label}>
                <span className="field__key">{label}</span>
                <span className="field__value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="inspector__section">
        <span className="inspector__title">
          Copias idénticas {fileDups.length > 0 && `(${fileDups.length})`}
        </span>
        {fileDupsLoading ? (
          <span className="scan-phase">
            <IconSpinner size={14} /> Buscando…
          </span>
        ) : fileDups.length === 0 ? (
          <p className="empty__hint">{noCopiesReason(selected)}</p>
        ) : (
          <>
            <div className="field-list">
              {fileDups.map((d) => (
                <div key={d.id} className="field" title={`${d.path}/${d.name} (${d.volume_label})`}>
                  <span className="field__key">
                    <IconDuplicates size={12} /> {d.volume_label}
                  </span>
                  <span className="field__value field__value--mono field__value--truncate">
                    {d.path === "/" ? `/${d.name}` : `${d.path}/${d.name}`} · {formatBytes(d.size)}
                  </span>
                </div>
              ))}
            </div>
            <p className="form-field__help">
              {fileDups.length} copia{fileDups.length !== 1 && "s"} · {formatBytes(wasted)} en otras ubicaciones.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
