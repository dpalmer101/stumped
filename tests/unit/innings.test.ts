import { describe, expect, it } from "vitest";
import { guess, startBall, tick } from "../../src/engine/ball";
import { DISMISSALS, pickDismissal, TIMED_OUT } from "../../src/engine/dismissal";
import {
  canRevealAnswers,
  currentBallIndex,
  type Innings,
  isComplete,
  newInnings,
  replaceBall,
  total,
} from "../../src/engine/innings";
import { createMatcher } from "../../src/engine/match";
import { shareText } from "../../src/engine/share";
import { BALL_MS } from "../../src/engine/types";
import { groundsQuestion } from "./fixtures";

const match = createMatcher(groundsQuestion);
const ids = ["a", "b", "c", "d", "e", "f"];

function play(innings: Innings, answers: (string | null)[]): Innings {
  let inn = innings;
  answers.forEach((answer, i) => {
    let ball = startBall(inn.balls[i] ?? fail(), i * 100_000);
    ball =
      answer === null
        ? tick(guess(ball, "Wembley", match, i * 100_000 + 1).ball, i * 100_000 + BALL_MS)
        : guess(ball, answer, match, i * 100_000 + 1).ball;
    inn = replaceBall(inn, ball);
  });
  return inn;
}

function fail(): never {
  throw new Error("missing ball");
}

describe("innings", () => {
  it("is one over: exactly 6 questions", () => {
    expect(() => newInnings(1, ids.slice(0, 5))).toThrow();
    expect(newInnings(1, ids).balls).toHaveLength(6);
  });

  it("always plays all 6 balls, even after wickets", () => {
    let inn = play(newInnings(1, ids), [null, null, null]);
    expect(currentBallIndex(inn)).toBe(3);
    expect(isComplete(inn)).toBe(false);
    inn = play(inn, [null, null, null, "Bourda", "Lord's", "Galle"]);
    expect(isComplete(inn)).toBe(true);
    expect(currentBallIndex(inn)).toBe(-1);
  });

  it("totals runs and wickets", () => {
    const inn = play(newInnings(1, ids), ["Bourda", "Galle", null, "Newlands", "Edgbaston", null]);
    expect(total(inn)).toEqual({ runs: 12 + 6 + 4 + 2, wickets: 2 });
  });

  it("only reveals answers once the innings is complete", () => {
    const partial = play(newInnings(1, ids), ["Bourda", "Galle"]);
    expect(canRevealAnswers(partial)).toBe(false);
    const done = play(newInnings(1, ids), Array(6).fill("Lord's"));
    expect(canRevealAnswers(done)).toBe(true);
  });

  it("builds spoiler-free share text", () => {
    const inn = play(newInnings(12, ids), ["Bourda", "Galle", null, "Newlands", "Edgbaston", null]);
    const text = shareText(inn, "https://example.github.io/stumped/");
    expect(text).toBe("Stumped #12 — 24/2\n🏟️ 6️⃣ ☝️ 4️⃣ 2️⃣ ☝️\nhttps://example.github.io/stumped/");
    for (const answer of groundsQuestion.answers) expect(text).not.toContain(answer.name);
  });
});

describe("dismissal", () => {
  it("is deterministic for a puzzle and ball", () => {
    expect(pickDismissal(5, 3, 2)).toBe(pickDismissal(5, 3, 9));
  });

  it("is always from the known set", () => {
    for (let p = 1; p < 50; p++) {
      for (let b = 0; b < 6; b++) expect(DISMISSALS).toContain(pickDismissal(p, b, 1));
    }
  });

  it("varies across balls", () => {
    const seen = new Set(Array.from({ length: 70 }, (_, i) => pickDismissal(i, i % 6, 1)));
    expect(seen.size).toBeGreaterThan(5);
  });

  it("is Timed out when there were no guesses", () => {
    expect(pickDismissal(1, 0, 0)).toBe(TIMED_OUT);
  });
});
