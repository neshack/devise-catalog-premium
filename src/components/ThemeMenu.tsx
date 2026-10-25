import { useEffect, useRef, useState } from "react";
import { useTheme, type ThemeMode } from "../stores/theme";
import { IconCheck, IconMonitor, IconMoon, IconSun } from "./icons";

const OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  hint: string;
  Icon: typeof IconSun;
}> = [
  { mode: "system", label: "Sistema", hint: "sigue al SO", Icon: IconMonitor },
  { mode: "light", label: "Claro", hint: "papel", Icon: IconSun },
  { mode: "dark", label: "Oscuro", hint: "terminal", Icon: IconMoon },
];

export default function ThemeMenu() {
  const { mode, resolved, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((option) => option.mode === mode) ?? OPTIONS[0];
  const CurrentIcon = mode === "system" ? IconMonitor : resolved === "light" ? IconSun : IconMoon;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="btn btn--ghost btn--icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tema: ${current.label}`}
        title={`Tema: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <CurrentIcon size={17} />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Tema de la interfaz">
          <span className="menu__label">Tema de la interfaz</span>
          {OPTIONS.map(({ mode: option, label, hint, Icon }) => (
            <button
              key={option}
              className="menu__item"
              role="menuitemradio"
              aria-checked={mode === option}
              onClick={() => {
                setMode(option);
                setOpen(false);
              }}
            >
              <Icon size={15} />
              {label}
              <span className="menu__hint">{hint}</span>
              {mode === option && <IconCheck size={13} className="menu__check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
