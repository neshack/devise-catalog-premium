import { expect, test } from "@playwright/test";

test("el árbol recorre un volumen carpeta por carpeta", async ({ page }) => {
  await page.goto("http://localhost:1420");

  // The tree walks one volume at a time, so it needs one chosen first.
  await page.getByRole("button", { name: /Fotos-2024/ }).click();
  await page.getByRole("tab", { name: /árbol/i }).click();

  const tree = page.getByRole("tree");
  await expect(tree).toBeVisible({ timeout: 10_000 });

  // The root level is read on demand: one folder, still closed, already
  // saying what it holds.
  const year = tree.getByRole("treeitem", { name: /2024/ }).first();
  await expect(year).toBeVisible({ timeout: 10_000 });
  await expect(year).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByTestId("tree-row")).toHaveCount(1);

  await year.click();
  await expect(year).toHaveAttribute("aria-expanded", "true");
  const folder = tree.getByRole("treeitem", { name: /07-vacaciones/ });
  await expect(folder).toBeVisible();

  // Expanding again reveals what the folder holds, one level down.
  await folder.click();
  await expect(tree.getByRole("treeitem", { name: /RAW/ })).toBeVisible();
  const file = tree.getByRole("treeitem", { name: /IMG_/ }).first();
  await expect(file).toBeVisible();

  // Clicking a file hands it to the results list, where its details live.
  await file.click();
  await expect(page.getByTestId("result-row").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("complementary", { name: /detalles/i })).toContainText("IMG_");
});
