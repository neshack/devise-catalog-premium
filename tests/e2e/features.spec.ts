import { expect, test } from "@playwright/test";

test("buscar desde el árbol abre la pantalla de resultados", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await expect(page.getByRole("tab", { name: /árbol/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("*.mp3");

  await expect(page.getByRole("tab", { name: /resultados/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("result-row").first()).toBeVisible();
});

test("el menú contextual de un resultado lo ubica en el árbol", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("IMG_4412");
  const row = page.getByTestId("result-row").first();
  await expect(row).toBeVisible();

  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: /ubicar en el árbol/i }).click();

  await expect(page.getByRole("tab", { name: /árbol/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("tree-row").filter({ hasText: "IMG_4412.jpg" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: /detalles del archivo/i })).toContainText(
    "IMG_4412.jpg",
  );
});

test("la ficha muestra la ruta completa del archivo y de sus copias", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("informe-anual");

  const original = page
    .getByTestId("result-row")
    .filter({ hasText: "informe-anual.pdf" })
    .first();
  await original.click();

  const inspector = page.getByRole("complementary", { name: /detalles del archivo/i });
  await expect(inspector.getByText("/Documentos/informe-anual.pdf", { exact: true })).toBeVisible();
  await expect(
    inspector.getByText("/Documentos/antiguos/informe-anual (copia).pdf", { exact: true }),
  ).toBeVisible();
});

test("se pueden etiquetar archivos y encontrarlos por la etiqueta", async ({ page }) => {
  await page.goto("http://localhost:1420");
  const search = page.getByRole("textbox", { name: "Buscar en el catálogo" });
  await search.fill("informe-anual");
  await page.getByTestId("result-row").first().click();

  const inspector = page.getByRole("complementary", { name: /detalles del archivo/i });
  const tagInput = inspector.getByLabel("Nueva etiqueta");
  await tagInput.fill("importante");
  await tagInput.press("Enter");
  await expect(inspector.getByText("importante", { exact: true })).toBeVisible();

  await search.fill("#importante");
  await expect(page.getByTestId("result-row").first()).toBeVisible();
  await expect(page.getByTestId("result-row").first()).toContainText("informe-anual");
});

test("una etiqueta de carpeta encuentra todo su contenido", async ({ page }) => {
  await page.goto("http://localhost:1420");
  const sidebar = page.getByRole("complementary", { name: /volúmenes/i });
  await sidebar.getByText("Fotos-2024").click();

  const tree = page.getByRole("tree");
  await tree.getByRole("treeitem", { name: /2024/ }).first().click({ force: true });
  const video = tree.getByRole("treeitem", { name: /video/ });
  await expect(video).toBeVisible();
  await video.click({ button: "right" });
  await page.getByRole("menuitem", { name: /etiquetar carpeta/i }).click();

  const dialog = page.getByRole("dialog", { name: /etiquetas/i });
  const input = dialog.getByLabel("Nueva etiqueta");
  await input.fill("recuerdos");
  await input.press("Enter");
  await expect(dialog.getByText("recuerdos", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /listo/i }).click();

  await page.getByRole("textbox", { name: "Buscar en el catálogo" }).fill("#recuerdos");
  await expect(page.getByTestId("result-row")).toHaveCount(3);
  await expect(page.getByTestId("result-row").first()).toContainText(".mp4");
});
