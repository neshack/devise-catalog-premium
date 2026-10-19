import { describe, expect, it } from "vitest";
import { formatBytes, formatEta, percentOf } from "./format";

describe("formatBytes", () => {
  it("writes sizes the way a Spanish catalog reads them", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_572_864)).toBe("1,5 MB");
    // Whole units stay whole, and thousands use the Spanish separator.
    expect(formatBytes(100 * 1024 * 1024)).toBe("100 MB");
    // A real catalog value: the ZIP entry the app has been showing all along.
    expect(formatBytes(4_112_088)).toBe("3,9 MB");
    // The ladder promotes on its own: 1234 MB is read as GB.
    expect(formatBytes(1234 * 1024 * 1024)).toBe("1,2 GB");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatEta", () => {
  it("says the time left the way a person would", () => {
    expect(formatEta(null)).toBeNull();
    expect(formatEta(0)).toBe("1 s");
    expect(formatEta(45)).toBe("45 s");
    expect(formatEta(90)).toBe("2 min");
    expect(formatEta(3700)).toBe("1 h 2 min");
  });
});

describe("percentOf", () => {
  it("refuses to invent a percentage when there is no total", () => {
    expect(percentOf(50, 100)).toBe(50);
    expect(percentOf(3, null)).toBeNull();
    expect(percentOf(3, 0)).toBeNull();
    // A resume can index more than the estimate predicted: the bar caps, it
    // does not overflow.
    expect(percentOf(120, 100)).toBe(100);
  });
});
