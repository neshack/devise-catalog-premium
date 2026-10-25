import { expect, test } from "@playwright/test";

test("el splash presenta la versión y el enlace del autor", async ({ page }) => {
  await page.goto("http://localhost:1420/?splash=1");

  const splash = page.getByRole("dialog", { name: /presentación de devise catalog premium/i });
  await expect(splash).toBeVisible();
  await expect(splash.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  await expect(splash.getByRole("button", { name: /@neshack/i })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(splash).toBeHidden();
});

test("el tema claro se elige, se recuerda y sigue al sistema", async ({ page }) => {
  await page.goto("http://localhost:1420");
  const html = page.locator("html");

  await page.getByRole("button", { name: /tema:/i }).click();
  await page.getByRole("menuitemradio", { name: /claro/i }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");

  // System is a live preference, not a one-time copy of the OS theme.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: /tema:/i }).click();
  await page.getByRole("menuitemradio", { name: /sistema/i }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("eliminar un volumen exige confirmación y no toca el disco", async ({ page }) => {
  await page.goto("http://localhost:1420");

  const sidebar = page.getByRole("complementary", { name: /volúmenes/i });
  await expect(sidebar.getByText("Fotos-2024")).toBeVisible();
  await sidebar.getByText("Fotos-2024").hover();
  await sidebar.getByRole("button", { name: /Eliminar volumen Fotos-2024/i }).click();

  const dialog = page.getByRole("alertdialog", { name: /eliminar volumen/i });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: /eliminar del catálogo/i });
  await expect(confirm).toBeDisabled();

  // The label is the second, deliberate step: a stray click cannot erase an
  // index that took hours to build.
  await dialog.getByLabel(/escribe/i).fill("Fotos-2024");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(dialog).toBeHidden();
  await expect(sidebar.getByText("Fotos-2024")).toHaveCount(0);
  await expect(page.getByText(/eliminado del catálogo/i)).toBeVisible();
  await expect(page.getByText(/archivos del disco siguen intactos/i)).toBeVisible();
});
