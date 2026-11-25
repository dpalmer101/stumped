import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { Question } from "../../src/engine/types";
import { LAUNCH, open, schedule } from "./helpers";

const QUESTIONS = "src/data/questions";
const pool = new Map(
  readdirSync(QUESTIONS)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(QUESTIONS, f), "utf8")) as Question[])
    .map((q) => [q.id, q]),
);
const dayOne = (schedule.days[0] ?? []).map((id) => pool.get(id) as Question);
const WRONG = "Definitely not an answer";

const single = (q: Question) => q.answers.find((a) => a.tier === "single")?.name ?? "";
const ootg = (q: Question) => q.answers.find((a) => a.tier === "ootg")?.name ?? "";

const NAMES = ["One", "Two", "Three", "Four", "Five", "Six"];

test.use({ reducedMotion: "reduce" });

async function faceBall(page: Page) {
  await page.getByRole("button", { name: "Face ball" }).click();
}

async function answer(page: Page, text: string) {
  const input = page.getByRole("textbox");
  await input.fill(text);
  await input.press("Enter");
}

test("plays a full innings, then shows only the scorecard until tomorrow", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await expect(page.getByRole("heading", { name: "Stumped" })).toBeVisible();
  await expect(page.getByText("#1 ·")).toBeVisible();
  await page.getByRole("button", { name: "Walk out to bat" }).click();

  for (const [i, q] of dayOne.entries()) {
    // The question must not be on the page until the ball is faced.
    if (i === 0) await expect(page.getByText("Ball One of Six")).toBeVisible();
    else
      await expect(
        page.getByRole("button", { name: `Face ball ${NAMES[i]?.toLowerCase()}`, exact: true }),
      ).toBeVisible();
    await expect(page.getByText(q.prompt)).toHaveCount(0);
    await faceBall(page);
    await expect(page.getByRole("heading", { name: q.prompt })).toBeVisible();

    await answer(page, WRONG);
    await expect(page.locator("#misses")).toContainText(WRONG);
    await answer(page, WRONG);
    await expect(page.getByText("Already tried that one")).toBeVisible();
    await expect(page.locator("#misses span")).toHaveCount(1);

    await answer(page, single(q));
    await expect(page.locator(".res .call")).toHaveText("Single");
    await expect(page.locator(".res")).toContainText("1 miss");
    // Other answers stay hidden until the innings is over.
    await expect(page.getByText(ootg(q), { exact: true })).toHaveCount(0);
    if (i === 5) await page.getByRole("button", { name: "See scorecard" }).click();
  }

  await expect(page.locator("#total")).toHaveText("6/0");
  await expect(page.locator("#shareText")).toContainText("Stumped #1 🏏 6/0");
  for (const q of dayOne) await expect(page.locator("#shareText")).not.toContainText(single(q));

  await page.reload();
  await expect(page.locator("#total")).toHaveText("6/0");
  await expect(page.getByRole("button", { name: "Face ball" })).toHaveCount(0);

  await page.getByRole("button", { name: "See all answers" }).click();
  const first = dayOne[0] as Question;
  await expect(page.getByRole("heading", { name: first.prompt })).toBeVisible();
  await expect(page.getByText(ootg(first), { exact: true })).toBeVisible();
  await expect(page.locator(".mine")).toContainText(single(first));
});

test("timer running out is OUT; no guesses is Timed out", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await faceBall(page);
  await page.clock.runFor(21_000);
  await expect(page.locator(".res .call")).toHaveText("Out!");
  await expect(page.locator(".res")).toContainText("Timed out");
  await expect(page.locator(".score")).toContainText("0/1");
  // One tap from the result straight into the next ball.
  await page.getByRole("button", { name: "Face ball Two" }).click();
  await expect(page.locator("#prompt")).toBeVisible();
});

test("the timer keeps running while the player is away", async ({ context }) => {
  const first = dayOne[0] as Question;
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await faceBall(page);
  await answer(page, WRONG);
  await page.close();

  // Back after 8 seconds: same ball, still live, misses kept.
  const soon = await open(context, new Date(LAUNCH.getTime() + 8_000));
  await expect(soon.getByRole("heading", { name: first.prompt })).toBeVisible();
  await expect(soon.locator("#misses")).toContainText(WRONG);
  await soon.close();

  // Back after 25 seconds: the ball was lost while away.
  const late = await open(context, new Date(LAUNCH.getTime() + 25_000));
  await expect(late.locator(".res .call")).toHaveText("Out!");
  await expect(late.locator(".res")).not.toContainText("Timed out");
  await expect(late.locator(".score")).toContainText("0/1");
});

test("format choice changes the look but never the game", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: /Test/ }).click();
  await expect(page.locator("body")).toHaveClass("theme-test");
  await page.reload();
  await expect(page.locator("body")).toHaveClass("theme-test");

  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await faceBall(page);
  await answer(page, single(dayOne[0] as Question));
  await expect(page.locator(".score")).toContainText("1/0");
  await page.getByRole("button", { name: /Change format/ }).click();
  await expect(page.locator("body")).toHaveClass("theme-oneday");
  await expect(page.locator(".score")).toContainText("1/0");
  await expect(page.locator(".res .call")).toHaveText("Single");
});

test("fits a 360px phone without sideways scrolling", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.setViewportSize({ width: 360, height: 740 });
  for (const step of ["Walk out to bat", "Face ball"]) {
    await page.getByRole("button", { name: step }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test("with the keyboard up, the timer, question and answer box stay on screen", async ({
  context,
}) => {
  const page = await open(context, LAUNCH);
  // About what's left of a small phone with the keyboard showing.
  await page.setViewportSize({ width: 375, height: 400 });
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await faceBall(page);
  for (const selector of ["#track", "#prompt", "#guess"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.y ?? -1, selector).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0), selector).toBeLessThanOrEqual(400);
  }
});

test.describe("archive", () => {
  const dayTwo = new Date(LAUNCH.getTime() + 86_400_000);

  async function playOver(page: Page, pick: (q: Question) => string) {
    for (const [i, q] of dayOne.entries()) {
      await faceBall(page);
      await expect(page.getByRole("heading", { name: q.prompt })).toBeVisible();
      await answer(page, pick(q));
      await expect(page.locator(".res")).toBeVisible();
      if (i === 5) await page.getByRole("button", { name: "See scorecard" }).click();
    }
  }

  test("plays a past day; the first go counts, replays don't, and streaks ignore it", async ({
    context,
  }) => {
    const page = await open(context, dayTwo);
    await page.getByRole("button", { name: "Play the archive" }).click();
    await expect(page.locator(".days li").first()).toContainText("#2");
    await expect(page.locator(".days li").first()).toContainText("Today");
    const dayOneRow = page.locator(".days li").nth(1);
    await expect(dayOneRow).toContainText("Not played");

    await dayOneRow.getByRole("button", { name: "Play: #1" }).click();
    await playOver(page, single);
    await expect(page.getByText("Archive · #1")).toBeVisible();
    await expect(page.locator("#total")).toHaveText("6/0");
    await expect(page.locator(".tile").filter({ hasText: "Played" })).toContainText("1");
    await expect(page.locator(".tile").filter({ hasText: /^\d+Streak$/ })).toContainText("0");

    await page.getByRole("button", { name: "Back to the archive" }).click();
    await expect(dayOneRow).toContainText("6/0 · from the archive");
    await dayOneRow.getByRole("button", { name: "Play again: #1" }).click();
    await playOver(page, ootg);
    await expect(page.locator("#total")).toHaveText("72/0");
    await expect(page.getByText("Replay: your first score of 6/0 stands.")).toBeVisible();
    await expect(page.locator(".tile").filter({ hasText: "Best" }).first()).toContainText("6");

    // Today's over is untouched.
    await page.getByRole("button", { name: "Stumped: home" }).click();
    await expect(page.getByText("#2 ·")).toBeVisible();
    await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeVisible();
  });

  test("today's over in progress is still there after an archive play", async ({ context }) => {
    const page = await open(context, dayTwo);
    await page.getByRole("button", { name: "Walk out to bat" }).click();
    await faceBall(page);
    await answer(page, single(pool.get(schedule.days[1]?.[0] ?? "") as Question));
    await expect(page.locator(".res")).toBeVisible();
    await page.getByRole("button", { name: "Stumped: home" }).click();
    await page.getByRole("button", { name: "Play the archive" }).click();
    await page.getByRole("button", { name: "Play: #1" }).click();
    await playOver(page, single);
    await page.getByRole("button", { name: "Stumped: home" }).click();
    await expect(page.getByRole("button", { name: "Resume innings" })).toBeVisible();
    await page.getByRole("button", { name: "Resume innings" }).click();
    await expect(page.locator(".pips i[data-t]")).toHaveCount(1);
  });

  test("an over started before midnight resumes from the archive as the real thing", async ({
    context,
  }) => {
    const lateNight = new Date(LAUNCH);
    lateNight.setHours(23, 59, 0, 0);
    const page = await open(context, lateNight);
    await page.getByRole("button", { name: "Walk out to bat" }).click();
    await faceBall(page);
    await answer(page, single(dayOne[0] as Question));
    await expect(page.locator(".res")).toBeVisible();
    await page.getByRole("button", { name: "Stumped: home" }).click();
    await page.clock.setSystemTime(new Date(dayTwo.getTime()));
    await page.getByRole("button", { name: "Play the archive" }).click();
    await page.getByRole("button", { name: "Resume: #1" }).click();
    await expect(page.locator(".pips i[data-t]")).toHaveCount(1);
    await expect(page.getByText("Ball Two of Six")).toBeVisible();
    await expect(page.getByText("Archive ·")).toHaveCount(0);
  });

  test("an unfinished first go resumes after a reload and still counts", async ({ context }) => {
    const page = await open(context, dayTwo);
    await page.getByRole("button", { name: "Play the archive" }).click();
    await page.getByRole("button", { name: "Play: #1" }).click();
    await faceBall(page);
    await answer(page, ootg(dayOne[0] as Question));
    await expect(page.locator(".res")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Play the archive" }).click();
    await page.getByRole("button", { name: "Resume: #1" }).click();
    await expect(page.locator(".pips i[data-t]")).toHaveCount(1);
    for (const [i, q] of dayOne.slice(1).entries()) {
      await faceBall(page);
      await answer(page, single(q));
      await expect(page.locator(".res")).toBeVisible();
      if (i === 4) await page.getByRole("button", { name: "See scorecard" }).click();
    }
    await expect(page.locator("#total")).toHaveText("17/0");
    await expect(page.getByText("Replay:")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to the archive" }).click();
    await expect(page.locator(".days li").nth(1)).toContainText("17/0 · from the archive");
  });

  test("today's unplayed over from the archive is the real thing", async ({ context }) => {
    const page = await open(context, LAUNCH);
    await page.getByRole("button", { name: "Play the archive" }).click();
    await page.getByRole("button", { name: "Play: #1" }).click();
    await playOver(page, single);
    await expect(page.getByText("Archive ·")).toHaveCount(0);
    await expect(page.getByText("Next innings in")).toBeVisible();
  });
});

test("holding the innings total reveals a hidden reset for today's over", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  for (const [i, q] of dayOne.entries()) {
    await faceBall(page);
    await answer(page, single(q));
    if (i === 5) await page.getByRole("button", { name: "See scorecard" }).click();
  }
  await expect(page.locator("#total")).toHaveText("6/0");
  const reset = page.getByRole("button", { name: "Reset today" });
  await expect(reset).toHaveCount(0);

  // A short press does nothing.
  const box = await page.locator("#flip").boundingBox();
  if (!box) throw new Error("no innings total");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(1000);
  await page.mouse.up();
  await page.clock.runFor(3000);
  await expect(reset).toHaveCount(0);

  // Cancel flips it back.
  await page.mouse.down();
  await page.clock.runFor(3100);
  await page.mouse.up();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(reset).toHaveCount(0);
  await expect(page.locator("#total")).toHaveText("6/0");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(3100);
  await page.mouse.up();
  await reset.click();
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeEnabled();
  // Today's over is gone from the stats too, and stays gone after a reload.
  await expect(page.getByText(/Played 1/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Walk out to bat" })).toBeEnabled();
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await expect(page.getByRole("button", { name: "Face ball" })).toBeVisible();
});

test.describe("easter eggs", () => {
  test("a total of nought brings out the duck", async ({ context }) => {
    const page = await open(context, LAUNCH);
    await page.getByRole("button", { name: "Walk out to bat" }).click();
    await faceBall(page);
    for (let i = 0; i < 6; i++) {
      await page.clock.runFor(21_000);
      // "Face ball Two" etc. goes straight into the next ball.
      await page.getByRole("button", { name: i === 5 ? "See scorecard" : /Face ball/ }).click();
    }
    await expect(page.locator("#total")).toHaveText("0/6");
    await expect(page.locator(".duck")).toBeVisible();
  });

  test("five quick taps on the far stumps knock the bails off, even mid-ball", async ({
    context,
  }) => {
    const page = await open(context, LAUNCH);
    await page.getByRole("button", { name: "Walk out to bat" }).click();
    const stumps = page.locator('[data-part="stumps-hit"]');
    for (let i = 0; i < 4; i++) await stumps.click({ force: true });
    await expect(page.locator("#callout")).not.toHaveText("Howzat!");
    await stumps.click({ force: true });
    await expect(page.locator("#callout")).toHaveText("Howzat!");

    await faceBall(page);
    await page.clock.runFor(2000);
    for (let i = 0; i < 5; i++) await stumps.click({ force: true });
    await expect(page.locator("#callout")).toHaveText("Howzat!");
    await expect(page.locator("#guess")).toBeFocused();
    // Still a live ball: nothing was scored or lost.
    await answer(page, single(dayOne[0] as Question));
    await expect(page.locator(".res .call")).toHaveText("Single");
  });

  test("typing Howzat is an appeal, not a guess", async ({ context }) => {
    const page = await open(context, LAUNCH);
    await page.getByRole("button", { name: "Walk out to bat" }).click();
    await faceBall(page);
    await answer(page, "Howzat!");
    await expect(page.locator("#callout")).toHaveText("Howzat!");
    await expect(page.locator("#misses span")).toHaveCount(0);
    await answer(page, single(dayOne[0] as Question));
    await expect(page.locator(".res .call")).toHaveText("Single");
  });
});

test.describe("logo", () => {
  // The rest of this file runs with reduced motion, which skips the ball.
  test.use({ reducedMotion: "no-preference" });

  test("tapping the logo knocks its letters off, and they come back", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("./");
    const logo = page.getByRole("heading", { name: "Stumped" });
    await logo.click();
    await expect(page.locator(".logo-ball")).toHaveCount(1);
    // Letters are back in place and the ball is gone once it's over.
    await expect(page.locator(".logo-ball")).toHaveCount(0, { timeout: 5000 });
    await expect
      .poll(
        () =>
          page
            .locator(".logo .l")
            .evaluateAll((els) => els.every((el) => el.getAnimations().length === 0)),
        {
          timeout: 5000,
        },
      )
      .toBe(true);
    await expect(logo).toBeVisible();
  });
});
