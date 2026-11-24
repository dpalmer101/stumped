import { readdirSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import type { Question } from "../../src/engine/types";
import { LAUNCH, open, schedule } from "./helpers";

const THEMES = ["hundred", "village", "test", "oneday"] as const;
const pool = new Map(
  readdirSync("src/data/questions")
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(`src/data/questions/${f}`, "utf8")) as Question[])
    .map((q) => [q.id, q]),
);
const first = pool.get(schedule.days[0]?.[0] ?? "") as Question;

test.use({ reducedMotion: "reduce" });

/** WCAG 2.1 AA, including colour contrast. */
async function audit(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = violations.map(
    (v) =>
      `${screen}: ${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} [${n.any[0]?.message ?? ""}]`).join(", ")}`,
  );
  expect(summary).toEqual([]);
}

for (const theme of THEMES) {
  test(`${theme}: every screen meets WCAG AA`, async ({ context }) => {
    // Overwrite the muted storage state from playwright.config.ts with this theme (still muted).
    await context.addInitScript((t) => {
      if (sessionStorage.getItem("themed")) return;
      sessionStorage.setItem("themed", "1");
      localStorage.setItem(
        "stumped",
        JSON.stringify({ version: 1, theme: t, muted: true, innings: null, history: {} }),
      );
    }, theme);
    const themed = (page: Page) => expect(page.locator("body")).toHaveClass(`theme-${theme}`);
    const page = await open(context, LAUNCH);
    await themed(page);
    await audit(page, "home");

    await page.getByRole("button", { name: "Walk out to bat" }).click();
    await audit(page, "ready");

    await page.getByRole("button", { name: "Face ball" }).click();
    await page.locator("#guess").fill("Definitely not an answer");
    await page.locator("#guess").press("Enter");
    await audit(page, "live with a miss");

    await page.locator("#guess").fill(first.answers[0]?.name ?? "");
    await page.locator("#guess").press("Enter");
    await audit(page, "result");

    for (let i = 1; i < 6; i++) {
      await page
        .getByRole("button", { name: "Next ball" })
        .or(page.getByRole("button", { name: "Next batter in" }))
        .click();
      await page.getByRole("button", { name: "Face ball" }).click();
      await page.clock.runFor(21_000);
      if (i === 1) await audit(page, "out");
    }
    await page.getByRole("button", { name: "See scorecard" }).click();
    await audit(page, "scorecard");

    await page.getByRole("button", { name: "See all answers" }).click();
    await audit(page, "answers");
  });
}
