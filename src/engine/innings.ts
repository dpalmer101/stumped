import { type Ball, newBall, tick } from "./ball";
import { BALLS_PER_INNINGS } from "./types";

export interface Innings {
  puzzle: number;
  balls: Ball[];
}

export function newInnings(puzzle: number, questionIds: string[]): Innings {
  if (questionIds.length !== BALLS_PER_INNINGS) {
    throw new Error(
      `Puzzle ${puzzle} needs ${BALLS_PER_INNINGS} questions, got ${questionIds.length}`,
    );
  }
  return { puzzle, balls: questionIds.map((id, i) => newBall(puzzle, i, id)) };
}

/** Index of the ball being (or about to be) faced, or -1 once all are done. */
export function currentBallIndex(innings: Innings): number {
  return innings.balls.findIndex((b) => !b.result);
}

export function isComplete(innings: Innings): boolean {
  return innings.balls.every((b) => b.result);
}

export function replaceBall(innings: Innings, ball: Ball): Innings {
  return { ...innings, balls: innings.balls.map((b) => (b.index === ball.index ? ball : b)) };
}

export function total(innings: Innings): { runs: number; wickets: number } {
  let runs = 0;
  let wickets = 0;
  for (const b of innings.balls) {
    if (!b.result) continue;
    runs += b.result.runs;
    if (b.result.kind === "out") wickets++;
  }
  return { runs, wickets };
}

/** Answer lists stay hidden until the whole innings is over. */
export function canRevealAnswers(innings: Innings): boolean {
  return isComplete(innings);
}

/** Settle any ball whose time ran out while the player was away from the page. */
export function resume(innings: Innings, now: number): Innings {
  return { ...innings, balls: innings.balls.map((b) => tick(b, now)) };
}

/**
 * Today's innings: the saved one if it is for today's puzzle (finished or not), otherwise a fresh one.
 * A finished innings is returned as-is, so there is no way to play the same puzzle twice.
 */
export function loadToday(
  saved: Innings | null,
  puzzle: number,
  questionIds: string[],
  now: number,
): Innings {
  // A save for a different question list (the schedule was edited) can't be resumed safely.
  const sameQuestions = saved?.balls.every((b, i) => b.questionId === questionIds[i]);
  if (saved && saved.puzzle === puzzle && sameQuestions) return resume(saved, now);
  return newInnings(puzzle, questionIds);
}
