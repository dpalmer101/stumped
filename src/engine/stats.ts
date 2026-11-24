import { type Innings, isComplete, total } from "./innings";
import type { Tier } from "./types";

export type BallMark = Tier | "out";

export interface InningsRecord {
  runs: number;
  wickets: number;
  balls: BallMark[];
}

/** Finished innings keyed by puzzle number. */
export type History = Record<string, InningsRecord>;

export interface Stats {
  played: number;
  average: number;
  best: number;
  currentStreak: number;
  bestStreak: number;
  ducks: number;
  /** How many balls ended in each tier, or out. */
  marks: Record<BallMark, number>;
}

export function recordInnings(history: History, innings: Innings): History {
  if (!isComplete(innings)) return history;
  const { runs, wickets } = total(innings);
  const balls = innings.balls.map(
    (b): BallMark => (b.result?.kind === "hit" ? b.result.tier : "out"),
  );
  return { ...history, [innings.puzzle]: { runs, wickets, balls } };
}

/** Streaks count consecutive puzzles played; today's unplayed puzzle doesn't break the current one. */
export function computeStats(history: History, today: number): Stats {
  const puzzles = Object.keys(history)
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  const records = puzzles.map((p) => history[p] as InningsRecord);
  const played = records.length;
  const runs = records.reduce((sum, r) => sum + r.runs, 0);

  let bestStreak = 0;
  let run = 0;
  puzzles.forEach((p, i) => {
    run = i > 0 && puzzles[i - 1] === p - 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  });

  let currentStreak = 0;
  let day = history[today] ? today : today - 1;
  while (history[day]) {
    currentStreak++;
    day--;
  }

  return {
    played,
    average: played ? runs / played : 0,
    best: records.reduce((m, r) => Math.max(m, r.runs), 0),
    currentStreak,
    bestStreak,
    ducks: records.filter((r) => r.runs === 0).length,
    marks: records.reduce<Record<BallMark, number>>(
      (m, r) => {
        for (const b of r.balls) m[b] += 1;
        return m;
      },
      { ootg: 0, six: 0, four: 0, two: 0, single: 0, out: 0 },
    ),
  };
}

/** Milliseconds until the next local midnight, when the next puzzle unlocks. */
export function msUntilNextPuzzle(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
