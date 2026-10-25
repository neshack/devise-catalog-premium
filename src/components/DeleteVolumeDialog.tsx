import { useEffect, useRef, useState } from "react";
import { formatBytes, formatCount } from "../lib/format";
import type { VolumeSummary } from "../lib/types";
import { useCatalog } from "../stores/catalog";
import { IconAlert, IconTrash, IconX } from "./icons";

/**
 * Removing a volume is destructive for the catalog but harmless for the disk,
 * and both facts have to be true on screen at the same time. Typing the label
 * is the deliberate second step: a single misplaced click cannot erase months
 * of indexing.
 */
export default function DeleteVolumeDialog({
  volume,
  onClose,
}: {
  volume: VolumeSummary;
  onClose: () => void;
}) {
  const { deleteVolume, scan } = useCatalog();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blocked = scan.running;
  const matches = typed.trim() === volume.label;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!matches || busy || blocked) return;
    setBusy(true);
    const removed = await deleteVolume(volume);
    setBusy(false);
    if (removed) onClose();
  };

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="modal modal--danger"
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="delete-volume-title"
        aria-describedby="delete-volume-desc"
      >
        <div className="modal__head">
          <IconTrash size={17} />
          <span className="modal__title" id="delete-volume-title">
            Eliminar volumen
          </span>
          <button
            className="btn btn--ghost btn--icon"
            aria-label="Cerrar"
            onClick={onClose}
            disabled={busy}
          >
            <IconX size={15} />
          </button>
        </div>

        <div className="modal__body">
          <p className="modal__lede" id="delete-volume-desc">
            <strong>{volume.label}</strong> saldrá del catálogo junto con{" "}
            <b>{formatCount(volume.file_count)}</b>{" "}
            {volume.file_count === 1 ? "archivo" : "archivos"} y{" "}
            <b>{formatBytes(volume.total_size)}</b> indexados.
          </p>

          <p className="danger-note">
            <IconAlert size={14} />
            <span>
              Los archivos del disco <b>no se borran</b>. Puedes volver a escanear
              el volumen cuando quieras y el catálogo se reconstruirá.
            </span>
          </p>

          {blocked && (
            <p className="form-field__error" role="alert">
              Hay un escaneo en curso. Espera a que termine para eliminar un volumen.
            </p>
          )}

          <div className="form-field">
            <label className="form-field__label" htmlFor="delete-volume-confirm">
              Escribe <span className="mono">{volume.label}</span> para confirmar
            </label>
            <input
              id="delete-volume-confirm"
              ref={inputRef}
              className="input input--mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              disabled={busy || blocked}
              autoComplete="off"
              spellCheck={false}
              placeholder={volume.label}
            />
            <span className="form-field__help">
              Esta acción sólo afecta al catálogo local de este equipo. En
              volúmenes grandes puede tardar; la ventana sigue usable.
            </span>
          </div>
        </div>

        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            className="btn btn--danger"
            onClick={() => void submit()}
            disabled={!matches || busy || blocked}
          >
            {busy ? "Eliminando…" : "Eliminar del catálogo"}
          </button>
        </div>
      </div>
    </div>
  );
}
