import type { Schedule } from "./types";

const DAY_MS = 86_400_000;

function parseIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${iso}`);
  return Date.UTC(y, m - 1, d);
}

/** Puzzle number for the player's local calendar day; #1 is the launch date. */
export function puzzleNumber(now: Date, launchDate: string): number {
  // Compare calendar days via UTC so daylight-saving shifts can't skew the count.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - parseIsoDate(launchDate)) / DAY_MS) + 1;
}

/** Which scheduled day (0-based) a puzzle plays. Wraps round when the schedule runs out. */
export function dayIndex(puzzle: number, schedule: Schedule): number {
  const count = schedule.days.length;
  if (count === 0) throw new Error("Schedule is empty");
  const segment = schedule.segments?.filter((s) => s.from <= puzzle).at(-1);
  if (!segment) return (((puzzle - 1) % count) + count) % count;
  const size = Math.min(segment.size, count);
  return (segment.start + (puzzle - segment.from)) % size;
}

export function questionIdsFor(puzzle: number, schedule: Schedule): string[] {
  return schedule.days[dayIndex(puzzle, schedule)] ?? [];
}

/** Whether this puzzle repeats a day an earlier puzzle played. */
export function scheduleHasWrapped(puzzle: number, schedule: Schedule): boolean {
  if (puzzle < 1) return true;
  const day = dayIndex(puzzle, schedule);
  for (let p = 1; p < puzzle; p++) if (dayIndex(p, schedule) === day) return true;
  return false;
}
