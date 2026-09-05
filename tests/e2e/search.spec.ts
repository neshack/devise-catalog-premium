import { test, expect } from "@playwright/test";

test("buscar *.mp3 muestra resultados", async ({ page }) => {
  await page.goto("http://localhost:1420");
  await page.getByPlaceholder(/mp3/i).fill("*.mp3");
  await expect(page.getByText("CD Catalog Premium")).toBeVisible();
});
