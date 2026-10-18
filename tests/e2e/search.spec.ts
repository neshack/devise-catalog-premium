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

test("el inspector muestra los metadatos guardados por el escáner", async ({ page }) => {
  await page.goto("http://localhost:1420");
  const search = page.getByRole("textbox", { name: "Buscar en el catálogo" });

  // Audio: ID3 fields land in the panel.
  await search.fill("Smells-Like-Teen-Spirit");
  const track = page.getByTestId("result-row").first();
  await expect(track).toBeVisible({ timeout: 10_000 });
  await track.click();
  const inspector = page.getByRole("complementary", { name: /detalles del archivo/i });
  await expect(inspector.getByText("Intérprete")).toBeVisible();
  await expect(inspector.getByText("Nirvana")).toBeVisible();
  await expect(inspector.getByText("1411 kbps")).toBeVisible();

  // Image: EXIF dimensions land in the panel. Wait for the new result set
  // first: a search that lands after the click clears the selection again.
  await search.fill("IMG_4412");
  await expect(page.getByTestId("result-row")).toHaveCount(3);
  const photo = page.getByTestId("result-row").first();
  await expect(photo).toBeVisible({ timeout: 10_000 });
  await photo.click();
  await expect(inspector.getByText("Dimensiones")).toBeVisible();
  await expect(inspector.getByText("4032 × 3024")).toBeVisible();
});

test("el inspector muestra los archivos dentro de un ZIP sin extraerlos", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("IMG_9001");

  // The row says where the entry lives instead of pretending it is a folder.
  const row = page.getByTestId("result-row").first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText("DCIM/IMG_9001.jpg");
  // En la fila basta el nombre del ZIP; la ruta completa espera en el tooltip.
  await expect(row).toContainText("dentro de backup-movil.zip");
  await expect(row).toHaveAttribute("title", "/Comprimidos/backup-movil.zip/DCIM/IMG_9001.jpg");

  await row.click();
  const inspector = page.getByRole("complementary", { name: /detalles del archivo/i });
  await expect(inspector.getByText("Contenido en")).toBeVisible();
  await expect(inspector.getByText("Comprimidos/backup-movil.zip")).toBeVisible();
  // Nothing inside an archive is hashed or parsed.
  await expect(inspector.locator(".field").filter({ hasText: "Hash" })).toContainText("—");
  // …and the panel must not tell the user to rescan for something a rescan
  // would never compute.
  await expect(inspector.getByText(/dentro de un ZIP no se hashean/)).toBeVisible();
  await expect(inspector.getByText(/vuelve a escanear/)).toHaveCount(0);
});
