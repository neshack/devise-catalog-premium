// Regenera el icono de la aplicación a partir de la fuente vectorial.
//
//   node scripts/icon.mjs
//
// Renderiza src/assets/icon-source.svg a 1024×1024 con Chromium (así el
// degradado espectral sale igual que en pantalla) y luego deja que `tauri
// icon` derive el set completo: .icns, .ico, los PNG de Linux y los logotipos
// de Microsoft Store y Android/iOS.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve("src/assets/icon-source.svg");
const OUT = resolve("src-tauri/icons/icon-source.png");

const svg = readFileSync(SRC, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<html><body style="margin:0;width:1024px;height:1024px">${svg}</body></html>`,
);
await page.waitForTimeout(200);
await page.screenshot({ path: OUT, omitBackground: true });
await browser.close();
console.log("icono base:", OUT);

execFileSync("npx", ["tauri", "icon", OUT], { stdio: "inherit" });
