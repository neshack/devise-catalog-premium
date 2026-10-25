import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * A desktop context menu anchored at the pointer. It is rendered in a portal
 * so a virtualized row's transform cannot clip it, and it is fully keyboard
 * navigable: arrows move, Enter selects, Escape closes.
 */
export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[active]?.onSelect();
        onClose();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [active, items, onClose]);

  useEffect(() => {
    const node = ref.current?.querySelectorAll<HTMLButtonElement>(".context-menu__item")[active];
    node?.focus();
  }, [active]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 250));
  const top = Math.max(8, Math.min(y, window.innerHeight - items.length * 34 - 16));

  return createPortal(
    <div ref={ref} className="context-menu" style={{ left, top }} role="menu">
      {items.map((item, i) => (
        <button
          key={item.label}
          className={`context-menu__item${item.danger ? " context-menu__item--danger" : ""}`}
          role="menuitem"
          onMouseEnter={() => setActive(i)}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.icon !== undefined && <span className="context-menu__icon">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
