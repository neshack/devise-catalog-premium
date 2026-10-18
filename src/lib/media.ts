/**
 * Media metadata stored by the scanner in the `audio_json` / `image_json`
 * columns (`core-parsers`), turned into rows the inspector can render.
 *
 * The payloads come from third-party parsers, so nothing here trusts their
 * shape: anything unexpected counts as "no metadata".
 */

export interface AudioMeta {
  artist?: string;
  album?: string;
  bitrate?: number;
}

export interface ImageMeta {
  width?: number;
  height?: number;
}

/** `[label, value]`, ready to render as an inspector field. */
export type MetaRow = [string, string];

function parseObject(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

export function parseAudioMeta(json: string | null): AudioMeta | null {
  const raw = parseObject(json);
  if (raw === null) return null;
  const meta: AudioMeta = {
    artist: text(raw.artist),
    album: text(raw.album),
    bitrate: positiveNumber(raw.bitrate),
  };
  return meta.artist ?? meta.album ?? meta.bitrate ? meta : null;
}

export function parseImageMeta(json: string | null): ImageMeta | null {
  const raw = parseObject(json);
  if (raw === null) return null;
  const meta: ImageMeta = {
    width: positiveNumber(raw.width),
    height: positiveNumber(raw.height),
  };
  return meta.width ?? meta.height ? meta : null;
}

export function describeAudioMeta(meta: AudioMeta): MetaRow[] {
  const rows: MetaRow[] = [];
  if (meta.artist !== undefined) rows.push(["Intérprete", meta.artist]);
  if (meta.album !== undefined) rows.push(["Álbum", meta.album]);
  if (meta.bitrate !== undefined) rows.push(["Bitrate", `${meta.bitrate} kbps`]);
  return rows;
}

export function describeImageMeta(meta: ImageMeta): MetaRow[] {
  if (meta.width !== undefined && meta.height !== undefined) {
    return [["Dimensiones", `${meta.width} × ${meta.height}`]];
  }
  const only = meta.width ?? meta.height;
  return only === undefined ? [] : [["Dimensiones", `${only} px`]];
}
