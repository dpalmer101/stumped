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

/** True once the marker is gone; mid-navigation there's no page to ask, so not yet. */
const reloaded = (page: Page) =>
  page.evaluate(() => !(window as Window & { marker?: boolean }).marker).catch(() => false);

/** Strict: a navigation in progress fails this, as it should. */
const samePage = (page: Page) =>
  page.evaluate(() => (window as Window & { marker?: boolean }).marker === true);

test("a newer deploy reloads the home screen, once, and tidies the URL", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
  await newDeploy(page);
  await expect.poll(() => reloaded(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await page.waitForLoadState("load");

  // Still served the old page: no second reload for the same build straight away…
  await newDeploy(page);
  await page.waitForTimeout(500);
  expect(await samePage(page)).toBe(true);
  // …but it tries again once a check interval has passed.
  await page.clock.fastForward("11:00");
  await expect.poll(() => reloaded(page)).toBe(true);
});

test("never reloads during a ball; waits for the next safe screen", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await newDeploy(page);
  await page.waitForTimeout(500);
  expect(await samePage(page)).toBe(true);

  await page.getByRole("button", { name: "Face ball" }).click();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(500);
  expect(await samePage(page)).toBe(true);
  await expect(page.getByRole("textbox")).toBeVisible();

  await page.getByRole("button", { name: "Stumped: home" }).click();
  await expect.poll(() => reloaded(page)).toBe(true);
});
