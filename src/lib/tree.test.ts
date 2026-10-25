import { describe, expect, it } from "vitest";
import { flattenTree, TREE_ROOT } from "./tree";
import type { TreeChildren, TreeDir, TreeFile } from "./types";

const dir = (id: number, name: string): TreeDir => ({
  id,
  name,
  files: 0,
  dirs: 0,
  size: 0,
  tags: [],
});
const file = (id: number, name: string): TreeFile => ({
  id,
  name,
  ext: "jpg",
  size: 10,
  mtime: 0,
  container_path: null,
  tags: [],
});
const level = (dirs: TreeDir[], files: TreeFile[]): TreeChildren => ({
  dirs,
  files,
  files_total: files.length,
  dirs_total: dirs.length,
});

describe("flattenTree", () => {
  it("lists folders before the files of their level, nesting what is open", () => {
    const children = {
      [TREE_ROOT]: level([dir(1, "Fotos"), dir(2, "Musica")], [file(9, "leeme.txt")]),
      "1": level([dir(3, "2024")], [file(10, "IMG_0001.jpg")]),
      "3": level([], [file(11, "vieja.jpg")]),
    };

    const collapsed = flattenTree(children, []);
    expect(collapsed.map((r) => r.key)).toEqual(["dir:1", "dir:2", "file:9"]);
    expect(collapsed.map((r) => r.depth)).toEqual([0, 0, 0]);

    const open = flattenTree(children, ["1", "3"]);
    expect(open.map((r) => `${r.key}@${r.depth}`)).toEqual([
      "dir:1@0",
      "dir:3@1",
      "file:11@2",
      "file:10@1",
      "dir:2@0",
      "file:9@0",
    ]);
  });

  it("hides a collapsed folder without forgetting what it holds", () => {
    const children = {
      [TREE_ROOT]: level([dir(1, "Fotos")], []),
      "1": level([], [file(2, "IMG_0001.jpg")]),
    };
    expect(flattenTree(children, []).map((r) => r.key)).toEqual(["dir:1"]);
    // The cache keeps the level, so reopening it costs nothing and shows it.
    expect(flattenTree(children, ["1"]).map((r) => r.key)).toEqual(["dir:1", "file:2"]);
  });

  it("ignores an open folder that was never read", () => {
    const children = { [TREE_ROOT]: level([dir(1, "Fotos")], []) };
    expect(flattenTree(children, ["7"]).map((r) => r.key)).toEqual(["dir:1"]);
  });
});
