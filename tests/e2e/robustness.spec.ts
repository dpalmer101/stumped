import { expect, test } from "@playwright/test";
import { LAUNCH, open, schedule } from "./helpers";

const { launchDate } = schedule;
const DAY = 86_400_000;

const NAMES = ["One", "Two", "Three", "Four", "Five", "Six"];

test.use({ reducedMotion: "reduce" });

test("facing a ball saves at once, so a reload straight after keeps the clock running", async ({
  context,
}) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.getByRole("button", { name: "Face ball" }).click();
  const prompt = await page.locator("#prompt").textContent();
  await page.close();

  const back = await open(context, new Date(LAUNCH.getTime() + 5_000));
  await expect(back.locator("#prompt")).toHaveText(prompt ?? "");
  await expect(back.getByRole("button", { name: "Face ball" })).toHaveCount(0);
});

test("mute is remembered", async ({ context }) => {
  // Tests start muted (see playwright.config.ts), so unmute and mute again.
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.getByRole("button", { name: "Unmute" }).click();
  await page.reload();
  await page.getByRole("button", { name: /Resume|Walk out/ }).click();
  await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Resume|Walk out/ }).click();
  await expect(page.getByRole("button", { name: "Unmute" })).toBeVisible();
});

test("corrupt saved data is discarded and the game still loads", async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem(
      "stumped",
      JSON.stringify({
        version: 1,
        innings: { puzzle: 1, balls: [null, null] },
        history: { 3: null },
      }),
    );
  });
  const errors: string[] = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: LAUNCH });
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a second tab can't restart a ball the first tab is facing", async ({ context }) => {
  const a = await open(context, LAUNCH);
  const b = await open(context, LAUNCH);
  await a.getByRole("button", { name: "Walk out to bat" }).click();
  await a.getByRole("button", { name: "Face ball" }).click();
  const prompt = await a.locator("#prompt").textContent();

  // Tab B still shows the home screen from before; acting on it must pick up tab A's ball.
  await b.getByRole("button", { name: /Walk out|Resume/ }).click();
  await expect(b.locator("#prompt")).toHaveText(prompt ?? "");
  await expect(b.getByRole("button", { name: "Face ball" })).toHaveCount(0);
});

test("the home screen moves to the new puzzle at midnight", async ({ context }) => {
  const page = await open(context, new Date(`${launchDate}T23:59:40`));
  await expect(page.getByText("#1 ·")).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(page.getByText("#2 ·")).toBeVisible();
});

test("before launch, the first over can't be played yet", async ({ context }) => {
  const page = await open(context, new Date(LAUNCH.getTime() - DAY));
  await expect(page.getByRole("button", { name: /First over on/ })).toBeDisabled();
});

test("every format renders every screen", async ({ context }) => {
  const page = await open(context, LAUNCH);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: "Face ball" }).click();
    await page.clock.runFor(21_000);
    if (i === 5) await page.getByRole("button", { name: "See scorecard" }).click();
  }
  for (const theme of ["village", "test", "oneday", "hundred"]) {
    await page.getByRole("button", { name: /Change format/ }).click();
    await expect(page.locator("body")).toHaveClass(`theme-${theme}`);
    await expect(page.locator("#total")).toHaveText("0/6");
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.getByRole("button", { name: "Answers", exact: true }).click();
    await expect(page.locator(".group").first()).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.getByRole("button", { name: "Back to scorecard" }).click();
  }
  await page.getByRole("button", { name: /Change format/ }).click();
  await page.reload();
  await expect(page.locator("#total")).toHaveText("0/6");
  expect(errors).toEqual([]);
});

test("if today's questions can't be loaded, the player can retry", async ({ context }) => {
  let block = true;
  await context.route("**/days/*.json", (route) => (block ? route.abort() : route.continue()));
  const page = await open(context, LAUNCH);
  await expect(page.getByText("Couldn't load today's over")).toBeVisible();
  block = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
});

test("the logo goes home from any screen, and play resumes where it left off", async ({
  context,
}) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.getByRole("button", { name: "Face ball" }).click();
  const prompt = await page.locator("#prompt").textContent();
  await page.getByRole("button", { name: "Stumped: home" }).click();
  await expect(page.getByRole("button", { name: "Resume innings" })).toBeVisible();
  await page.getByRole("button", { name: "Resume innings" }).click();
  await expect(page.locator("#prompt")).toHaveText(prompt ?? "");

  for (let i = 0; i < 6; i++) {
    if (i > 0) await page.getByRole("button", { name: `Face ball ${NAMES[i]}` }).click();
    await page.clock.runFor(21_000);
    if (i === 5) await page.getByRole("button", { name: "See scorecard" }).click();
  }
  await page.getByRole("button", { name: "Stumped: home" }).click();
  await expect(page.getByRole("button", { name: "Scorecard", exact: true })).toBeVisible();
});

test("a tab still on yesterday's over can't wipe today's innings in another tab", async ({
  context,
}) => {
  const midnight = new Date(`${schedule.launchDate}T00:00:00`).getTime() + 86_400_000;
  const old = await open(context, new Date(midnight - 10_000));
  await old.getByRole("button", { name: "Walk out to bat" }).click();
  await old.getByRole("button", { name: "Face ball" }).click();

  const today = await open(context, new Date(midnight + 5_000));
  await expect(today.getByText("#2 ·")).toBeVisible();
  await today.getByRole("button", { name: "Walk out to bat" }).click();
  await today.getByRole("button", { name: "Face ball" }).click();
  const prompt = await today.locator("#prompt").textContent();

  // The old tab keeps playing yesterday's over and saves.
  await old.locator("#guess").fill("Definitely not an answer");
  await old.locator("#guess").press("Enter");

  await today.reload();
  await expect(today.locator("#prompt")).toHaveText(prompt ?? "");
  await expect(today.getByRole("button", { name: "Face ball" })).toHaveCount(0);
});

test("double-tap and pinch zoom are turned off", async ({ context }) => {
  const page = await open(context, LAUNCH);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe(
    "pan-x pan-y",
  );
  const blocked = await page.evaluate(() => {
    const e = new Event("gesturestart", { cancelable: true });
    document.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(blocked).toBe(true);
});

test("with storage blocked (some private modes), the game still plays normally", async ({
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  // Storage can't hold the muted setting here, so mute by hand before any sound.
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page.getByRole("button", { name: "Face ball" }).click();
  await page.clock.runFor(21_000);
  await expect(page.locator(".res .call")).toHaveText("Out!");
  await expect(page.getByRole("button", { name: "Unmute" })).toBeVisible();
  await page.getByRole("button", { name: /Change format/ }).click();
  await page.getByRole("button", { name: /Change format/ }).click();
  await expect(page.locator("body")).toHaveClass("theme-test");
});

test("an over started before midnight stays playable from the home screen", async ({ context }) => {
  const page = await open(context, new Date(`${schedule.launchDate}T23:59:40`));
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.getByRole("button", { name: "Face ball" }).click();
  await page.getByRole("button", { name: "Stumped: home" }).click();
  await page.clock.runFor(60_000);
  await expect(page.getByText("#1 ·")).toBeVisible();
  await page.getByRole("button", { name: "Resume innings" }).click();
  await expect(page.getByRole("button", { name: "Face ball Two" })).toBeVisible();
});

test("first visit shows How to play once; it can be reopened from home", async ({ context }) => {
  await context.addInitScript(() => {
    if (sessionStorage.getItem("fresh")) return;
    sessionStorage.setItem("fresh", "1");
    localStorage.setItem(
      "stumped",
      JSON.stringify({ version: 1, muted: true, innings: null, history: {} }),
    );
  });
  const page = await open(context, LAUNCH);
  const sheet = page.getByRole("dialog", { name: "How to play" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("first right answer ends the ball");
  await expect(sheet.locator(".tier")).toHaveText([
    "Single",
    "Two",
    "Four",
    "Six",
    "Out of the ground",
  ]);
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(sheet).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(sheet).toBeVisible();
});

test("the format chip is hidden while a ball is live, and the clock's last 5 seconds stand out", async ({
  context,
}) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await expect(page.getByRole("button", { name: /Change format/ })).toBeVisible();
  await page.getByRole("button", { name: "Face ball" }).click();
  await expect(page.getByRole("button", { name: /Change format/ })).toHaveCount(0);
  await page.clock.runFor(16_000);
  await expect(page.locator("#track")).toHaveClass(/final/);
  await page.clock.runFor(5_000);
  await expect(page.getByRole("button", { name: /Change format/ })).toBeVisible();
});

test("the format chip and mute button have 44px touch targets", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  for (const name of [/Change format/, /^(Mute|Unmute)$/]) {
    const size = await page.getByRole("button", { name }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const before = getComputedStyle(el, "::before");
      return {
        w: r.width - Number.parseFloat(before.left) - Number.parseFloat(before.right),
        h: r.height - Number.parseFloat(before.top) - Number.parseFloat(before.bottom),
      };
    });
    expect(size.w).toBeGreaterThanOrEqual(44);
    expect(size.h).toBeGreaterThanOrEqual(44);
  }
});

test("?reset clears saved progress on a local copy", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.getByRole("button", { name: "Face ball" }).click();
  await page.goto("./?reset");
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
  expect(page.url()).not.toContain("reset");
});

test("How to play is a proper modal for keyboard users", async ({ context }) => {
  await context.addInitScript(() => {
    if (sessionStorage.getItem("fresh")) return;
    sessionStorage.setItem("fresh", "1");
    localStorage.setItem(
      "stumped",
      JSON.stringify({ version: 1, muted: true, innings: null, history: {} }),
    );
  });
  const page = await open(context, LAUNCH);
  await expect(page.getByRole("button", { name: "Got it" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Walk out to bat" })).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeFocused();
  await page.getByRole("button", { name: "How to play" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "How to play" })).toBeFocused();
});

test("local copies and tests never send play counts", async ({ context }) => {
  const sent: string[] = [];
  await context.route("**goatcounter.com/**", (route) => {
    sent.push(route.request().url());
    return route.abort();
  });
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.getByRole("button", { name: "Face ball" }).click();
  await page.clock.runFor(21_000);
  expect(sent).toEqual([]);
});

test("after the last scheduled day, the questions loop back to day 1", async ({ context }) => {
  const days = schedule.days.length;
  const page = await open(context, new Date(LAUNCH.getTime() + days * 86_400_000));
  await expect(page.getByText(`#${days + 1} ·`)).toBeVisible();
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.getByRole("button", { name: "Face ball" }).click();
  // Same first question as day 1, under the new puzzle number.
  const first = await page.locator("#prompt").textContent();
  const dayOne = await open(context, LAUNCH);
  await dayOne.getByRole("button", { name: "Walk out to bat" }).click();
  await dayOne.getByRole("button", { name: "Face ball" }).click();
  await expect(dayOne.locator("#prompt")).toHaveText(first ?? "");
});
