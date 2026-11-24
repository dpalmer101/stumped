import { describe, expect, it } from "vitest";
import { guess, newBall, startBall, tick, timeLeft } from "../../src/engine/ball";
import { TIMED_OUT } from "../../src/engine/dismissal";
import { createMatcher } from "../../src/engine/match";
import { BALL_MS } from "../../src/engine/types";
import { groundsQuestion } from "./fixtures";

const match = createMatcher(groundsQuestion);
const T0 = 1_000_000;
const live = () => startBall(newBall(1, 0, groundsQuestion.id), T0);

describe("ball", () => {
  it("does not accept guesses before it starts", () => {
    expect(guess(newBall(1, 0, "x"), "Lord's", match, T0).outcome).toBe("closed");
  });

  it("keeps the first start time", () => {
    expect(startBall(live(), T0 + 5000).startedAt).toBe(T0);
  });

  it("counts down 20 seconds from the start timestamp", () => {
    expect(timeLeft(live(), T0 + 12_000)).toBe(BALL_MS - 12_000);
    expect(timeLeft(live(), T0 + 99_000)).toBe(0);
  });

  it("scores a correct answer by tier and ends the ball", () => {
    const r = guess(live(), "Bourda", match, T0 + 4000);
    expect(r.outcome).toBe("hit");
    expect(r.ball.result).toEqual({
      kind: "hit",
      answer: "Bourda",
      tier: "ootg",
      runs: 12,
      ms: 4000,
    });
    expect(guess(r.ball, "Lord's", match, T0 + 5000).outcome).toBe("closed");
  });

  it.each([
    ["Galle", 6],
    ["Newlands", 4],
    ["Trent Bridge", 2],
    ["Lord's", 1],
  ])("%s scores %i", (answer, runs) => {
    expect(guess(live(), answer, match, T0 + 1).ball.result?.runs).toBe(runs);
  });

  it("records misses and lets play continue", () => {
    let b = live();
    b = guess(b, "Wembley", match, T0 + 1000).ball;
    const r = guess(b, "Anfield", match, T0 + 2000);
    expect(r.outcome).toBe("miss");
    expect(r.ball.misses).toEqual(["Wembley", "Anfield"]);
    expect(r.ball.result).toBeUndefined();
    expect(guess(r.ball, "Lord's", match, T0 + 3000).outcome).toBe("hit");
  });

  it("does not count a repeated miss twice", () => {
    const b = guess(live(), "Wembley", match, T0 + 1000).ball;
    const r = guess(b, " wembley ", match, T0 + 2000);
    expect(r.outcome).toBe("repeat");
    expect(r.ball.misses).toHaveLength(1);
  });

  it("ignores empty guesses", () => {
    const r = guess(live(), "  ", match, T0 + 1000);
    expect(r.outcome).toBe("empty");
    expect(r.ball.misses).toHaveLength(0);
  });

  it("is out when time runs out, with a dismissal", () => {
    const b = guess(live(), "Wembley", match, T0 + 1000).ball;
    expect(tick(b, T0 + BALL_MS - 1).result).toBeUndefined();
    const out = tick(b, T0 + BALL_MS);
    expect(out.result?.kind).toBe("out");
    expect(out.result?.runs).toBe(0);
    expect(out.result?.kind === "out" && out.result.dismissal).not.toBe(TIMED_OUT);
  });

  it("is timed out with no guesses at all", () => {
    const out = tick(live(), T0 + BALL_MS);
    expect(out.result).toEqual({ kind: "out", dismissal: TIMED_OUT, runs: 0 });
  });

  it("rejects a correct answer that arrives after time is up", () => {
    const r = guess(live(), "Lord's", match, T0 + BALL_MS + 1);
    expect(r.outcome).toBe("out");
    expect(r.ball.result?.kind).toBe("out");
  });
});

describe("clock changes", () => {
  it("a clock set back before the start ends the ball instead of adding time", () => {
    const ball = startBall(newBall(1, 0, "x"), 1_000_000);
    expect(timeLeft(ball, 1_000_000 - 3_600_000)).toBe(0);
    expect(tick(ball, 1_000_000 - 3_600_000).result?.kind).toBe("out");
  });

  it("tolerates a few seconds of clock drift between tabs", () => {
    const ball = startBall(newBall(1, 0, "x"), 1_000_000);
    expect(timeLeft(ball, 1_000_000 - 2_000)).toBe(BALL_MS);
  });
});
