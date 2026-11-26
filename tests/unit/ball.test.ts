import { describe, expect, it } from "vitest";
import { guess, MAX_GUESS, newBall, startBall, tick, timeLeft } from "../../src/engine/ball";
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

  it("lasts its delivery's time", () => {
    expect(timeLeft(newBall(1, 0, "x", 15_000), T0)).toBe(15_000);
    const fast = startBall(newBall(1, 0, groundsQuestion.id, 15_000), T0);
    expect(timeLeft(fast, T0 + 12_000)).toBe(3000);
    expect(tick(fast, T0 + 15_000 - 1).result).toBeUndefined();
    expect(tick(fast, T0 + 15_000).result?.kind).toBe("out");
    const slow = startBall(newBall(1, 0, groundsQuestion.id, 25_000), T0);
    expect(tick(slow, T0 + 24_999).result).toBeUndefined();
    expect(tick(slow, T0 + 25_000).result?.kind).toBe("out");
  });

  it("gives a ball saved before deliveries the standard time", () => {
    const { timeMs: _, ...old } = live();
    expect(timeLeft(old, T0 + 12_000)).toBe(BALL_MS - 12_000);
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

  it("plays what's still typed when time runs out, as the clock hit zero", () => {
    const typed = (text: string) => ({ text, match });
    expect(tick(live(), T0 + BALL_MS - 1, typed("Bourda")).result).toBeUndefined();
    const hit = tick(live(), T0 + BALL_MS + 5000, typed("Bourda"));
    expect(hit.result).toEqual({
      kind: "hit",
      answer: "Bourda",
      tier: "ootg",
      runs: 12,
      ms: BALL_MS - 1,
    });

    const missed = tick(live(), T0 + BALL_MS, typed("Wembley"));
    expect(missed.misses).toEqual(["Wembley"]);
    expect(missed.result?.kind).toBe("out");
    expect(missed.result?.kind === "out" && missed.result.dismissal).not.toBe(TIMED_OUT);

    // Nothing typed, or only a guess already tried, is plain timing out.
    expect(tick(live(), T0 + BALL_MS, typed("  ")).result).toEqual(
      tick(live(), T0 + BALL_MS).result,
    );
    const tried = guess(live(), "Wembley", match, T0 + 1000).ball;
    const again = tick(tried, T0 + BALL_MS, typed("wembley"));
    expect(again.misses).toEqual(["Wembley"]);
    expect(again.result?.kind).toBe("out");
  });

  it("plays an answer pressed just after time is up as if typed when the clock hit zero", () => {
    const hit = guess(live(), "Bourda", match, T0 + BALL_MS + 1);
    expect(hit.outcome).toBe("hit");
    expect(hit.ball.result?.kind === "hit" && hit.ball.result.ms).toBe(BALL_MS - 1);
    const wrong = guess(live(), "Wembley", match, T0 + BALL_MS + 1);
    expect(wrong.outcome).toBe("out");
    expect(wrong.ball.result?.kind).toBe("out");
    expect(wrong.ball.misses).toEqual(["Wembley"]);
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

describe("guess input hygiene", () => {
  it("stores misses trimmed, with spaces collapsed and length capped", () => {
    const long = `  Not   a ${"very ".repeat(30)} real ground  `;
    const r = guess(live(), long, match, T0 + 1000);
    expect(r.outcome).toBe("miss");
    const miss = r.ball.misses[0] ?? "";
    expect(miss.startsWith("Not a very")).toBe(true);
    expect(miss).not.toMatch(/\s{2}|^\s|\s$/);
    expect(miss.length).toBeLessThanOrEqual(MAX_GUESS);
  });

  it("the longest accepted answer fits within the cap", () => {
    expect("Northern Tasmania Cricket Association Ground".length).toBeLessThan(MAX_GUESS);
  });
});
