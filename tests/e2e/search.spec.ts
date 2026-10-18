import { test, expect } from "@playwright/test";

test("buscar *.mp3 muestra resultados en modo demo", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("*.mp3");
  await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("CD Catalog", { exact: false }).first()).toBeVisible();
});

test("la barra lateral lista volúmenes y filtra al hacer clic", async ({ page }) => {
  await page.goto("http://localhost:1420");
  const sidebar = page.getByRole("complementary", { name: /volúmenes/i });
  await expect(sidebar.getByText("Música-90s")).toBeVisible();
  await sidebar.getByText("Música-90s").click();
  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("*.flac");
  await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 10_000 });
});

test("el diálogo de escaneo valida los campos", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByRole("button", { name: /escanear volumen/i }).click();
  const dialog = page.getByRole("dialog", { name: /escanear volumen/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/carpeta raíz/i).fill("ruta-relativa");
  await dialog.getByLabel(/etiqueta/i).fill("Test");
  await dialog.getByLabel(/carpeta raíz/i).press("Enter");
  await expect(dialog.getByText(/ruta debe ser absoluta/i)).toBeVisible();
});

test("el inspector muestra detalles al seleccionar un resultado", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("informe-anual");
  const row = page.getByTestId("result-row").first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.getByText("Copias idénticas").first()).toBeVisible();
});
