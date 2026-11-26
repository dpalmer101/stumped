import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildDays, type DayLocks, lockDays, lockProblems, type Relock } from "../src/engine/locks";
import type { Question, Schedule } from "../src/engine/types";

export const LOCKS = "src/data/locked-days.json";
/** Deliberate changes to started days (docs/CONTENT.md, Locked days). */
const RELOCKS = "src/data/relocked-days.json";

const readRelocks = (): Relock[] =>
  existsSync(RELOCKS) ? (JSON.parse(readFileSync(RELOCKS, "utf8")) as Relock[]) : [];

export function readDays() {
  const pool = readdirSync("src/data/questions")
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(`src/data/questions/${f}`, "utf8")) as Question[]);
  const schedule = JSON.parse(readFileSync("src/data/schedule.json", "utf8")) as Schedule;
  return { pool, schedule };
}

export const readLocks = (launchDate: string): DayLocks =>
  existsSync(LOCKS)
    ? (JSON.parse(readFileSync(LOCKS, "utf8")) as DayLocks)
    : { launchDate, days: [] };

/** Problems with the current days against a set of locks. */
export function checkAgainst(locked: DayLocks, now = new Date()): string[] {
  const { pool, schedule } = readDays();
  return lockProblems(
    locked,
    schedule.launchDate,
    buildDays(pool, schedule),
    now,
    schedule.segments,
    readRelocks(),
  );
}

/** Re-locks every scheduled day, refusing if that would change a day players have had. */
export function lock(now = new Date()) {
  const { pool, schedule } = readDays();
  const problems = checkAgainst(readLocks(schedule.launchDate), now);
  if (problems.length) {
    throw new Error(
      `Refusing to lock; started days can't change (docs/CONTENT.md, Locked days):\n${problems.join("\n")}`,
    );
  }
  writeFileSync(
    LOCKS,
    `${JSON.stringify(lockDays(schedule.launchDate, buildDays(pool, schedule), schedule.segments), null, 2)}\n`,
  );
  console.log(`Locked ${schedule.days.length} day(s)`);
}

/** Locks published with the live site: the record of what players have actually had. */
export const LIVE_LOCKS = "https://dpalmer101.github.io/stumped/locked-days.json";

/**
 * CI: the current days must keep every lock that's live. Checking the live site, not a git ref,
 * means a failed push, a force-push or an edited lock file can't become the baseline.
 */
export async function checkPushed(url = LIVE_LOCKS, now = new Date()) {
  // The query string gets past the Pages CDN cache, which would otherwise serve old locks.
  const res = await fetch(url.startsWith("http") ? `${url}?t=${Date.now()}` : url);
  // Only before the locks are first published; afterwards a 404 means something broke.
  if (res.status === 404 && process.env.STUMPED_LOCKS_UNPUBLISHED === "1") {
    console.log(`No locks published at ${url} yet; nothing to check`);
    return;
  }
  if (!res.ok) throw new Error(`Couldn't read the live locks (${res.status} from ${url})`);
  const problems = checkAgainst((await res.json()) as DayLocks, now);
  if (problems.length) {
    throw new Error(`Started days differ from the live site:\n${problems.join("\n")}`);
  }
  console.log("Started days match the live site");
}

/** Ships the locks with the site, so the next push is checked against what went live. */
export const publishLocks = () => copyFileSync(LOCKS, "public/locked-days.json");
