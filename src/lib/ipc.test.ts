import { describe, expect, it } from "vitest";
import { toTauriArgs } from "./ipc";

describe("toTauriArgs", () => {
  it("turns Rust argument names into the camelCase Tauri v2 expects", () => {
    // The regression: `file_id` reached the backend as `file_id`, Tauri looked
    // for `fileId` and the command failed with "missing required key".
    expect(
      toTauriArgs({
        dbPath: "/tmp/catalog.cdc",
        file_id: 7,
        out_path: null,
        volume_serial: "SER-1",
      }),
    ).toEqual({
      dbPath: "/tmp/catalog.cdc",
      fileId: 7,
      outPath: null,
      volumeSerial: "SER-1",
    });
  });

  it("leaves already-camelCase keys untouched", () => {
    expect(toTauriArgs({ dbPath: "x", fileId: 3 })).toEqual({ dbPath: "x", fileId: 3 });
  });
});
