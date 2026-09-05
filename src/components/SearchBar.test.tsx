// src/components/SearchBar.test.tsx
import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "../lib/search";

describe("SearchBar query", () => {
  it("volume filter quoted", () => {
    const q = parseSearchQuery('informe volume:"Backup-12"');
    expect(q.volume).toBe("Backup-12");
    expect(q.fts).toContain("informe");
  });
});
