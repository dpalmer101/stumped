import { pickDismissal } from "./dismissal";
import { type Matcher, normalise } from "./match";
import { BALL_MS, RUNS, type Tier } from "./types";

export type BallResult =
  | { kind: "hit"; answer: string; tier: Tier; runs: number; ms: number }
  | { kind: "out"; dismissal: string; runs: 0 };

export interface Ball {
  puzzle: number;
  index: number;
  questionId: string;
  startedAt?: number;
  misses: string[];
  result?: BallResult;
}

export type GuessOutcome = "hit" | "miss" | "repeat" | "empty" | "out" | "closed";

export function newBall(puzzle: number, index: number, questionId: string): Ball {
  return { puzzle, index, questionId, misses: [] };
}

export function startBall(ball: Ball, now: number): Ball {
  if (ball.startedAt !== undefined) return ball;
  return { ...ball, startedAt: now };
}

const CLOCK_DRIFT_MS = 5000;

export function timeLeft(ball: Ball, now: number): number {
  if (ball.startedAt === undefined) return BALL_MS;
  // A clock set back must not buy extra time; a few seconds of drift between tabs or devices is fine.
  if (now < ball.startedAt - CLOCK_DRIFT_MS) return 0;
  return Math.min(BALL_MS, Math.max(0, BALL_MS - (now - ball.startedAt)));
}

function dismiss(ball: Ball): Ball {
  const dismissal = pickDismissal(ball.puzzle, ball.index, ball.misses.length);
  return { ...ball, result: { kind: "out", dismissal, runs: 0 } };
}

/** Resolve the ball as out if its time has run out. Safe to call every frame. */
export function tick(ball: Ball, now: number): Ball {
  if (ball.result || ball.startedAt === undefined) return ball;
  return timeLeft(ball, now) === 0 ? dismiss(ball) : ball;
}

export function guess(
  ball: Ball,
  text: string,
  match: Matcher,
  now: number,
): { ball: Ball; outcome: GuessOutcome } {
  if (ball.result || ball.startedAt === undefined) return { ball, outcome: "closed" };

  const expired = tick(ball, now);
  if (expired.result) return { ball: expired, outcome: "out" };

  const key = normalise(text);
  if (!key) return { ball, outcome: "empty" };

  const answer = match(text);
  if (answer) {
    const result: BallResult = {
      kind: "hit",
      answer: answer.name,
      tier: answer.tier,
      runs: RUNS[answer.tier],
      ms: now - ball.startedAt,
    };
    return { ball: { ...ball, result }, outcome: "hit" };
  }

  if (ball.misses.some((m) => normalise(m) === key)) return { ball, outcome: "repeat" };
  return { ball: { ...ball, misses: [...ball.misses, text.trim()] }, outcome: "miss" };
}
