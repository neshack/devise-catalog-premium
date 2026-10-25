import { useEffect, useState } from "react";
import { call } from "../lib/ipc";
import { useCatalog } from "../stores/catalog";
import { IconSpinner, IconTag, IconX } from "./icons";
import TagEditor from "./TagEditor";

export interface TagTarget {
  kind: "file" | "dir";
  id: number;
  name: string;
}

/**
 * Tag editor for a folder (or a file opened from a context menu). Files get
 * the same editor inline in the inspector; this dialog is the path for rows
 * that do not have a permanent details panel.
 */
export default function TagDialog({
  target,
  onClose,
  onChanged,
}: {
  target: TagTarget;
  onClose: () => void;
  onChanged?: (tags: string[]) => void;
}) {
  const { dbPath, pushToast } = useCatalog();
  const [tags, setTags] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const idKey = target.kind === "file" ? "fileId" : "dirId";
  const listCommand = target.kind === "file" ? "file_tags" : "dir_tags";
  const addCommand = target.kind === "file" ? "add_file_tag" : "add_dir_tag";
  const removeCommand = target.kind === "file" ? "remove_file_tag" : "remove_dir_tag";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      call<string[]>(listCommand, { dbPath, [idKey]: target.id }),
      call<string[]>("list_tags", { dbPath }),
    ])
      .then(([current, all]) => {
        if (!alive) return;
        setTags(current);
        setSuggestions(all);
      })
      .catch((e) => {
        if (alive) pushToast("error", `No se pudieron leer las etiquetas: ${String(e)}`);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dbPath, idKey, listCommand, pushToast, target.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const apply = async (command: string, name: string) => {
    setBusy(true);
    try {
      const next = await call<string[]>(command, { dbPath, [idKey]: target.id, name });
      setTags(next);
      setSuggestions((prev) => (prev.includes(name) ? prev : [...prev, name].sort((a, b) => a.localeCompare(b, "es"))));
      onChanged?.(next);
    } catch (e) {
      pushToast("error", `No se pudo guardar la etiqueta: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="modal modal--tags"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-dialog-title"
      >
        <div className="modal__head">
          <IconTag size={17} />
          <span className="modal__title" id="tag-dialog-title">
            Etiquetas
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
          <p className="modal__lede">
            {target.kind === "dir" ? "Carpeta" : "Archivo"}: <strong>{target.name}</strong>
          </p>
          {loading ? (
            <span className="scan-phase">
              <IconSpinner size={14} /> Leyendo etiquetas…
            </span>
          ) : (
            <TagEditor
              tags={tags}
              suggestions={suggestions}
              disabled={busy}
              onAdd={(name) => apply(addCommand, name)}
              onRemove={(name) => apply(removeCommand, name)}
            />
          )}
          <p className="form-field__help">
            Las etiquetas de una carpeta también encuentran todo lo que hay dentro.
          </p>
        </div>
        <div className="modal__foot">
          <button className="btn btn--primary" onClick={onClose} disabled={busy}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
