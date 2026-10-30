import { useState } from "react";
import { pickCoverImage } from "../lib/cover";
import { IconAlert, IconImage } from "./icons";

/**
 * The catalog image of a volume: a small plate, a button that opens the
 * system file dialog and a way to take it off. The image is redimensioned and
 * stored inside the catalog, so it is not a link to a file that may move.
 */
export default function VolumeCoverField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    setBusy(true);
    try {
      const picked = await pickCoverImage();
      if (picked !== null) onChange(picked);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cover-field">
      <div className={`cover-field__plate${value !== null ? " has-image" : ""}`}>
        {value !== null ? (
          <img src={value} alt="Imagen actual del volumen" />
        ) : (
          <span className="cover-field__empty">
            <IconImage size={20} />
            <span>Sin imagen</span>
          </span>
        )}
      </div>
      <div className="cover-field__side">
        <div className="cover-field__actions">
          <button type="button" className="btn btn--sm" onClick={() => void choose()} disabled={busy}>
            <IconImage size={13} />
            {busy ? "Abriendo…" : value !== null ? "Cambiar imagen…" : "Elegir imagen…"}
          </button>
          {value !== null && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => onChange(null)}
              disabled={busy}
            >
              Quitar
            </button>
          )}
        </div>
        <span className="form-field__help">
          Se guarda dentro del catálogo, reducida a una miniatura.
        </span>
        {error !== null && (
          <p className="form-field__error" role="alert">
            <IconAlert size={12} /> {error}
          </p>
        )}
      </div>
    </div>
  );
}
