// Capture key app states as PNGs for visual review (demo mode, no backend).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto("http://localhost:1420");
await page.waitForTimeout(700);
await shot("01-empty");

await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("*.jpg");
await page.waitForTimeout(700);
await shot("02-results");

// select a row to populate the inspector
await page.getByTestId("result-row").first().click();
await page.waitForTimeout(600);
await shot("03-inspector");

// duplicates view
await page.getByRole("tab", { name: /duplicados/i }).click();
await page.waitForTimeout(700);
await shot("04-duplicates");

// scan dialog
await page.getByRole("button", { name: /escanear volumen/i }).click();
await page.waitForTimeout(400);
await shot("05-scan-dialog");

// help popover
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Ayuda de sintaxis" }).click();
await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("size:>100MB");
await page.waitForTimeout(700);
await shot("06-help-and-chips");

// entries inside a ZIP: indexed without extracting
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.getByRole("tab", { name: /resultados/i }).click();
await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("IMG_9001");
await page.waitForTimeout(700);
await page.getByTestId("result-row").first().click();
await page.waitForTimeout(600);
await shot("07-zip-entry");

// scan in progress: the strip stays visible even with the dialog closed
await page.getByRole("button", { name: /escanear volumen/i }).click();
await page.waitForTimeout(300);
await page.getByLabel(/carpeta raíz/i).fill("/media/discos/cd-01");
await page.getByLabel(/^etiqueta/i).fill("Discos-2026");
await page.getByRole("button", { name: /^escanear$/i }).click();
await page.waitForTimeout(500);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await shot("08-scan-strip");

// paused: the walk stops but keeps saying so
await page.getByRole("button", { name: /^pausar$/i }).click();
await page.waitForTimeout(500);
await shot("09-scan-paused");

// the page dies mid-scan (like a killed app): the next start must say where
// the walk stopped and offer to continue
await page.reload();
await page.waitForTimeout(1200);
await shot("10-scan-interrupted");

await browser.close();
console.log("capturas listas");
