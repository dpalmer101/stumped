/** Drives the built site in a browser, for the scripts that make the docs' pictures. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { preview } from "vite";
import { LIVE_HOST } from "../src/analytics";
import { newsIds } from "../src/engine/news";
import type { Question, Tier } from "../src/engine/types";
import type { ThemeKey } from "../src/storage";

const PORT = 4310;
// Shown under the live address so the share text has the real link; served from the local build.
const SITE = `https://${LIVE_HOST}`;

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
// Day three, so there are a few days of history.
const DAY = 3;
export const dayQuestions = (day: number) =>
  (schedule.days[day - 1] ?? []).map((id) => pool.get(id) as Question);
export const questions = dayQuestions(DAY);

export const pick = (q: Question, tier: Tier) =>
  (q.answers.find((a) => a.tier === tier) ?? q.answers.find((a) => a.tier === "single"))?.name ??
  "";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const history = {
  1: { runs: 17, wickets: 0, balls: ["single", "four", "single", "six", "single", "four"] },
  2: { runs: 12, wickets: 0, balls: ["single", "single", "two", "single", "single", "six"] },
};

/** Serves the built site (run `npm run build` first) until the returned function is called. */
export async function serve(): Promise<() => Promise<void>> {
  const server = await preview({ preview: { port: PORT, strictPort: true } });
  return () => new Promise((done) => server.httpServer.close(() => done()));
}

export interface Options {
  size: { width: number; height: number };
  motion?: "reduce" | "no-preference";
  /** Local hour of day; the afternoon has no floodlights. */
  hour?: number;
  /** Device pixels per CSS pixel. */
  scale?: number;
  /** An iPhone, so phone-only parts such as Add to home screen show. */
  phone?: boolean;
  /** Stops the clock: time then passes only through `page.clock`, so pictures come out the same. */
  paused?: boolean;
}

export async function open(
  browser: Browser,
  theme: ThemeKey,
  { size, motion = "reduce", hour = 14, scale = 2, phone = false, paused = false }: Options,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: scale,
    reducedMotion: motion,
    ...(phone && { userAgent: IPHONE, hasTouch: true, isMobile: true }),
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
                seenNews: newsIds(),
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
  const at = new Date(`${schedule.launchDate}T00:00:00`);
  at.setDate(at.getDate() + DAY - 1);
  at.setHours(hour);
  await page.clock.install({ time: at });
  await page.goto(`${SITE}/stumped/`);
  if (paused) await page.clock.pauseAt(new Date(at.getTime() + 1000));
  return page;
}

export async function type(page: Page, text: string) {
  const input = page.getByRole("textbox");
  await input.fill(text);
  await input.press("Enter");
}

export async function face(page: Page, prompt: string) {
  await page.locator('[data-act="face"], [data-act="face-next"]').click();
  await page.getByRole("heading", { name: prompt }).waitFor();
}

/** Ends a ball on the given tier, or timed out after a miss when tier is "out". */
export async function swing(page: Page, q: Question, tier: Tier | "out") {
  if (tier === "out") {
    await type(page, "Atlantis");
    await page.clock.fastForward(21_000);
  } else {
    await type(page, pick(q, tier));
  }
}
