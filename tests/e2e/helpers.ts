import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

export const schedule = JSON.parse(readFileSync("src/data/schedule.json", "utf8")) as {
  launchDate: string;
  days: string[][];
};
export const LAUNCH = new Date(`${schedule.launchDate}T10:00:00`);

export async function open(context: BrowserContext, at: Date): Promise<Page> {
  const page = await context.newPage();
  await page.clock.install({ time: at });
  await page.goto("./");
  return page;
}
