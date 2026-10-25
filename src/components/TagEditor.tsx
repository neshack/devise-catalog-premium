import { useId, useState } from "react";
import { IconTag, IconX } from "./icons";

/**
 * Chips plus a one-field form. The parent owns persistence; this component
 * only owns the text being typed, which is what keeps it reusable by the
 * inspector and by the folder dialog.
 */
export default function TagEditor({
  tags,
  suggestions = [],
  disabled = false,
  onAdd,
  onRemove,
}: {
  tags: string[];
  suggestions?: string[];
  disabled?: boolean;
  onAdd: (name: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const listId = useId();
  const submit = async () => {
    const name = value.trim().replace(/^#/, "");
    if (name === "" || disabled) return;
    await onAdd(name);
    setValue("");
  };

  return (
    <div className="tag-editor">
      <div className="tag-list" aria-label="Etiquetas">
        {tags.length === 0 && <span className="tag-editor__empty">Sin etiquetas todavía.</span>}
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            <IconTag size={11} />
            {tag}
            <button
              type="button"
              className="tag-chip__remove"
              aria-label={`Quitar etiqueta ${tag}`}
              title={`Quitar ${tag}`}
              disabled={disabled}
              onClick={() => void onRemove(tag)}
            >
              <IconX size={10} />
            </button>
          </span>
        ))}
      </div>
      <form
        className="tag-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="input input--mono"
          value={value}
          list={listId}
          placeholder="nueva etiqueta"
          aria-label="Nueva etiqueta"
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
        />
        <datalist id={listId}>
          {suggestions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
        <button className="btn btn--sm" type="submit" disabled={disabled || value.trim() === ""}>
          Añadir
        </button>
      </form>
    </div>
  );
}
