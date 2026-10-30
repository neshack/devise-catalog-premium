/**
 * Covers and folders come from the operating system, not from the web view.
 *
 * In the desktop app the native dialog returns an absolute path / an embedded
 * JPEG data URL. In the browser demo there is no native dialog, so a folder
 * cannot be chosen (the button says so) but an image can: the browser shrinks
 * it with a canvas to the same data URL the backend produces.
 */
import { isDemo, call } from "./ipc";

/** Long side of a stored cover, matching the backend's thumbnail. */
const COVER_SIDE = 256;
const JPEG_QUALITY = 0.78;
const BACKDROP = "#191d1a";

export async function pickScanFolder(): Promise<string | null> {
  if (isDemo) return null;
  return await call<string | null>("pick_scan_folder");
}

export async function pickCoverImage(): Promise<string | null> {
  if (!isDemo) return await call<string | null>("pick_volume_cover");
  return await pickInBrowser();
}

function pickInBrowser(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.style.display = "none";
    document.body.appendChild(input);
    let settled = false;
    let chosen = false;
    const done = (value: string | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      input.remove();
      if (error !== undefined) reject(error);
      else resolve(value);
    };
    input.addEventListener(
      "change",
      () => {
        chosen = true;
        const file = input.files?.[0];
        if (file === undefined) return done(null);
        shrink(file).then(
          (url) => done(url),
          (e: unknown) => done(null, e),
        );
      },
      { once: true },
    );
    input.addEventListener("cancel", () => done(null), { once: true });
    // Some webviews do not emit `cancel`; regaining focus after the native
    // dialog closed means the choice is over, and "Abriendo…" must not last
    // forever. A chosen file is left to finish shrinking.
    window.addEventListener(
      "focus",
      () => window.setTimeout(() => chosen || done(null), 400),
      { once: true },
    );
    input.click();
  });
}

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, COVER_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("el navegador no pudo preparar la imagen");
  // Transparent pictures get the same plate color the desktop app uses.
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
