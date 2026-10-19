import type { TreeChildren, TreeDir, TreeFile } from "./types";

/** One rendered line of the tree. */
export interface TreeRow {
  key: string;
  depth: number;
  dir: TreeDir | null;
  file: TreeFile | null;
}

/** Cache key of a volume's top level. */
export const TREE_ROOT = "root";

/** Cache key of a folder's children: its id, as a string. */
export function treeKey(dirId: number): string {
  return String(dirId);
}

/**
 * Turns loaded levels into the flat list the window renders.
 *
 * Folders come before the files of the level they belong to, and a collapsed
 * folder hides everything below it without forgetting it: the cache keeps what
 * was already read, so reopening it costs nothing.
 */
export function flattenTree(
  children: Record<string, TreeChildren>,
  expanded: string[],
): TreeRow[] {
  const open = new Set(expanded);
  const rows: TreeRow[] = [];
  const walk = (key: string, depth: number) => {
    const level = children[key];
    if (level === undefined) return;
    for (const dir of level.dirs) {
      rows.push({ key: `dir:${dir.id}`, depth, dir, file: null });
      if (open.has(treeKey(dir.id))) walk(treeKey(dir.id), depth + 1);
    }
    for (const file of level.files) {
      rows.push({ key: `file:${file.id}`, depth, dir: null, file });
    }
  };
  walk(TREE_ROOT, 0);
  return rows;
}
