/**
 * Writes one file per scheduled day into public/days/ with just what the game needs to play it.
 * Runs before dev and build (see package.json); the output is generated, so it isn't committed.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { type DayFile, dayFileName } from "../src/data/index";
import { buildDays } from "../src/engine/locks";
import { publishLocks, readDays } from "./days";

const { pool, schedule } = readDays();
rmSync("public/days", { recursive: true, force: true });
mkdirSync("public/days", { recursive: true });
buildDays(pool, schedule).forEach((questions, i) => {
  const file: DayFile = { questions };
  writeFileSync(`public/${dayFileName(i)}`, JSON.stringify(file));
});
publishLocks();
console.log(`Wrote ${schedule.days.length} day file(s) to public/days`);
