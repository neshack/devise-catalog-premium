import { describe, expect, it } from "vitest";
import {
  DEVICE_KINDS,
  DEVICE_TYPES,
  INDICATOR_PALETTE,
  deviceType,
  indicatorBackground,
  isDeviceKind,
  isHexColor,
  parseIndicatorColors,
} from "./devices";

describe("device types", () => {
  it("covers every kind with a plate and one or two valid colors", () => {
    expect(DEVICE_TYPES).toHaveLength(DEVICE_KINDS.length);
    for (const kind of DEVICE_KINDS) {
      const type = deviceType(kind);
      expect(type, kind).not.toBeNull();
      expect(type!.image).toMatch(/\.(webp|png|jpe?g)$/);
      expect(type!.defaultColors.length).toBeGreaterThanOrEqual(1);
      expect(type!.defaultColors.length).toBeLessThanOrEqual(2);
      for (const color of type!.defaultColors) expect(isHexColor(color), color).toBe(true);
    }
  });

  it("rejects a kind the backend would reject", () => {
    expect(isDeviceKind("floppy")).toBe(false);
    expect(deviceType("floppy")).toBeNull();
    expect(deviceType(null)).toBeNull();
  });

  it("keeps the palette unique and valid", () => {
    const hexes = INDICATOR_PALETTE.map((c) => c.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const hex of hexes) expect(isHexColor(hex), hex).toBe(true);
  });
});

describe("indicator colors", () => {
  it("parses one or two colors and normalizes case", () => {
    expect(parseIndicatorColors('["#FFAC1C"]')).toEqual(["#ffac1c"]);
    expect(parseIndicatorColors('["#35C6D6","#6A7CF5"]')).toEqual(["#35c6d6", "#6a7cf5"]);
  });

  it("degrades to no colors instead of throwing", () => {
    expect(parseIndicatorColors(null)).toEqual([]);
    expect(parseIndicatorColors("")).toEqual([]);
    expect(parseIndicatorColors("not json")).toEqual([]);
    expect(parseIndicatorColors('{"color":"#ffac1c"}')).toEqual([]);
    expect(parseIndicatorColors('["red","#ffac1c"]')).toEqual(["#ffac1c"]);
    expect(parseIndicatorColors('["#111111","#222222","#333333"]')).toEqual([
      "#111111",
      "#222222",
    ]);
  });

  it("builds a solid fill for one color and a split fill for two", () => {
    expect(indicatorBackground([])).toBe("");
    expect(indicatorBackground(["#ffac1c"])).toBe("#ffac1c");
    expect(indicatorBackground(["#ff4d6d", "#ffb02e"])).toBe(
      "linear-gradient(90deg, #ff4d6d 0 50%, #ffb02e 50% 100%)",
    );
    expect(indicatorBackground(["#ff4d6d", "#ffb02e"], "column")).toBe(
      "linear-gradient(180deg, #ff4d6d 0 50%, #ffb02e 50% 100%)",
    );
  });
});
