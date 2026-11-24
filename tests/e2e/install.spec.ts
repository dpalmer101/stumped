import { expect, test } from "@playwright/test";
import { LAUNCH, open } from "./helpers";

test("the app can be installed: manifest and icons are served", async ({ page, request }) => {
  await page.goto("./");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href ?? "")).json();
  expect(manifest).toMatchObject({ name: "Stumped", display: "standalone", start_url: "./" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect(
      (await request.get(new URL(icon.src, new URL(href ?? "", page.url())).href)).status(),
    ).toBe(200);
  }
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(touch ?? "")).status()).toBe(200);
});

test("on an iPhone, the home screen offers Add to home screen with instructions", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "mobile-webkit", "iPhone only");
  const page = await open(context, LAUNCH);
  const button = page.getByRole("button", { name: "Add to home screen" });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator(".install-help")).toContainText("Add to Home Screen");

  // Only on the home screen.
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await expect(page.getByRole("button", { name: "Add to home screen" })).toHaveCount(0);
});

test("on desktop, there's no install button without a browser prompt", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "chromium", "desktop only");
  const page = await open(context, LAUNCH);
  await expect(page.getByRole("heading", { name: "Stumped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to home screen" })).toHaveCount(0);
});
