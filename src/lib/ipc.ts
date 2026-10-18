/**
 * IPC layer: routes to the real Tauri backend when available and to the
 * in-memory demo catalog otherwise (`npm run dev`, e2e). Callers stay
 * backend-agnostic; `isDemo` lets the UI badge the mode honestly.
 */
import { invoke } from "@tauri-apps/api/core";
import type { ScanProgress } from "./types";
import { mockCall, onScanProgress as onMockScanProgress } from "./mock";

export const isDemo: boolean = typeof window === "undefined" || !("__TAURI_INTERNALS__" in window);

export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isDemo) return mockCall<T>(cmd, args);
  return invoke<T>(cmd, args);
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
