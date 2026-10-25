import { useCallback, useEffect, useState } from "react";
import { APP_VERSION, isDemo, openTwitter } from "../lib/ipc";
import { LogoMark } from "./Brand";
import { IconExternal } from "./icons";

const SEEN_KEY = "cdc-splash-seen";
const SHOW_MS = 3200;
const LEAVE_MS = 380;

/**
 * First impression: the mark, what the app is, the version that is running and
 * the author. It never blocks the catalog — a click, a key or the timer takes
 * it away — and it only appears once per window session.
 *
 * `?splash=1` forces it (useful for the visual test); `?splash=0` hides it.
 */
function shouldShow(): boolean {
  const forced = new URLSearchParams(window.location.search).get("splash");
  if (forced === "1") return true;
  if (forced === "0") return false;
  // Automated browsers get the app, not the presentation: the splash is for
  // people, and the test suite has a dedicated case that forces it.
  if (navigator.webdriver) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export default function Splash() {
  const [visible, setVisible] = useState(shouldShow);
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback(() => {
    setLeaving((already) => {
      if (already) return already;
      return true;
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // A private window without storage still gets the presentation once.
    }
    const timer = window.setTimeout(dismiss, SHOW_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [dismiss, visible]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setVisible(false), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!visible) return null;

  return (
    <div
      className={`splash${leaving ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Presentación de CD Catalog Premium"
      onClick={dismiss}
    >
      <div className="splash__grain" aria-hidden="true" />
      <div className="splash__frame">
        <div className="splash__mark">
          <LogoMark size={92} />
        </div>

        <div className="splash__eyebrow">Catálogo local · sin nube</div>
        <h1 className="splash__title">
          CD Catalog
          <span>Premium</span>
        </h1>
        <p className="splash__lede">
          Tus discos, indexados como un inventario.
          <br />
          Búsqueda instantánea. Cero conexión.
        </p>

        <div className="splash__meta">
          <span className="splash__version">v{APP_VERSION}</span>
          <span className="splash__dot" aria-hidden="true" />
          <span>{isDemo ? "Modo demo" : "Catálogo activo"}</span>
        </div>

        <div className="splash__progress" aria-hidden="true">
          <i />
        </div>

        <div className="splash__foot">
          <span>Hecho por</span>
          <button
            className="splash__link"
            onClick={(e) => {
              e.stopPropagation();
              void openTwitter();
              dismiss();
            }}
          >
            @neshack <IconExternal size={11} />
          </button>
          <span className="splash__hint">clic o Esc para entrar</span>
        </div>
      </div>
    </div>
  );
}
