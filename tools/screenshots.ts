/**
 * Rebuilds docs/screenshots/overview.png, the README's four-format picture, from the built site.
 * Run `npm run build` first, then `npm run screenshots`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import { preview } from "vite";
import { LIVE_HOST } from "../src/analytics";
import type { Question, Tier } from "../src/engine/types";
import type { ThemeKey } from "../src/storage";

const PORT = 4310;
// Shown under the live address so the share text has the real link; served from the local build.
const SITE = `https://${LIVE_HOST}`;
const OUT = "docs/screenshots/overview.png";
const W = 390;
const H = 780;

const pool = new Map(
  readdirSync("src/data/questions")
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join("src/data/questions", f), "utf8")) as Question[])
    .map((q) => [q.id, q]),
);
const schedule = JSON.parse(readFileSync("src/data/schedule.json", "utf8")) as {
  launchDate: string;
  days: string[][];
};
// Day three in the afternoon: a few days of history, and no floodlights.
const DAY = 3;
const AT = new Date(`${schedule.launchDate}T14:00:00`);
AT.setDate(AT.getDate() + DAY - 1);
const questions = (schedule.days[DAY - 1] ?? []).map((id) => pool.get(id) as Question);

const pick = (q: Question, tier: Tier) =>
  (q.answers.find((a) => a.tier === tier) ?? q.answers.find((a) => a.tier === "single"))?.name ??
  "";

const history = {
  1: { runs: 17, wickets: 0, balls: ["single", "four", "single", "six", "single", "four"] },
  2: { runs: 12, wickets: 0, balls: ["single", "single", "two", "single", "single", "six"] },
};

async function open(browser: Browser, theme: ThemeKey): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    storageState: {
      cookies: [],
      origins: [
        {
          origin: SITE,
          localStorage: [
            {
              name: "stumped",
              value: JSON.stringify({
                version: 1,
                theme,
                muted: true,
                seenHelp: true,
                innings: null,
                history,
              }),
            },
          ],
        },
      ],
    },
  });
  // Anything else, such as play counting, never leaves the machine.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== SITE) return route.abort();
    const response = await route.fetch({
      url: `http://localhost:${PORT}${url.pathname}${url.search}`,
    });
    return route.fulfill({ response });
  });
  // The home screen's quote is random; a seeded generator keeps the picture the same each run.
  await context.addInitScript(() => {
    let seed = 7;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  const page = await context.newPage();
  await page.clock.install({ time: AT });
  await page.goto(`${SITE}/stumped/`);
  return page;
}

async function type(page: Page, text: string) {
  const input = page.getByRole("textbox");
  await input.fill(text);
  await input.press("Enter");
}

async function face(page: Page) {
  await page.locator('[data-act="face"], [data-act="face-next"]').click();
}

/** Plays a ball for the given tier, or until timed out after a miss when tier is "out". */
async function play(page: Page, q: Question, tier: Tier | "out") {
  await face(page);
  await page.getByRole("heading", { name: q.prompt }).waitFor();
  if (tier === "out") {
    await type(page, "Atlantis");
    await page.clock.fastForward(21_000);
  } else {
    await type(page, pick(q, tier));
  }
  await page.locator(".res").waitFor();
}

const shot = (page: Page) => page.screenshot({ type: "png" });

async function home(browser: Browser) {
  const page = await open(browser, "hundred");
  return shot(page);
}

async function inPlay(browser: Browser) {
  const page = await open(browser, "village");
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await face(page);
  const q = questions[0] as Question;
  await page.getByRole("heading", { name: q.prompt }).waitFor();
  await type(page, "Atlantis");
  await type(page, "Narnia");
  await page.locator(".callout.show").waitFor({ state: "hidden" });
  await page.getByRole("textbox").fill(pick(q, "single").slice(0, 7));
  return shot(page);
}

async function outOfTheGround(browser: Browser) {
  const page = await open(browser, "test");
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await play(page, questions[0] as Question, "two");
  const q = questions[1] as Question;
  await face(page);
  await page.getByRole("heading", { name: q.prompt }).waitFor();
  await type(page, "Narnia");
  await type(page, pick(q, "ootg"));
  await page.locator(".res").waitFor();
  return shot(page);
}

async function scorecard(browser: Browser) {
  const page = await open(browser, "oneday");
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  const tiers: (Tier | "out")[] = ["two", "ootg", "out", "four", "six", "single"];
  for (const [i, q] of questions.entries()) await play(page, q, tiers[i] ?? "single");
  await page.getByRole("button", { name: "See scorecard" }).click();
  await page.locator("#total").waitFor();
  return shot(page);
}

const server = await preview({ preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();
try {
  const panels = [];
  for (const take of [home, inPlay, outOfTheGround, scorecard]) panels.push(await take(browser));
  const page = await browser.newPage({
    viewport: { width: W * 4, height: H },
    deviceScaleFactor: 2,
  });
  const imgs = panels
    .map(
      (p) => `<img src="data:image/png;base64,${p.toString("base64")}" width="${W}" height="${H}">`,
    )
    .join("");
  await page.setContent(`<body style="margin:0;display:flex">${imgs}</body>`);
  writeFileSync(OUT, await page.screenshot({ type: "png" }));
  console.log(`Wrote ${OUT}`);
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
