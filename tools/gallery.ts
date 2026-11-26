/**
 * Captures every screen and every animation in every format into docs/gallery, and writes
 * docs/GALLERY.md to compare them side by side. Needs ffmpeg. Run `npm run build` first, then
 * `npm run gallery`. Name formats to capture only those (`npm run gallery -- village oneday`), and
 * add `--stills` to leave the GIFs alone: they are recorded in real time, so differ on every run.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import type { Question, Tier } from "../src/engine/types";
import { THEME_KEYS, type ThemeKey } from "../src/storage";
import { THEMES } from "../src/ui/themes";
import { dayQuestions, face, open, pick, questions, serve, swing, type } from "./site";

const DIR = "docs/gallery";
const DOC = "docs/GALLERY.md";
const SIZE = { width: 390, height: 780 };
// One device pixel per CSS pixel keeps the many images, and every update to them, small. A
// stopped clock keeps the countdown and timer bar the same on every run.
const STILL = { size: SIZE, scale: 1, phone: true, paused: true };
const NIGHT = 22;
// Each GIF takes the same box around its format's scene, so they all come out one size.
const GIF_H = 238;

const SCREENS = [
  ["home", "Home"],
  ["help", "How to play"],
  ["ready", "Ball one, ready"],
  ["question", "Ball in play"],
  ["hit", "After a hit"],
  ["out", "After an out"],
  ["scorecard", "Scorecard"],
  ["newday", "Scorecard, next day"],
  ["answers", "Answers"],
  ["archive", "Archive"],
  ["replay", "Archive replay"],
  ["night", "Ball one at night"],
] as const;
type Screen = (typeof SCREENS)[number][0];

const SCORES: { tier: Tier | "out"; label: string }[] = [
  { tier: "single", label: "Single" },
  { tier: "two", label: "Two" },
  { tier: "four", label: "Four" },
  { tier: "six", label: "Six" },
  { tier: "ootg", label: "Out of the ground" },
  { tier: "out", label: "Out" },
];
const RECORD_MS = 4000;
// Held on the last frame so the end can be seen before the GIF loops.
const HOLD_MS = 1500;

const file = (theme: ThemeKey, name: string, ext: "png" | "gif") => `${theme}-${name}.${ext}`;

const ffmpeg = (...args: string[]) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);

async function still(page: Page, theme: ThemeKey, name: Screen) {
  // Pressing Enter to answer leaves a focus ring on the next button, which a tap wouldn't.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: join(DIR, file(theme, name, "png")), fullPage: true });
}

const pngHeight = (path: string) => readFileSync(path).readUInt32BE(20);

/**
 * Pads each screen's stills to the tallest format's, so a row of the gallery lines up. Works from
 * the files, so formats captured in an earlier run count too; a screen that gets shorter in every
 * format needs every format captured again.
 */
function lineUp() {
  for (const [name] of SCREENS) {
    const paths = THEME_KEYS.map((t) => join(DIR, file(t, name, "png"))).filter(existsSync);
    const tallest = Math.max(...paths.map(pngHeight));
    for (const path of paths) {
      if (pngHeight(path) === tallest) continue;
      // Padded in the colour of the page's bottom edge, so it reads as more of the page.
      const colour = ffmpeg(
        ...["-i", path, "-vf", "crop=1:1:0:ih-1"],
        ...["-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      )
        .subarray(0, 3)
        .toString("hex");
      const tmp = mkdtempSync(join(tmpdir(), "stumped-png-"));
      try {
        const padded = join(tmp, "padded.png");
        ffmpeg("-i", path, "-vf", `pad=${SIZE.width}:${tallest}:0:0:color=0x${colour}`, padded);
        renameSync(padded, path);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }
}

/** Plays an innings, calling `after` once each ball is done, then opens the scorecard. */
async function innings(
  page: Page,
  qs: Question[],
  tiers: (Tier | "out")[],
  after?: (i: number) => Promise<void>,
) {
  for (const [i, q] of qs.entries()) {
    await face(page, q.prompt);
    await swing(page, q, tiers[i] ?? "single");
    await page.locator(".res").waitFor();
    await after?.(i);
  }
  await page.getByRole("button", { name: "See scorecard" }).click();
  await page.locator("#total").waitFor();
}

/** Every screen in one format. */
async function screens(browser: Browser, theme: ThemeKey) {
  const page = await open(browser, theme, STILL);
  await still(page, theme, "home");
  await page.getByRole("button", { name: "How to play" }).click();
  await page.locator("#htp-title").waitFor();
  await still(page, theme, "help");
  await page.getByRole("button", { name: "Got it" }).click();

  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.locator('[data-act="face"]').waitFor();
  await still(page, theme, "ready");

  const first = questions[0] as Question;
  await face(page, first.prompt);
  await type(page, "Atlantis");
  await type(page, "Narnia");
  // Long enough for the miss callout to go.
  await page.clock.runFor(1500);
  await page.getByRole("textbox").fill(pick(first, "single").slice(0, 7));
  await still(page, theme, "question");
  const [, ...rest] = questions;
  await swing(page, first, "four");
  await page.locator(".res").waitFor();
  await still(page, theme, "hit");
  await innings(page, rest, ["out", "two", "six", "single", "ootg"], async (i) => {
    if (i === 0) await still(page, theme, "out");
  });
  await still(page, theme, "scorecard");
  await page.getByRole("button", { name: "Answers", exact: true }).click();
  await page.locator('[data-act="nextq"]').waitFor();
  await still(page, theme, "answers");
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-act="to-archive"]').click();
  await page.locator(".days").waitFor();
  await still(page, theme, "archive");
  await page.locator('[data-act="play-day"][data-day="1"]').click();
  await innings(page, dayQuestions(1), ["single", "two", "four", "single", "six", "two"]);
  await still(page, theme, "replay");
  await page.context().close();

  // Just after midnight, today's scorecard offers the next over.
  const late = await open(browser, theme, STILL);
  await late.getByRole("button", { name: "Walk out to bat" }).click();
  await innings(late, questions, ["single", "two", "four", "six", "ootg", "single"]);
  const next = new Date(await late.evaluate(() => Date.now()));
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 5, 0);
  await late.clock.setSystemTime(next);
  await late.clock.runFor(2000);
  await late.locator(".newday").waitFor();
  await still(late, theme, "newday");
  await late.context().close();

  const night = await open(browser, theme, { ...STILL, hour: NIGHT });
  await night.getByRole("button", { name: "Walk out to bat" }).click();
  await night.locator('[data-act="face"]').waitFor();
  await still(night, theme, "night");
  await night.context().close();
}

interface Frame {
  data: string;
  at: number;
}

/** Records the page from just before `act` until `ms` after it, as screencast frames. */
async function record(page: Page, act: () => Promise<void>, ms: number): Promise<Frame[]> {
  const cdp = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ data: f.data, at: (f.metadata.timestamp ?? 0) * 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png" });
  await page.waitForTimeout(300);
  // The screencast opens with whatever was last painted, which may be an earlier screen.
  frames.splice(0, frames.length - 1);
  await act();
  await page.waitForTimeout(ms);
  await cdp.send("Page.stopScreencast");
  await cdp.detach();
  return frames;
}

/** Turns frames into a GIF of the scene, keeping each frame's real timing. */
async function gif(page: Page, frames: Frame[], out: string) {
  const box = await page.locator(".scene").boundingBox();
  if (!box || !frames[0]) throw new Error(`Nothing to record for ${out}`);
  const tmp = mkdtempSync(join(tmpdir(), "stumped-gif-"));
  try {
    const list = frames.map((f, i) => {
      const png = join(tmp, `${i}.png`);
      writeFileSync(png, Buffer.from(f.data, "base64"));
      const next = frames[i + 1];
      return `file '${png}'\nduration ${((next ? next.at - f.at : HOLD_MS) / 1000).toFixed(3)}`;
    });
    // The concat demuxer ignores the last duration unless the last file is listed again.
    list.push(`file '${join(tmp, `${frames.length - 1}.png`)}'`);
    writeFileSync(join(tmp, "list.txt"), list.join("\n"));
    // Screencast frames needn't match the page's pixel ratio; a PNG's width is at byte 16.
    const scale = Buffer.from(frames[0].data, "base64").readUInt32BE(16) / SIZE.width;
    const top = Math.max(0, box.y + box.height / 2 - GIF_H / 2);
    const crop = [SIZE.width, GIF_H, 0, top].map((n) => Math.round(n * scale)).join(":");
    ffmpeg(
      ...["-f", "concat", "-safe", "0"],
      ...["-i", join(tmp, "list.txt")],
      "-vf",
      `crop=${crop},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none`,
      ...["-fps_mode", "vfr", out],
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function score(browser: Browser, theme: ThemeKey, tier: Tier | "out") {
  const page = await open(browser, theme, { size: SIZE, motion: "no-preference" });
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  const q = questions[0] as Question;
  await face(page, q.prompt);
  // Past the bowler's run-up, so the GIF starts with the ball on its way.
  await page.waitForTimeout(1500);
  if (tier === "out") {
    await type(page, "Atlantis");
    await page.locator(".callout.show").waitFor({ state: "hidden" });
  }
  const frames = await record(
    page,
    () => (tier === "out" ? page.clock.fastForward(21_000) : swing(page, q, tier)),
    RECORD_MS,
  );
  await gif(page, frames, join(DIR, file(theme, tier, "gif")));
  await page.context().close();
}

async function floodlights(browser: Browser, theme: ThemeKey) {
  const page = await open(browser, theme, { size: SIZE, motion: "no-preference", hour: NIGHT });
  await page.getByRole("button", { name: "Walk out to bat" }).click();
  await page.locator(".scene").waitFor();
  // The lights come on a second after the scene shows, so recording from here catches the dark.
  const frames = await record(page, async () => {}, 2500);
  await gif(page, frames, join(DIR, file(theme, "floodlights", "gif")));
  await page.context().close();
}

function doc(): string {
  const row = (label: string, name: string, ext: "png" | "gif") =>
    `| **${label}** | ${THEME_KEYS.map(
      (t) =>
        `<img src="gallery/${file(t, name, ext)}" width="200" alt="${label}, ${THEMES[t].label}">`,
    ).join(" | ")} |`;
  const head = `| | ${THEME_KEYS.map((t) => THEMES[t].label).join(" | ")} |\n| --- |${" --- |".repeat(THEME_KEYS.length)}`;
  return [
    "# Gallery",
    "",
    "Every screen and animation in every format, side by side. Made from the built site by",
    "`npm run build && npm run gallery`; see CLAUDE.md for when to run it.",
    "",
    "## Screens",
    "",
    head,
    ...SCREENS.map(([name, label]) => row(label, name, "png")),
    "",
    "## Animations",
    "",
    head,
    ...SCORES.map((s) => row(s.label, s.tier, "gif")),
    row("Floodlights on", "floodlights", "gif"),
    "",
  ].join("\n");
}

const args = process.argv.slice(2);
const stills = args.includes("--stills");
const named = args.filter((a) => a !== "--stills");
const wrong = named.filter((a) => !(THEME_KEYS as readonly string[]).includes(a));
if (wrong.length) {
  console.error(
    `Unknown: ${wrong.join(", ")}. Formats: ${THEME_KEYS.join(", ")}. Option: --stills.`,
  );
  process.exit(1);
}
const themes = named.length ? (named as ThemeKey[]) : THEME_KEYS;

mkdirSync(DIR, { recursive: true });
const stop = await serve();
try {
  const browser = await chromium.launch();
  try {
    for (const theme of themes) {
      await screens(browser, theme);
      if (!stills) {
        for (const { tier } of SCORES) await score(browser, theme, tier);
        await floodlights(browser, theme);
      }
      console.log(`Captured ${theme}`);
    }
  } finally {
    await browser.close();
  }
  lineUp();
  writeFileSync(DOC, doc());
  execFileSync("npx", ["biome", "format", "--write", DOC], { stdio: "ignore" });
  console.log(`Wrote ${DOC}`);
} finally {
  await stop();
}
