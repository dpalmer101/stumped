/**
 * Rebuilds docs/screenshots/overview.png, the README's four-format picture, from the built site.
 * Run `npm run build` first, then `npm run screenshots`.
 */
import { writeFileSync } from "node:fs";
import { type Browser, chromium, type Page } from "@playwright/test";
import type { Question, Tier } from "../src/engine/types";
import { face, open, pick, questions, serve, swing, type } from "./site";

const OUT = "docs/screenshots/overview.png";
const SIZE = { width: 390, height: 780 };

const shot = (page: Page) => page.screenshot({ type: "png" });

async function home(browser: Browser) {
  return shot(await open(browser, "hundred", { size: SIZE }));
}

async function inPlay(browser: Browser) {
  const page = await open(browser, "village", { size: SIZE });
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  const q = questions[0] as Question;
  await face(page, q.prompt);
  await type(page, "Atlantis");
  await type(page, "Narnia");
  await page.locator(".callout.show").waitFor({ state: "hidden" });
  await page.getByRole("textbox").fill(pick(q, "single").slice(0, 7));
  return shot(page);
}

async function outOfTheGround(browser: Browser) {
  const page = await open(browser, "test", { size: SIZE });
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  const [first, second] = questions as [Question, Question];
  await face(page, first.prompt);
  await swing(page, first, "two");
  await page.locator(".res").waitFor();
  await face(page, second.prompt);
  await type(page, "Narnia");
  await swing(page, second, "ootg");
  await page.locator(".res").waitFor();
  return shot(page);
}

async function scorecard(browser: Browser) {
  const page = await open(browser, "oneday", { size: SIZE });
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  const tiers: (Tier | "out")[] = ["two", "ootg", "out", "four", "six", "single"];
  for (const [i, q] of questions.entries()) {
    await face(page, q.prompt);
    await swing(page, q, tiers[i] ?? "single");
    await page.locator(".res").waitFor();
  }
  await page.getByRole("button", { name: "See scorecard" }).click();
  await page.locator("#total").waitFor();
  return shot(page);
}

const stop = await serve();
const browser = await chromium.launch();
try {
  const panels = [];
  for (const take of [home, inPlay, outOfTheGround, scorecard]) panels.push(await take(browser));
  const page = await browser.newPage({
    viewport: { width: SIZE.width * 4, height: SIZE.height },
    deviceScaleFactor: 2,
  });
  const imgs = panels
    .map(
      (p) =>
        `<img src="data:image/png;base64,${p.toString("base64")}" width="${SIZE.width}" height="${SIZE.height}">`,
    )
    .join("");
  await page.setContent(`<body style="margin:0;display:flex">${imgs}</body>`);
  writeFileSync(OUT, await page.screenshot({ type: "png" }));
  console.log(`Wrote ${OUT}`);
} finally {
  await browser.close();
  await stop();
}
