import { type Innings, total } from "./innings";
import type { Tier } from "./types";

const EMOJI: Record<Tier, string> = {
  ootg: "🏟️",
  six: "6️⃣",
  four: "4️⃣",
  two: "2️⃣",
  single: "1️⃣",
};

/** One line that gives friends something to react to, without giving answers away. */
export function verdict(innings: Innings): string {
  const { runs, wickets } = total(innings);
  const count = (t: Tier) =>
    innings.balls.filter((b) => b.result?.kind === "hit" && b.result.tier === t).length;
  const ootg = count("ootg");
  const sixes = count("six");
  const boundaries = count("four") + sixes + ootg;
  if (runs === 0) return "Duck 🦆";
  if (ootg > 1) return `${ootg}× out of the ground!`;
  if (ootg === 1) return "Out of the ground!";
  if (wickets === 0) return "Not out!";
  if (sixes > 1) return `${sixes} sixes`;
  if (sixes === 1) return "Cleared the rope";
  if (boundaries > 0) return boundaries === 1 ? "Found the boundary" : `${boundaries} boundaries`;
  return `${runs} off the over`;
}

export function shareText(innings: Innings, url: string, streak = 0): string {
  const { runs, wickets } = total(innings);
  const balls = innings.balls
    .map((b) => {
      if (!b.result) return "▫️";
      return b.result.kind === "out" ? "☝️" : EMOJI[b.result.tier];
    })
    .join(" ");
  const streakText = streak >= 2 ? ` · 🔥 ${streak}-day streak` : "";
  return `Stumped #${innings.puzzle} 🏏 ${runs}/${wickets}\n${balls}\n${verdict(innings)}${streakText}\n${url}`;
}
