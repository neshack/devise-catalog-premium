import { useEffect, useRef, useState } from "react";
import { formatBytes, formatCount } from "../lib/format";
import type { VolumeSummary } from "../lib/types";
import { useCatalog } from "../stores/catalog";
import VolumeCoverField from "./VolumeCoverField";
import { IconDrive, IconX } from "./icons";

/**
 * What a volume is, beyond its label: what it holds and the image that stands
 * for it. Both live in the catalog, which is what makes a shelf of unlabeled
 * discs recognizable years later.
 */
export default function VolumeMetaDialog({
  volume,
  onClose,
}: {
  volume: VolumeSummary;
  onClose: () => void;
}) {
  const { updateVolumeMeta, pushToast } = useCatalog();
  const [description, setDescription] = useState(volume.description ?? "");
  const [cover, setCover] = useState<string | null>(volume.cover);
  const [busy, setBusy] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    descriptionRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const saved = await updateVolumeMeta(
      volume.id,
      description.trim() === "" ? null : description.trim(),
      cover,
    );
    setBusy(false);
    if (saved) {
      pushToast("success", `Ficha de «${volume.label}» actualizada.`);
      onClose();
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Identificar volumen">
        <div className="modal__head">
          <IconDrive size={17} />
          <span className="modal__title">Identificar volumen</span>
          <button className="btn btn--ghost btn--icon" aria-label="Cerrar" onClick={onClose} disabled={busy}>
            <IconX size={15} />
          </button>
        </div>

        <div className="modal__body">
          <p className="volume-context">
            <span className="volume-context__name">{volume.label}</span>
            <span className="volume-context__meta mono">
              {volume.serial} · {formatCount(volume.file_count)} arch · {formatBytes(volume.total_size)}
            </span>
          </p>

          <div className="form-field">
            <label className="form-field__label" htmlFor="volume-description">
              Descripción <span className="form-field__optional">(opcional)</span>
            </label>
            <textarea
              id="volume-description"
              ref={descriptionRef}
              className="input input--area"
              rows={2}
              maxLength={280}
              placeholder="Qué guarda este volumen: fotos de 2016, instaladores, copias del NAS…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="form-field__help">Se muestra en la barra lateral y en la exportación.</span>
          </div>

          <div className="form-field">
            <span className="form-field__label">
              Imagen del volumen <span className="form-field__optional">(opcional)</span>
            </span>
            <VolumeCoverField value={cover} onChange={setCover} />
          </div>
        </div>

        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Guardando…" : "Guardar ficha"}
          </button>
        </div>
      </div>
    </div>
  );
}
