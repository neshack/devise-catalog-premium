import { describe, expect, it } from "vitest";
import { describeImageMeta, describeAudioMeta, parseAudioMeta, parseImageMeta } from "./media";

describe("parseAudioMeta", () => {
  it("reads the fields the backend stores", () => {
    const meta = parseAudioMeta('{"artist":"Nina Simone","album":"Feeling Good","bitrate":1411}');
    expect(meta).toEqual({ artist: "Nina Simone", album: "Feeling Good", bitrate: 1411 });
  });

  it("treats missing, empty and corrupt payloads as no metadata", () => {
    expect(parseAudioMeta(null)).toBeNull();
    expect(parseAudioMeta("")).toBeNull();
    expect(parseAudioMeta("{}")).toBeNull();
    expect(parseAudioMeta("{not json")).toBeNull();
    expect(parseAudioMeta('{"artist":null}')).toBeNull();
  });
});

describe("parseImageMeta", () => {
  it("reads dimensions", () => {
    expect(parseImageMeta('{"width":4032,"height":3024}')).toEqual({ width: 4032, height: 3024 });
  });

  it("keeps a single known dimension and drops unknown payloads", () => {
    expect(parseImageMeta('{"width":640}')).toEqual({ width: 640 });
    expect(parseImageMeta("null")).toBeNull();
    expect(parseImageMeta('{"width":"wide"}')).toBeNull();
  });
});

describe("labels", () => {
  it("formats audio rows for the inspector", () => {
    expect(describeAudioMeta({ artist: "Nina Simone", album: "Feeling Good", bitrate: 1411 })).toEqual([
      ["Intérprete", "Nina Simone"],
      ["Álbum", "Feeling Good"],
      ["Bitrate", "1411 kbps"],
    ]);
  });

  it("formats image rows for the inspector", () => {
    expect(describeImageMeta({ width: 4032, height: 3024 })).toEqual([["Dimensiones", "4032 × 3024"]]);
    expect(describeImageMeta({ width: 640 })).toEqual([["Dimensiones", "640 px"]]);
  });
});
