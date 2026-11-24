import { type Innings, total } from "./innings";
import type { Tier } from "./types";

const EMOJI: Record<Tier, string> = {
  ootg: "🏟️",
  six: "6️⃣",
  four: "4️⃣",
  two: "2️⃣",
  single: "1️⃣",
};

export function shareText(innings: Innings, url: string): string {
  const { runs, wickets } = total(innings);
  const balls = innings.balls
    .map((b) => {
      if (!b.result) return "▫️";
      return b.result.kind === "out" ? "☝️" : EMOJI[b.result.tier];
    })
    .join(" ");
  return `Stumped #${innings.puzzle} — ${runs}/${wickets}\n${balls}\n${url}`;
}
