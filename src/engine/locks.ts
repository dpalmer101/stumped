import { hash } from "./hash";
import { dayIndex } from "./puzzle";
import type { PlayableQuestion, Question, Schedule } from "./types";

/** What players get for each day, by scheduled day; see docs/CONTENT.md, Locked days. */
export interface DayLocks {
  launchDate: string;
  days: string[];
}

/**
 * A day is live somewhere from UTC+14 until UTC-12 ends it. The extra hour covers the gap
 * between CI checking a push and the deploy going live.
 */
const AHEAD_MS = 15 * 3_600_000;
const BEHIND_MS = -12 * 3_600_000;
const DAY_MS = 86_400_000;

function puzzleAt(now: Date, offsetMs: number, launchDate: string): number {
  const shifted = new Date(now.getTime() + offsetMs);
  const day = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return Math.floor((day - Date.parse(`${launchDate}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The newest puzzle that has started anywhere in the world, or is about to. */
export const latestStartedPuzzle = (now: Date, launchDate: string) =>
  puzzleAt(now, AHEAD_MS, launchDate);

/** The oldest puzzle still being played somewhere. */
export const oldestLivePuzzle = (now: Date, launchDate: string) =>
  puzzleAt(now, BEHIND_MS, launchDate);

export const playable = (q: Question): PlayableQuestion => ({
  id: q.id,
  prompt: q.prompt,
  category: q.category,
  answerType: q.answerType,
  answers: q.answers.map(({ name, tier, aliases, misspellings }) => ({
    name,
    tier,
    ...(aliases?.length ? { aliases } : {}),
    ...(misspellings?.length ? { misspellings } : {}),
  })),
});

export function buildDays(pool: Question[], schedule: Schedule): PlayableQuestion[][] {
  const byId = new Map(pool.map((q) => [q.id, q]));
  return schedule.days.map((ids, i) =>
    ids.map((id) => {
      const q = byId.get(id);
      if (!q) throw new Error(`Day ${i + 1} uses unknown question ${id}`);
      return playable(q);
    }),
  );
}

/**
 * Fingerprint of the questions themselves: prompts, categories, answer types (they change what
 * matching accepts), answers and tiers, in order. Ids, aliases and misspellings are left out, so
 * accepted spellings can still be added.
 */
export function fingerprint(day: PlayableQuestion[]): string {
  const content = day.map((q) => [
    q.prompt,
    q.category,
    q.answerType,
    // Plain code-point order: localeCompare would differ between machines.
    q.answers.map((a) => `${a.name}\u0000${a.tier}`).sort(),
  ]);
  return hash(JSON.stringify(content)).toString(16).padStart(8, "0");
}

export const lockDays = (launchDate: string, days: PlayableQuestion[][]): DayLocks => ({
  launchDate,
  days: days.map(fingerprint),
});

/**
 * Changes that would alter a day players have already had: any started day, or which day a
 * live puzzle plays (extending a schedule that has wrapped round would do that).
 */
export function lockProblems(
  locked: DayLocks,
  launchDate: string,
  days: PlayableQuestion[][],
  now: Date,
): string[] {
  const problems: string[] = [];
  const latest = latestStartedPuzzle(now, locked.launchDate);
  if (latest >= 1 && launchDate !== locked.launchDate) {
    problems.push(`launch date changed from ${locked.launchDate} after launch`);
    return problems;
  }
  const current = days.map(fingerprint);
  const started = Math.min(latest, locked.days.length);
  for (let i = 0; i < started; i++) {
    if (current[i] !== locked.days[i]) problems.push(`day ${i + 1} has started and can't change`);
  }
  if (locked.days.length && current.length) {
    const before: Schedule = { launchDate, days: locked.days.map(() => []) };
    const after: Schedule = { launchDate, days: current.map(() => []) };
    for (let p = Math.max(1, oldestLivePuzzle(now, launchDate)); p <= latest; p++) {
      if (current[dayIndex(p, after)] !== locked.days[dayIndex(p, before)]) {
        problems.push(`over #${p} is live and would get different questions`);
      }
    }
  }
  return [...new Set(problems)];
}
