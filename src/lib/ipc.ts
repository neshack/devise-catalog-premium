/**
 * IPC layer: routes to the real Tauri backend when available and to the
 * in-memory demo catalog otherwise (`npm run dev`, e2e). Callers stay
 * backend-agnostic; `isDemo` lets the UI badge the mode honestly.
 */
import { invoke } from "@tauri-apps/api/core";
import type { ScanProgress } from "./types";
import { mockCall, onScanProgress as onMockScanProgress } from "./mock";

/** Versión del build que corre en la ventana (inyectada desde package.json). */
export const APP_VERSION = __APP_VERSION__;

export const isDemo: boolean = typeof window === "undefined" || !("__TAURI_INTERNALS__" in window);

/**
 * Tauri v2 exposes Rust arguments in camelCase. Callers may keep writing the
 * Rust name (`file_id`, `out_path`) without the IPC layer ever sending a key
 * the backend cannot find, which is exactly how a command starts failing with
 * "missing required key".
 */
export function toTauriArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return out;
}

export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isDemo) return mockCall<T>(cmd, args);
  return invoke<T>(cmd, toTauriArgs(args));
}

/** Open the author's profile in the system browser, never inside the app. */
export async function openTwitter(): Promise<void> {
  const url = "https://x.com/neshack";
  if (isDemo) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_twitter");
}

/** Subscribe to scan progress (real: `scan://progress` events; demo: bus). */
export async function onScanProgress(cb: (p: ScanProgress) => void): Promise<() => void> {
  if (isDemo) return onMockScanProgress(cb);
  const { listen } = await import("@tauri-apps/api/event");
  const un = await listen<ScanProgress>("scan://progress", (e) => cb(e.payload));
  return () => void un();
}

export async function resolveDbPath(): Promise<string> {
  if (isDemo) return "~/Catalogo/catalog.cdc (demo)";
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    return await join(await appDataDir(), "catalog.cdc");
  } catch {
    return "catalog.cdc";
  }
}
