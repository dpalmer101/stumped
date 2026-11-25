import { expect, type Page, test } from "@playwright/test";
import { LAUNCH, open } from "./helpers";

test.use({ reducedMotion: "reduce" });

/** Pretend a newer deploy has gone out, then bring the page back to the foreground. */
async function newDeploy(page: Page) {
  await page.route("**/version.json*", (route) =>
    route.fulfill({ json: { build: "a-newer-build" } }),
  );
  await page.evaluate(() => {
    (window as Window & { marker?: boolean }).marker = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const reloaded = (page: Page) =>
  page.evaluate(() => !(window as Window & { marker?: boolean }).marker);

test("a newer deploy reloads the home screen, once, and tidies the URL", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
  await newDeploy(page);
  await expect.poll(() => reloaded(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");

  // Still served the old page: no second reload for the same build straight away…
  await newDeploy(page);
  await page.waitForTimeout(500);
  expect(await reloaded(page)).toBe(false);
  // …but it tries again once a check interval has passed.
  await page.clock.fastForward("11:00");
  await expect.poll(() => reloaded(page)).toBe(true);
});

test("never reloads during a ball; waits for the next safe screen", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await newDeploy(page);
  await page.waitForTimeout(500);
  expect(await reloaded(page)).toBe(false);

  await page.getByRole("button", { name: "Face ball" }).click();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(500);
  expect(await reloaded(page)).toBe(false);
  await expect(page.getByRole("textbox")).toBeVisible();

  await page.getByRole("button", { name: "Stumped: home" }).click();
  await expect.poll(() => reloaded(page)).toBe(true);
});
