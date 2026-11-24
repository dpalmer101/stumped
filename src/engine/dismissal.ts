import { hash } from "./hash";

export const DISMISSALS = [
  "Bowled",
  "LBW",
  "Caught behind",
  "Caught at slip",
  "Caught in the deep",
  "Caught & bowled",
  "Stumped",
  "Run out",
  "Hit wicket",
] as const;

export const TIMED_OUT = "Timed out";

// Hashing puzzle and ball means everyone out on the same ball sees the same dismissal.
export function pickDismissal(puzzle: number, ballIndex: number, guesses: number): string {
  if (guesses === 0) return TIMED_OUT;
  return DISMISSALS[hash(`${puzzle}:${ballIndex}`) % DISMISSALS.length] as string;
}
