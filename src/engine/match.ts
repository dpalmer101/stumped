import type { Answer, Question } from "./types";

// Letters that don't split into base letter + accent under NFD.
const SPECIAL: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

export function words(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => SPECIAL[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    // Dots and apostrophes join letters ("M.S." -> "ms", "Lord's" -> "lords").
    .replace(/[.'’‘`´ʼ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const parts = cleaned ? cleaned.split(" ") : [];
  if (parts[0] === "the" && parts.length > 1) parts.shift();
  return parts;
}

/**
 * Matching key: spaces are dropped so "MS Dhoni", "M.S. Dhoni" and "M S Dhoni" agree.
 */
export function normalise(text: string): string {
  return words(text).join("");
}

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, at(i - 2, j - 2) + 1);
      }
      (d[i] as number[])[j] = v;
    }
  }
  return at(a.length, b.length);
}

function typoAllowance(key: string): number {
  if (key.length >= 9) return 2;
  if (key.length >= 5) return 1;
  return 0;
}

export function answerKeys(answer: Answer): string[] {
  return [answer.name, ...(answer.aliases ?? []), ...(answer.misspellings ?? [])]
    .map(normalise)
    .filter(Boolean);
}

// Words players leave out: "Lancashire County Cricket Club" -> "lancashire".
const GENERIC = new Set([
  "cricket",
  "ground",
  "stadium",
  "club",
  "county",
  "national",
  "team",
  "international",
  "association",
  "trophy",
  "of",
  "and",
]);
const MINOR = new Set(["of", "and", "the", "de", "da"]);

/** Doubled letters are the commonest misspelling ("Traford", "Bopara"), so compare without them too. */
const undouble = (key: string) => key.replace(/(.)\1+/g, "$1");

function shortForm(name: string): string | null {
  const parts = words(name);
  const kept = parts.filter((w) => !GENERIC.has(w));
  if (!kept.length || kept.length === parts.length) return null;
  const key = kept.join("");
  return key.length >= 4 ? key : null;
}

function acronym(name: string, answerType: Question["answerType"]): string | null {
  const parts = words(name).filter((w) => !MINOR.has(w));
  if (parts.length < 2) return null;
  const key = parts.map((w) => w[0]).join("");
  // Two letters is enough for team names fans really use ("MI", "KKR" is three).
  return key.length >= 3 || answerType === "team" ? key : null;
}

/**
 * Extra forms worked out from the name: short form without generic words, acronym and, for
 * players, surname. Each is accepted only if no other answer in the question produces it too.
 */
export function generatedForms(question: Matchable): Map<string, Answer> {
  const exact = new Set(question.answers.flatMap(answerKeys));
  const counts = new Map<string, number>();
  const owner = new Map<string, Answer>();
  for (const answer of question.answers) {
    const parts = words(answer.name);
    const forms = new Set(
      [
        shortForm(answer.name),
        acronym(answer.name, question.answerType),
        question.answerType === "player" && parts.length > 1 ? parts[parts.length - 1] : null,
      ].filter((f): f is string => !!f && !answerKeys(answer).includes(f)),
    );
    for (const f of forms) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
      owner.set(f, answer);
    }
  }
  const out = new Map<string, Answer>();
  for (const [form, answer] of owner) {
    if (counts.get(form) === 1 && !exact.has(form)) out.set(form, answer);
  }
  return out;
}

export type Matcher = (guess: string) => Answer | null;
type Matchable = Pick<Question, "answerType" | "answers">;

export function createMatcher(question: Matchable): Matcher {
  const exact = new Map<string, Answer>();
  for (const answer of question.answers) {
    for (const key of answerKeys(answer)) exact.set(key, answer);
  }
  const generated = generatedForms(question);
  // Typos are measured against full names, aliases, misspellings and short forms, not acronyms.
  const fuzzyTargets = [...exact, ...[...generated].filter(([f]) => f.length >= 5)];

  return (guess: string) => {
    const key = normalise(guess);
    if (!key) return null;
    const hit = exact.get(key) ?? generated.get(key);
    if (hit) return hit;

    const allowance = typoAllowance(key);
    if (allowance === 0) return null;
    const near = new Set<Answer>();
    for (const [candidate, answer] of fuzzyTargets) {
      if (Math.abs(candidate.length - key.length) > allowance + 2) continue;
      const limit = Math.min(allowance, typoAllowance(candidate));
      const distance = Math.min(
        editDistance(key, candidate),
        editDistance(undouble(key), undouble(candidate)),
      );
      if (distance <= limit) near.add(answer);
    }
    return near.size === 1 ? ([...near][0] ?? null) : null;
  };
}
