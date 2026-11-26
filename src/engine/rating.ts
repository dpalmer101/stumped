import { difficulty } from "./rarity";
import type { Factor, Question, Rating } from "./types";

/** Each factor is 0 (easier) to 2 (harder); see docs/CONTENT.md, Difficulty rating. */
export interface Factors extends Rating {
  /** Fewer right answers leave less to find. */
  answers: Factor;
  /** How little-known the best-known answers are, against the rest of the bank. */
  fame: Factor;
  /** Places can be guessed; players have to be known. */
  guessable: Factor;
  /** Women's and domestic cricket are less widely followed. */
  niche: Factor;
}

export interface Rated {
  /** 1 (easy) to 10 (hard). */
  score: number;
  factors: Factors;
}

const PLACES = new Set(["ground", "country", "county"]);
const FACTORS = 7;

function answersFactor(n: number): Factor {
  if (n >= 33) return 0;
  return n > 20 ? 1 : 2;
}

function guessableFactor(q: Question): Factor {
  if (PLACES.has(q.answerType)) return 0;
  // National and domestic sides are named after places and accept the place name; franchises
  // need their own names.
  if (q.answerType === "team") return q.tags.includes("franchise") ? 1 : 0;
  return q.answerType === "player" ? 2 : 1;
}

function nicheFactor(q: Question): Factor {
  // Women's answers alongside men's make a question easier, not harder.
  const womenOnly = q.tags.includes("women") && !q.tags.includes("men");
  return (Number(womenOnly) + Number(q.tags.includes("domestic"))) as Factor;
}

/** Thirds of the bank, comparing only questions whose fame is measured the same way. */
function fameFactor(q: Question, bank: Question[]): Factor {
  const mode = q.popularity ?? "views";
  const peers = bank.filter((b) => (b.popularity ?? "views") === mode).map(difficulty);
  const below = peers.filter((d) => d < difficulty(q)).length;
  const share = peers.length > 1 ? below / (peers.length - 1) : 0.5;
  if (share < 1 / 3) return 0;
  return share < 2 / 3 ? 1 : 2;
}

/** A question's difficulty from 1 to 10; null until the writer has judged its rating. */
export function rate(q: Question, bank: Question[]): Rated | null {
  if (!q.rating) return null;
  const factors: Factors = {
    ...q.rating,
    answers: answersFactor(q.answers.length),
    fame: fameFactor(q, bank),
    guessable: guessableFactor(q),
    niche: nicheFactor(q),
  };
  const total = Object.values(factors).reduce((sum: number, f) => sum + f, 0);
  return { score: 1 + Math.round((total * 9) / (FACTORS * 2)), factors };
}
