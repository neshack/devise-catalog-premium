/**
 * Device identity of a volume: the plate that stands for the kind of media,
 * and the one or two colors the user assigns to its indicator.
 *
 * The plate is deliberately colorless. Colors belong to the volume, not to the
 * device type, so the same illustration can carry any pair the user picks.
 */
import card from "../assets/devices/card.webp";
import encrypted from "../assets/devices/encrypted.webp";
import external from "../assets/devices/external.webp";
import image from "../assets/devices/image.webp";
import internal from "../assets/devices/internal.webp";
import nas from "../assets/devices/nas.webp";
import optical from "../assets/devices/optical.webp";
import usb from "../assets/devices/usb.webp";

export const DEVICE_KINDS = [
  "optical",
  "usb",
  "external",
  "card",
  "internal",
  "nas",
  "image",
  "encrypted",
] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];

export interface DeviceType {
  kind: DeviceKind;
  /** What the type is called in the window. */
  label: string;
  /** The concrete media it covers, for the help line and the tooltip. */
  hint: string;
  /** Colors loaded when this type is chosen; never more than two. */
  defaultColors: readonly string[];
  /** Catalog plate bundled with the app. */
  image: string;
}

export const DEVICE_TYPES: readonly DeviceType[] = [
  {
    kind: "optical",
    label: "Disco óptico",
    hint: "CD, DVD o Blu-ray de datos",
    defaultColors: ["#ff4d6d", "#ffb02e"],
    image: optical,
  },
  {
    kind: "usb",
    label: "Memoria USB",
    hint: "Pendrive o llavero",
    defaultColors: ["#ffac1c"],
    image: usb,
  },
  {
    kind: "external",
    label: "Disco externo",
    hint: "HDD o SSD portátil",
    defaultColors: ["#8fd96a"],
    image: external,
  },
  {
    kind: "card",
    label: "Tarjeta SD",
    hint: "SD, microSD o lector",
    defaultColors: ["#35c6d6"],
    image: card,
  },
  {
    kind: "internal",
    label: "Disco interno",
    hint: "HDD, SSD o NVMe",
    defaultColors: ["#6a7cf5"],
    image: internal,
  },
  {
    kind: "nas",
    label: "NAS o red",
    hint: "SMB, NFS o carpeta compartida",
    defaultColors: ["#ff4d6d"],
    image: nas,
  },
  {
    kind: "image",
    label: "Imagen montada",
    hint: "ISO, DMG o VHD",
    defaultColors: ["#35c6d6", "#6a7cf5"],
    image: image,
  },
  {
    kind: "encrypted",
    label: "Volumen cifrado",
    hint: "LUKS, BitLocker o VeraCrypt",
    defaultColors: ["#ff4438"],
    image: encrypted,
  },
];

/** The app's ornaments, offered so a pick never leaves the palette by accident. */
export const INDICATOR_PALETTE = [
  { hex: "#ffac1c", label: "Ámbar" },
  { hex: "#ff4438", label: "Rojo láser" },
  { hex: "#ff4d6d", label: "Rosa" },
  { hex: "#8fd96a", label: "Verde" },
  { hex: "#35c6d6", label: "Cian" },
  { hex: "#6a7cf5", label: "Índigo" },
  { hex: "#ecefe9", label: "Hueso" },
  { hex: "#7d8a80", label: "Grafito" },
] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function isDeviceKind(value: string | null | undefined): value is DeviceKind {
  return value !== null && value !== undefined && (DEVICE_KINDS as readonly string[]).includes(value);
}

export function deviceType(kind: string | null | undefined): DeviceType | null {
  if (!isDeviceKind(kind)) return null;
  return DEVICE_TYPES.find((t) => t.kind === kind) ?? null;
}

/**
 * Read the JSON array the catalog stores. A corrupted or hand-edited value is
 * not an error the window can fix, so it degrades to "no colors" instead of
 * taking the volume list down with it.
 */
export function parseIndicatorColors(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((c): c is string => typeof c === "string" && HEX_COLOR.test(c))
      .slice(0, 2)
      .map((c) => c.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * CSS background for surfaces that cannot render two elements: one color fills
 * the surface, two split it in half along the requested axis.
 */
export function indicatorBackground(
  colors: readonly string[],
  direction: "row" | "column" = "row",
): string {
  if (colors.length === 0) return "";
  if (colors.length === 1) return colors[0];
  const angle = direction === "row" ? "90deg" : "180deg";
  return `linear-gradient(${angle}, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)`;
}
