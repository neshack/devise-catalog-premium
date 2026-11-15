import { useEffect, useRef, useState } from "react";
import {
  DEVICE_TYPES,
  INDICATOR_PALETTE,
  deviceType,
  isDeviceKind,
  parseIndicatorColors,
  type DeviceKind,
} from "../lib/devices";
import { formatBytes, formatCount } from "../lib/format";
import type { VolumeSummary } from "../lib/types";
import { useCatalog } from "../stores/catalog";
import IndicatorChip from "./IndicatorChip";
import VolumeCoverField from "./VolumeCoverField";
import { IconDrive, IconX } from "./icons";

/**
 * What a volume is, beyond its label: what it holds, the image that stands
 * for it, the kind of device it lives on and the one or two colors of its
 * indicator. All of it lives in the catalog, which is what makes a shelf of
 * unlabeled discs recognizable years later.
 *
 * The colors are chosen here but drawn everywhere else, so they can change
 * without touching the device plates.
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
  const [kind, setKind] = useState<DeviceKind | null>(() =>
    isDeviceKind(volume.media_kind) ? volume.media_kind : null,
  );
  const [colors, setColors] = useState<string[]>(() =>
    parseIndicatorColors(volume.indicator_colors),
  );
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const type = deviceType(kind);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  /** Choosing a type loads its signature pair; the user can replace it. */
  const chooseType = (next: (typeof DEVICE_TYPES)[number]) => {
    setKind(next.kind);
    setColors([...next.defaultColors]);
    setActiveSlot(0);
  };

  const clearType = () => {
    setKind(null);
    setColors([]);
    setActiveSlot(0);
  };

  /** The palette and the native picker write to whichever slot is active. */
  const applyColor = (hex: string) => {
    setColors((prev) => {
      if (activeSlot === 0) return prev.length > 1 ? [hex, prev[1]] : [hex];
      return prev.length === 0 ? [hex] : [prev[0], hex];
    });
  };

  /** Removing the first color promotes the second: slots stay contiguous. */
  const clearSlot = (slot: 0 | 1) => {
    setColors((prev) => prev.filter((_, i) => i !== slot));
    setActiveSlot(0);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const saved = await updateVolumeMeta(
      volume.id,
      description.trim() === "" ? null : description.trim(),
      cover,
      kind,
      kind !== null ? colors : [],
    );
    setBusy(false);
    if (saved) {
      pushToast("success", `Ficha de «${volume.label}» actualizada.`);
      onClose();
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        className="modal modal--identity"
        role="dialog"
        aria-modal="true"
        aria-label="Identificar volumen"
        tabIndex={-1}
        ref={dialogRef}
      >
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
            <div className="form-field__top">
              <span className="form-field__label" id="device-kind-label">
                Tipo de dispositivo
              </span>
              {kind !== null && (
                <button type="button" className="form-field__clear" onClick={clearType} disabled={busy}>
                  Quitar tipo
                </button>
              )}
            </div>
            <div
              className="device-grid"
              role="radiogroup"
              aria-labelledby="device-kind-label"
            >
              {DEVICE_TYPES.map((device) => (
                <button
                  key={device.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === device.kind}
                  className={`device-card${kind === device.kind ? " is-active" : ""}`}
                  onClick={() => chooseType(device)}
                  disabled={busy}
                  title={device.hint}
                >
                  <img className="device-card__img" src={device.image} alt="" decoding="async" />
                  <span className="device-card__label">{device.label}</span>
                </button>
              ))}
            </div>
            <span className="form-field__help">
              {type !== null
                ? `${type.hint}. La placa representa el volumen en la lista.`
                : "Elige el medio donde vive este volumen. Es opcional, pero hace reconocible la ficha."}
            </span>
          </div>

          {kind !== null && (
            <div className="form-field">
              <span className="form-field__label">
                Color del indicador <span className="form-field__optional">(uno o dos)</span>
              </span>

              <div className="color-slots" role="group" aria-label="Casillas de color del indicador">
                {[0, 1].map((slot) => {
                  const color = colors[slot] ?? null;
                  // The second slot only exists once it has a color; the
                  // "+ Segundo color" button is the way to create it.
                  if (slot === 1 && color === null) return null;
                  const index = slot as 0 | 1;
                  return (
                    <div
                      key={slot}
                      className={`color-slot${activeSlot === index ? " is-active" : ""}`}
                    >
                      <button
                        type="button"
                        className="color-slot__pick"
                        onClick={() => setActiveSlot(index)}
                        aria-pressed={activeSlot === index}
                        aria-label={`${index === 0 ? "Color 1" : "Color 2"}${
                          color !== null ? `: ${color}` : ", vacío"
                        }`}
                        disabled={busy}
                      >
                        <span
                          className={`color-slot__swatch${color === null ? " is-empty" : ""}`}
                          style={color !== null ? { background: color } : undefined}
                        />
                        <span className="color-slot__name">Color {index + 1}</span>
                      </button>
                      {color !== null && (
                        <button
                          type="button"
                          className="color-slot__remove"
                          onClick={() => clearSlot(index)}
                          aria-label={`Quitar color ${index + 1}`}
                          disabled={busy}
                        >
                          <IconX size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {colors.length === 1 && (
                  <button
                    type="button"
                    className={`color-slot__add${activeSlot === 1 ? " is-active" : ""}`}
                    onClick={() => setActiveSlot(1)}
                    aria-pressed={activeSlot === 1}
                    disabled={busy}
                  >
                    + Segundo color
                  </button>
                )}
              </div>

              <div className="palette" role="group" aria-label="Paleta del indicador">
                {INDICATOR_PALETTE.map((entry) => (
                  <button
                    key={entry.hex}
                    type="button"
                    className={`palette__swatch${
                      colors[activeSlot] === entry.hex ? " is-active" : ""
                    }`}
                    style={{ background: entry.hex }}
                    aria-label={entry.label}
                    title={entry.label}
                    aria-pressed={colors[activeSlot] === entry.hex}
                    onClick={() => applyColor(entry.hex)}
                    disabled={busy}
                  />
                ))}
                <label className="palette__custom" title="Elegir otro color">
                  <input
                    type="color"
                    value={colors[activeSlot] ?? "#ffac1c"}
                    onChange={(e) => applyColor(e.target.value)}
                    aria-label="Otro color"
                    disabled={busy}
                  />
                  <span>Otro…</span>
                </label>
              </div>

              <div className="indicator-preview">
                <IndicatorChip colors={colors} className="indicator-chip--preview" />
                <span className="indicator-preview__hex mono">
                  {colors.length > 0
                    ? colors.map((color) => color.toUpperCase()).join("  ")
                    : "Sin color"}
                </span>
                <span className="indicator-preview__hint">
                  Así se verá en la lista de volúmenes.
                </span>
              </div>
            </div>
          )}

          <div className="form-field">
            <label className="form-field__label" htmlFor="volume-description">
              Descripción <span className="form-field__optional">(opcional)</span>
            </label>
            <textarea
              id="volume-description"
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
