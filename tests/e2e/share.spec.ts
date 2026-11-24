import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { LAUNCH, open } from "./helpers";

test.use({ reducedMotion: "reduce" });

/** Six timed-out balls: the quickest way to a scorecard. */
async function finishInnings(context: BrowserContext): Promise<Page> {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: "Face ball" }).click();
    await page.clock.runFor(21_000);
    if (i === 5) await page.getByRole("button", { name: "See scorecard" }).click();
  }
  return page;
}

test("Share opens the device's share sheet with the result", async ({ context }) => {
  await context.addInitScript(() => {
    const w = window as unknown as { shared?: ShareData };
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        w.shared = data;
      },
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  });
  const page = await finishInnings(context);
  await page.getByRole("button", { name: "Share" }).click();
  const shared = await page.evaluate(() => (window as unknown as { shared?: ShareData }).shared);
  expect(shared?.text).toContain("Stumped #1 🏏 0/6");
  expect(shared?.text).toContain("/stumped/");
});

test("cancelling the share sheet does nothing", async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    });
  });
  const page = await finishInnings(context);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.locator("#toast")).toHaveText("");
});

test("without a share sheet (e.g. plain http), Share copies the result instead", async ({
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("not allowed on http")) },
    });
    const w = window as unknown as { copied?: string };
    document.execCommand = (cmd: string) => {
      if (cmd === "copy") w.copied = (document.activeElement as HTMLTextAreaElement).value;
      return cmd === "copy";
    };
  });
  const page = await finishInnings(context);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.locator("#toast")).toHaveText("Copied: paste it anywhere to share");
  expect(await page.evaluate(() => (window as unknown as { copied?: string }).copied)).toContain(
    "Stumped #1 🏏 0/6",
  );
});
