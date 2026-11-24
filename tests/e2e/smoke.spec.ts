import { expect, test } from "@playwright/test";

test("app loads under the GitHub Pages base path with no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("./");
  await expect(page).toHaveTitle("Stumped");
  await expect(page.getByRole("heading", { name: "Stumped" })).toBeVisible();
  expect(errors).toEqual([]);
});
