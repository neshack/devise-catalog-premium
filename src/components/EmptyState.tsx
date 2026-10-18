import type { JSX } from "react";

export function EmptyState({
  icon,
  title,
  hint,
  examples,
  onExample,
}: {
  icon: JSX.Element;
  title: string;
  hint: string;
  examples?: string[];
  onExample?: (q: string) => void;
}): JSX.Element {
  return (
    <div className="empty">
      <span className="empty__icon">{icon}</span>
      <span className="empty__title">{title}</span>
      <p className="empty__hint">{hint}</p>
      {examples !== undefined && examples.length > 0 && (
        <div className="empty__examples">
          {examples.map((ex) => (
            <button key={ex} className="example-chip" onClick={() => onExample?.(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
