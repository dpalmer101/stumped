import { describe, expect, it } from "vitest";
import { guess, startBall, timeLeft } from "../../src/engine/ball";
import { TIMED_OUT } from "../../src/engine/dismissal";
import {
  currentBallIndex,
  type Innings,
  isComplete,
  loadToday,
  newInnings,
  replaceBall,
  resume,
} from "../../src/engine/innings";
import { createMatcher } from "../../src/engine/match";
import { BALL_MS } from "../../src/engine/types";
import { groundsQuestion } from "./fixtures";

const match = createMatcher(groundsQuestion);
const ids = ["a", "b", "c", "d", "e", "f"];
const T0 = 5_000_000;

function faceFirstBall(): Innings {
  const inn = newInnings(3, ids);
  return replaceBall(inn, startBall(inn.balls[0] ?? fail(), T0));
}

function finished(puzzle: number): Innings {
  let inn = newInnings(puzzle, ids);
  for (const b of inn.balls)
    inn = replaceBall(inn, guess(startBall(b, T0), "Lord's", match, T0 + 1).ball);
  return inn;
}

function fail(): never {
  throw new Error("missing ball");
}

describe("leaving the page mid-ball", () => {
  it("keeps the clock running while away", () => {
    const back = resume(faceFirstBall(), T0 + 12_000);
    const ball = back.balls[0] ?? fail();
    expect(ball.result).toBeUndefined();
    expect(timeLeft(ball, T0 + 12_000)).toBe(BALL_MS - 12_000);
  });

  it("is out if the time ran out while away", () => {
    const back = resume(faceFirstBall(), T0 + BALL_MS + 60_000);
    expect(back.balls[0]?.result).toEqual({ kind: "out", dismissal: TIMED_OUT, runs: 0 });
    expect(currentBallIndex(back)).toBe(1);
  });

  it("keeps the misses made before leaving when deciding the dismissal", () => {
    const inn = faceFirstBall();
    const missed = replaceBall(
      inn,
      guess(inn.balls[0] ?? fail(), "Wembley", match, T0 + 1000).ball,
    );
    const back = resume(missed, T0 + BALL_MS);
    const result = back.balls[0]?.result;
    expect(result?.kind).toBe("out");
    expect(result?.kind === "out" && result.dismissal).not.toBe(TIMED_OUT);
  });

  it("does not start balls that have not been faced", () => {
    const back = resume(faceFirstBall(), T0 + 10 * BALL_MS);
    expect(back.balls.slice(1).every((b) => b.startedAt === undefined && !b.result)).toBe(true);
  });
});

describe("loadToday", () => {
  it("starts a fresh innings when nothing is saved", () => {
    const inn = loadToday(null, 3, ids, T0);
    expect(inn.puzzle).toBe(3);
    expect(currentBallIndex(inn)).toBe(0);
  });

  it("returns today's finished innings instead of a new one", () => {
    const inn = loadToday(finished(3), 3, ids, T0 + 99_999);
    expect(isComplete(inn)).toBe(true);
  });

  it("carries on today's unfinished innings, timer included", () => {
    const inn = loadToday(faceFirstBall(), 3, ids, T0 + BALL_MS);
    expect(inn.balls[0]?.result?.kind).toBe("out");
  });

  it("gives each ball its delivery's time", () => {
    const times = [15_000, 20_000, 25_000, 20_000, 20_000, 15_000];
    expect(loadToday(null, 3, ids, T0, times).balls.map((b) => b.timeMs)).toEqual(times);
  });

  it("keeps a bowled ball's time but updates balls not yet faced", () => {
    const saved = faceFirstBall();
    const old = { ...saved, balls: saved.balls.map(({ timeMs: _, ...b }) => b) };
    const times = [25_000, 15_000, 25_000, 20_000, 20_000, 15_000];
    const inn = loadToday(old, 3, ids, T0 + 1000, times);
    expect(inn.balls[0]?.timeMs).toBeUndefined();
    expect(timeLeft(inn.balls[0] ?? fail(), T0 + 1000)).toBe(BALL_MS - 1000);
    expect(inn.balls.slice(1).map((b) => b.timeMs)).toEqual(times.slice(1));
  });

  it("starts fresh if today's questions changed since the save", () => {
    const changed = ["z", "b", "c", "d", "e", "f"];
    const inn = loadToday(finished(3), 3, changed, T0);
    expect(isComplete(inn)).toBe(false);
    expect(inn.balls[0]?.questionId).toBe("z");
  });

  it("starts the new day's puzzle fresh", () => {
    const inn = loadToday(finished(3), 4, ids, T0);
    expect(inn.puzzle).toBe(4);
    expect(isComplete(inn)).toBe(false);
  });
});
