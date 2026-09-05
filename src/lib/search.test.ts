import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./search";
describe("parseSearchQuery", () => {
  it("*.mp3 size filter", () => {
    const q = parseSearchQuery("*.mp3 size:>5MB");
    expect(q.ext).toBe("mp3");
    expect(q.min_size).toBe(5 * 1024 * 1024);
    expect(q.fts).toContain("mp3");
  });
});
