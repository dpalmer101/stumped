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
    else await expect(page.getByRole("button", { name: `Face ball ${NAMES[i]}` })).toBeVisible();
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

test("holding the innings total reveals a hidden reset for today's over", async ({ context }) => {
  const page = await open(context, LAUNCH);
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  for (const [i, q] of dayOne.entries()) {
    await faceBall(page);
    await answer(page, single(q));
    if (i === 5) await page.getByRole("button", { name: "See scorecard" }).click();
  }
  await expect(page.locator("#total")).toHaveText("6/0");
  const reset = page.getByRole("button", { name: "Reset today's over" });
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
