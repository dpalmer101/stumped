import { hash } from "./hash";
import { dayIndex } from "./puzzle";
import type { PlayableQuestion, Question, Schedule, Segment } from "./types";

/** What players get for each day, by scheduled day; see docs/CONTENT.md, Locked days. */
export interface DayLocks {
  launchDate: string;
  days: string[];
  /** The schedule's segments when locked, so the live check knows which day each over played. */
  segments?: Segment[];
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
  ...(q.delivery ? { delivery: q.delivery } : {}),
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

export const lockDays = (
  launchDate: string,
  days: PlayableQuestion[][],
  segments?: Segment[],
): DayLocks => ({
  launchDate,
  days: days.map(fingerprint),
  ...(segments?.length ? { segments } : {}),
});

/** Questions on any day an over has started on (or is about to). */
export function startedQuestionIds(schedule: Schedule, now: Date): Set<string> {
  const ids = new Set<string>();
  if (!schedule.days.length) return ids;
  const latest = latestStartedPuzzle(now, schedule.launchDate);
  for (let p = 1; p <= latest; p++) {
    for (const id of schedule.days[dayIndex(p, schedule)] ?? []) ids.add(id);
  }
  return ids;
}

/**
 * A change the owner chose to make to a started day. CI checks pushes against the live site's
 * locks, so the record has to say exactly which questions were replaced by which.
 */
export interface Relock {
  /** Scheduled day, from 1. */
  day: number;
  /** The day's fingerprint before the change, as locked. */
  from: string;
  /** Its fingerprint after. */
  to: string;
  reason: string;
}

/**
 * Changes that would alter a day players have already had: any started day, or which day a
 * live puzzle plays (extending a schedule that has wrapped round would do that).
 */
export function lockProblems(
  locked: DayLocks,
  launchDate: string,
  days: PlayableQuestion[][],
  now: Date,
  segments?: Segment[],
  relocks: Relock[] = [],
): string[] {
  const problems: string[] = [];
  const same = (index: number, now: string | undefined, was: string | undefined) =>
    now === was || relocks.some((r) => r.day === index + 1 && r.from === was && r.to === now);
  const latest = latestStartedPuzzle(now, locked.launchDate);
  if (latest >= 1 && launchDate !== locked.launchDate) {
    problems.push(`launch date changed from ${locked.launchDate} after launch`);
    return problems;
  }
  const current = days.map(fingerprint);
  const pinned = locked.segments ?? [];
  if (
    latest >= 1 &&
    JSON.stringify((segments ?? []).slice(0, pinned.length)) !== JSON.stringify(pinned)
  ) {
    problems.push("segments that past overs depend on were changed or removed");
  }
  const last = segments?.at(-1);
  if (last && last.size !== days.length) {
    problems.push("days were added without content:schedule, so they would never play");
  }
  if (!locked.days.length) return problems;
  const before: Schedule = {
    launchDate,
    days: locked.days.map(() => []),
    segments: locked.segments,
  };
  // A day has started if any started over played it; after a loop, days added later haven't.
  const started = new Set<number>();
  for (let p = 1; p <= latest; p++) started.add(dayIndex(p, before));
  for (const i of [...started].sort((a, b) => a - b)) {
    if (!same(i, current[i], locked.days[i])) {
      problems.push(`day ${i + 1} has started and can't change`);
    }
  }
  if (current.length) {
    const after: Schedule = { launchDate, days: current.map(() => []), segments };
    for (let p = Math.max(1, oldestLivePuzzle(now, launchDate)); p <= latest; p++) {
      const i = dayIndex(p, after);
      if (!same(i, current[i], locked.days[dayIndex(p, before)])) {
        problems.push(`over #${p} is live and would get different questions`);
      }
    }
  }
  return [...new Set(problems)];
}

/**
 * Adds days to a schedule without changing any over that has started. If the schedule has
 * already looped back, a segment makes the next over play the first new day; overs before it keep
 * the days they played.
 */
export function appendDays(schedule: Schedule, newDays: string[][], now: Date): Schedule {
  // A segment with nothing new in it would skip ahead to day 1.
  if (newDays.length === 0) return schedule;
  const next: Schedule = { ...schedule, days: [...schedule.days, ...newDays] };
  const latest = latestStartedPuzzle(now, schedule.launchDate);
  if (latest < 1 || schedule.days.length === 0) return next;
  const nextDay = dayIndex(latest + 1, schedule);
  let played = false;
  for (let p = 1; p <= latest && !played; p++) played = dayIndex(p, schedule) === nextDay;
  // Not looped yet and no segments: plain numbering already carries on into the new days.
  if (!played && !schedule.segments?.length) return next;
  const segment: Segment = {
    from: latest + 1,
    start: played ? schedule.days.length : nextDay,
    size: next.days.length,
  };
  // The first segment also pins the original numbering, which looped over the old day count.
  const earlier = schedule.segments ?? [{ from: 1, start: 0, size: schedule.days.length }];
  return { ...next, segments: [...earlier, segment] };
}
