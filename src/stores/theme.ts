import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "devise-theme";
const MEDIA = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MEDIA).matches;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return prefersDark() ? "dark" : "light";
  return mode;
}

function readMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Private mode or storage disabled: the system preference is the answer.
  }
  return "system";
}

function apply(mode: ThemeMode): ResolvedTheme {
  const resolved = resolve(mode);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta !== null) meta.content = resolved === "dark" ? "#0d0f0e" : "#f4f2ec";
  }
  return resolved;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Apply the saved mode and follow the OS while the mode is `system`. */
  init: () => () => void;
}

const initial = readMode();
let watching = false;

export const useTheme = create<ThemeState>((set, get) => ({
  mode: initial,
  resolved: resolve(initial),

  setMode: (mode) => {
    const resolved = apply(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // The theme still applies for this window even if it cannot be saved.
    }
    set({ mode, resolved });
  },

  init: () => {
    set({ resolved: apply(get().mode) });
    if (typeof window === "undefined" || watching) return () => {};
    watching = true;
    const media = window.matchMedia(MEDIA);
    const onChange = () => {
      if (get().mode !== "system") return;
      set({ resolved: apply("system") });
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      watching = false;
    };
  },
}));
