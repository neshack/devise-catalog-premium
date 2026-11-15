import { expect, test } from "@playwright/test";

/** A tiny PNG: enough for the browser to shrink it into a cover. */
const COVER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQEAIAAAANafqdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCh4AESYAqQykAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTEwLTMwVDAwOjE3OjM4KzAwOjAw1qLRjQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMC0zMFQwMDoxNzozOCswMDowMKf/aTEAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTAtMzBUMDA6MTc6MzgrMDA6MDDw6kjuAAABlUlEQVR42u3dsW0jMRCGUS1AuAMnKwfGNeBK5dhODFzuZq4GJ9cEuQ62BQECPrxXwQbEgPPPUNqO4/v75eUCCWPtx+3y+ejPgPsY87pumwNNxJgqNCFj7utdhaZizP24bR+P/gy4jzGvy5WDjLNCO9BEbP///X1+/Xn0Z8B9iO1I2X6evt7+PD/6M+A+xtzXu6aQCk0hKWI7UlRoUsbcl0khGZaTSBnz6spBh9iOFE0hKWMZfROiKSTljO0caCJUaFKsj5LiTSEpY+6HHJoMVw5SNIWkiO1IGcvomxAvVkixnESK9VFSVGhSzhzapJAIOTQprhykiO1IMVghxX+skKIpJMX6KCkqNCnWR0kZ83rcLiaFRBiskCK2I0VTSIofayRFhSZFbEeKlIMU66OkjLkfYjsyxtyXSSEZ/taNFE0hKeeVw4EmwptCUsR2pLhDk2J9lJTzxYoDTYTlJFLO9VGTQiI0haT4oRlSvFghZSyxHSEqNCnu0KRIOUixPkqKFyukmBSSYtuOFE0hKWN5sUKICk3KL2RHA2xqIf3SAAAAAElFTkSuQmCC",
  "base64",
);

test("el panel de volúmenes se pliega a iconos y lo recuerda", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: /volúmenes/i });
  await expect(sidebar).not.toHaveClass(/is-rail/);

  await page.getByRole("button", { name: /contraer panel de volúmenes/i }).click();
  await expect(page.getByRole("button", { name: /expandir panel de volúmenes/i })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(sidebar).toHaveClass(/is-rail/);
  // The icons keep their accessible name even when the text is gone.
  await expect(sidebar.getByRole("button", { name: /^Fotos-2024/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /expandir panel de volúmenes/i })).toBeVisible();
  await expect(page.getByRole("complementary", { name: /volúmenes/i })).toHaveClass(/is-rail/);
});

test("un escaneo terminado no bloquea el siguiente", async ({ page }) => {
  await page.goto("/");
  const scanButton = page
    .getByRole("complementary", { name: /volúmenes/i })
    .getByRole("button", { name: "Escanear volumen" });

  await scanButton.click();
  const dialog = page.getByRole("dialog", { name: /escanear volumen/i });
  await dialog.getByLabel(/etiqueta/i).fill("Disco E2E");
  await dialog.getByRole("button", { name: /^escanear$/i }).click();
  await expect(dialog.getByText(/escaneo finalizado/i)).toBeVisible({ timeout: 15_000 });
  await dialog.locator(".modal__foot").getByRole("button", { name: /^cerrar$/i }).click();
  await expect(dialog).toBeHidden();

  // The summary belonged to the previous attempt: the dialog that opens now
  // is a form again, with the fields empty and the scan button ready.
  await scanButton.click();
  await expect(dialog.getByLabel(/unidad o carpeta raíz/i)).toBeVisible();
  await expect(dialog.getByLabel(/etiqueta/i)).toHaveValue("");
  await expect(dialog.getByRole("button", { name: /^escanear$/i })).toBeEnabled();
});

test("la ficha guarda descripción e imagen del volumen", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: /volúmenes/i });
  await sidebar.getByRole("button", { name: /^Fotos-2024/ }).hover();
  await sidebar.getByRole("button", { name: /editar volumen Fotos-2024/i }).click();

  const dialog = page.getByRole("dialog", { name: /identificar volumen/i });
  await dialog.getByLabel(/descripción/i).fill("Fotos del viaje a Oaxaca");

  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: /elegir imagen/i }).click();
  await (await chooser).setFiles({
    name: "portada.png",
    mimeType: "image/png",
    buffer: COVER_PNG,
  });
  await expect(dialog.getByRole("img", { name: /imagen actual del volumen/i })).toBeVisible();

  await dialog.getByRole("button", { name: /guardar ficha/i }).click();
  await expect(dialog).toBeHidden();
  await expect(sidebar.getByText("Fotos del viaje a Oaxaca")).toBeVisible();
  // The cover replaces the plate (device or asset tag) in the identity slot.
  const row = sidebar.locator(".side-item-row").filter({ hasText: "Fotos-2024" });
  await expect(row.locator(".side-item__media")).toHaveClass(/has-cover/);
  await expect(row.locator(".side-item__media img")).toHaveCount(1);
});

test("el tipo de dispositivo y sus colores cambian el indicador del volumen", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: /volúmenes/i });
  await sidebar.getByRole("button", { name: /^Backup-12/ }).hover();
  await sidebar.getByRole("button", { name: /editar volumen Backup-12/i }).click();

  const dialog = page.getByRole("dialog", { name: /identificar volumen/i });
  // The demo seeds Backup-12 as an external drive with one green color.
  await expect(dialog.getByRole("radio", { name: /disco externo/i })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await dialog.getByRole("radio", { name: /volumen cifrado/i }).click();
  // The type brings its signature colors; the user can replace them.
  await expect(dialog.getByText("#FF4438")).toBeVisible();

  await dialog.getByRole("button", { name: "Cian" }).click();
  await expect(dialog.getByText("#35C6D6")).toBeVisible();

  await dialog.getByRole("button", { name: /segundo color/i }).click();
  await dialog.getByRole("button", { name: "Índigo" }).click();
  await expect(dialog.getByText(/#35C6D6\s+#6A7CF5/)).toBeVisible();

  await dialog.getByRole("button", { name: /guardar ficha/i }).click();
  await expect(dialog).toBeHidden();

  const row = sidebar.locator(".side-item-row").filter({ hasText: "Backup-12" });
  await expect(row.locator(".side-item__led")).toHaveAttribute("style", /linear-gradient/);
  await expect(row.locator(".side-item__media")).toHaveClass(/has-device/);

  // Reopening shows what was saved, not the type defaults again.
  await row.hover();
  await row.getByRole("button", { name: /editar volumen Backup-12/i }).click();
  const again = page.getByRole("dialog", { name: /identificar volumen/i });
  await expect(again.getByRole("radio", { name: /volumen cifrado/i })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(again.getByText(/#35C6D6\s+#6A7CF5/)).toBeVisible();
});

test("exportar toma el volumen seleccionado y lo dice", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: /volúmenes/i });
  await sidebar.getByRole("button", { name: /^Música-90s/ }).click();

  await page.getByRole("button", { name: "Exportar" }).click();
  await expect(page.getByText(/exportar volumen «Música-90s»/i)).toBeVisible();
  await page.getByRole("menuitem", { name: /^html/i }).click();

  await expect(page.getByText(/volumen «Música-90s» exportado \(HTML\)/i)).toBeVisible();
  await expect(page.getByText(/música-90s-demo-export\.html/)).toBeVisible();
});
