import { dayIndex } from "../engine/puzzle";
import type { PlayableQuestion, Schedule } from "../engine/types";
import scheduleJson from "./schedule.json";

// Only the schedule (ids per day) is bundled. Each day's questions are a separate file built by
// tools/build-days.ts, so the bundle doesn't grow as days are added.
export const schedule: Schedule = scheduleJson;

export interface DayFile {
  questions: PlayableQuestion[];
}

export const dayFileName = (index: number) => `days/${index + 1}.json`;

export async function loadDay(puzzle: number): Promise<PlayableQuestion[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}${dayFileName(dayIndex(puzzle, schedule))}`);
  if (!res.ok) throw new Error(`Couldn't load today's questions (${res.status})`);
  return ((await res.json()) as DayFile).questions;
}
