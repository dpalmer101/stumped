import { describe, expect, it } from "vitest";
import { guess, startBall, tick } from "../../src/engine/ball";
import { newInnings, replaceBall } from "../../src/engine/innings";
import { createMatcher } from "../../src/engine/match";
import {
  computeStats,
  formatCountdown,
  type History,
  msUntilNextPuzzle,
  recordArchiveInnings,
  recordInnings,
} from "../../src/engine/stats";
import { BALL_MS } from "../../src/engine/types";
import { groundsQuestion } from "./fixtures";

const match = createMatcher(groundsQuestion);
const rec = (runs: number) => ({ runs, wickets: 0, balls: [] });

describe("recordInnings", () => {
  it("records only finished innings", () => {
    let inn = newInnings(4, ["a", "b", "c", "d", "e", "f"]);
    expect(recordInnings({}, inn)).toEqual({});
    inn.balls.forEach((b, i) => {
      const live = startBall(b, 0);
      inn = replaceBall(inn, i === 2 ? tick(live, BALL_MS) : guess(live, "Bourda", match, 1).ball);
    });
    expect(recordInnings({}, inn)[4]).toEqual({
      runs: 60,
      wickets: 1,
      balls: ["ootg", "ootg", "out", "ootg", "ootg", "ootg"],
    });
  });
});

describe("computeStats", () => {
  it("is all zeros with no history", () => {
    expect(computeStats({}, 5)).toEqual({
      played: 0,
      average: 0,
      best: 0,
      currentStreak: 0,
      bestStreak: 0,
      ducks: 0,
      marks: { ootg: 0, six: 0, four: 0, two: 0, single: 0, out: 0 },
    });
  });

  it("works out average, best, ducks and streaks", () => {
    const history: History = { 1: rec(10), 2: rec(0), 4: rec(30), 5: rec(20), 6: rec(4) };
    const stats = computeStats(history, 6);
    expect(stats).toMatchObject({ played: 5, average: 64 / 5, best: 30, ducks: 1 });
    expect(stats.bestStreak).toBe(3);
    expect(stats.currentStreak).toBe(3);
  });

  it("keeps the streak alive until today's puzzle is missed", () => {
    const history: History = { 4: rec(1), 5: rec(1) };
    expect(computeStats(history, 6).currentStreak).toBe(2);
    expect(computeStats(history, 7).currentStreak).toBe(0);
  });
});

describe("countdown", () => {
  it("counts to local midnight", () => {
    expect(msUntilNextPuzzle(new Date(2026, 10, 24, 23, 59, 0))).toBe(60_000);
  });

  it("formats as hh:mm:ss", () => {
    expect(formatCountdown(7 * 3600_000 + 42 * 60_000 + 10_000)).toBe("07:42:10");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
});

describe("tier counts", () => {
  it("counts every ball by outcome", () => {
    const history: History = {
      1: { runs: 19, wickets: 1, balls: ["ootg", "six", "single", "out", "single", "two", "four"] },
    };
    expect(computeStats(history, 1).marks).toEqual({
      ootg: 1,
      six: 1,
      four: 1,
      two: 1,
      single: 2,
      out: 1,
    });
  });
});

describe("archive plays", () => {
  const finished = (puzzle: number) => {
    let inn = newInnings(puzzle, ["a", "b", "c", "d", "e", "f"]);
    inn.balls.forEach((b) => {
      inn = replaceBall(inn, guess(startBall(b, 0), "Bourda", match, 1).ball);
    });
    return inn;
  };

  it("records the first finished play of a day, marked as from the archive", () => {
    expect(recordArchiveInnings({}, newInnings(3, ["a", "b", "c", "d", "e", "f"]))).toEqual({});
    expect(recordArchiveInnings({}, finished(3))[3]).toMatchObject({ runs: 72, archive: true });
  });

  it("never replaces an existing score", () => {
    const history: History = { 3: rec(4) };
    expect(recordArchiveInnings(history, finished(3))).toBe(history);
  });

  it("counts in stats but not in streaks", () => {
    const history: History = { 1: rec(5), 2: { ...rec(10), archive: true }, 3: rec(7) };
    const s = computeStats(history, 3);
    expect(s.played).toBe(3);
    expect(s.best).toBe(10);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
    // Today played from the archive (a replay day) doesn't start a streak either.
    expect(computeStats({ 4: { ...rec(1), archive: true } }, 4).currentStreak).toBe(0);
  });
});
