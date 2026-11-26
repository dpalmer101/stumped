import { difficulty } from "./rarity";
import { BALLS_PER_INNINGS, COUNTRIES, type Question, type Tag } from "./types";

// Variety rules, strongest first (see docs/CONTENT.md): within a day, then within any week. After
// that similar questions are fine, and a question may come back once 30 days have passed.
const FORMATS: Tag[] = ["test", "odi", "t20"];
/** Anything other than men's international cricket. */
const BROADER: Tag[] = ["women", "domestic", "franchise", "general"];
/** One question per answer type a day; players, the heart of most cricket trivia, may have two. */
const maxOfType = (type: string) => (type === "player" ? 2 : 1);
const MAX_SAME_FORMAT = 3;
const MAX_GENERAL = 2;
const WEEK = 7;
const MAX_CATEGORY_PER_WEEK = 2;
export const REUSE_AFTER_DAYS = 30;
/** Days 1–4 were played before the one-question-per-country rule, so they keep their clashes. */
export const COUNTRY_RULE_FROM_DAY = 5;

export const isBroader = (q: Question) => q.tags.some((t) => BROADER.includes(t));
const isGeneral = (q: Question) => q.tags.includes("general");
const countries = (q: Question) => q.tags.filter((t) => COUNTRIES.includes(t));
const sharesCountry = (a: Question, b: Question) =>
  countries(a).some((c) => countries(b).includes(c));

function fitsDay(day: Question[], q: Question): boolean {
  if (day.length >= BALLS_PER_INNINGS) return false;
  if (day.some((d) => d.category === q.category)) return false;
  if (day.some((d) => sharesCountry(d, q))) return false;
  if (day.filter((d) => d.answerType === q.answerType).length >= maxOfType(q.answerType))
    return false;
  if (isGeneral(q) && day.filter(isGeneral).length >= MAX_GENERAL) return false;
  return FORMATS.every(
    (f) => !q.tags.includes(f) || day.filter((d) => d.tags.includes(f)).length < MAX_SAME_FORMAT,
  );
}

/** Would adding `q` to day `index` put its category on more than 2 days in any 7 in a row? */
function fitsWeek(days: Question[][], index: number, q: Question): boolean {
  for (let start = Math.max(0, index - WEEK + 1); start <= index; start++) {
    const n = days
      .slice(start, start + WEEK)
      .filter((d, i) => start + i !== index && d.some((x) => x.category === q.category)).length;
    if (n + 1 > MAX_CATEGORY_PER_WEEK) return false;
  }
  return true;
}

/** Most recent day index each question was used on. */
function lastUses(days: Question[][]): Map<string, number> {
  const last = new Map<string, number>();
  days.forEach((d, i) => {
    for (const q of d) last.set(q.id, i);
  });
  return last;
}

/** Variety rules for one day. */
export function dayProblems(day: Question[], { countryRule = true } = {}): string[] {
  const problems: string[] = [];
  const categories = new Set(day.map((q) => q.category));
  if (categories.size !== day.length) problems.push("two questions share a category");
  if (countryRule) {
    for (const c of COUNTRIES) {
      const n = day.filter((q) => q.tags.includes(c)).length;
      if (n > 1) problems.push(`${n} questions about ${c}`);
    }
  }
  for (const type of new Set(day.map((q) => q.answerType))) {
    const n = day.filter((q) => q.answerType === type).length;
    if (n > maxOfType(type)) problems.push(`${n} questions with ${type} answers`);
  }
  for (const f of FORMATS) {
    const n = day.filter((q) => q.tags.includes(f)).length;
    if (n > MAX_SAME_FORMAT) problems.push(`${n} ${f} questions`);
  }
  const general = day.filter(isGeneral).length;
  if (general > MAX_GENERAL) problems.push(`${general} general-knowledge questions`);
  if (!day.some(isBroader)) problems.push("only men's international questions");
  return problems;
}

/** Variety across days: categories within any week, and re-use only after 30 days. */
export function scheduleProblems(days: Question[][]): string[] {
  const problems: string[] = [];
  for (let start = 0; start + WEEK <= Math.max(days.length, WEEK); start++) {
    const window = days.slice(start, start + WEEK);
    const counts = new Map<string, number>();
    for (const d of window) {
      for (const c of new Set(d.map((q) => q.category))) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const [category, n] of counts) {
      if (n > MAX_CATEGORY_PER_WEEK) {
        problems.push(`days ${start + 1}–${start + window.length}: "${category}" on ${n} days`);
      }
    }
  }
  const last = new Map<string, number>();
  days.forEach((d, i) => {
    for (const q of d) {
      const prev = last.get(q.id);
      if (prev !== undefined && i - prev < REUSE_AFTER_DAYS) {
        problems.push(
          `day ${i + 1} reuses ${q.id} from day ${prev + 1} (needs ${REUSE_AFTER_DAYS} days)`,
        );
      }
      last.set(q.id, i);
    }
  });
  return problems;
}

/** Small seeded shuffle, so the same pool always gives the same schedule. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** One greedy pass over the pool in the given order; null if any day can't be filled. */
function deal(order: Question[], count: number, history: Question[][]): Question[][] | null {
  const fresh: Question[][] = Array.from({ length: count }, () => []);
  const all = [...history, ...fresh];
  const last = lastUses(history);
  const load = (day: Question[]) => day.reduce((sum, q) => sum + difficulty(q), 0);
  const placed = new Set<string>();
  for (const q of order) {
    if (placed.has(q.id)) continue;
    const target = fresh
      .map((day, j) => ({ day, index: history.length + j }))
      .filter(({ day, index }) => {
        const prev = last.get(q.id);
        const reusable = prev === undefined || index - prev >= REUSE_AFTER_DAYS;
        return reusable && fitsDay(day, q) && fitsWeek(all, index, q);
      })
      .sort((a, b) => a.day.length - b.day.length || load(a.day) - load(b.day))[0];
    if (target) {
      target.day.push(q);
      placed.add(q.id);
    }
  }
  return fresh.every((d) => d.length === BALLS_PER_INNINGS && !dayProblems(d).length)
    ? fresh
    : null;
}

/**
 * Deal questions into `count` new days after `history`, keeping every variety rule. The first
 * pass goes hardest-first with broader-cricket questions spread one per day, which balances
 * difficulty; if that dead-ends, seeded reshuffles are tried so the result is still repeatable.
 * Each day is then ordered easiest to hardest.
 */
export function allocate(
  pool: Question[],
  count: number,
  history: Question[][] = [],
): Question[][] {
  const byHardest = [...pool].sort(
    (a, b) => difficulty(b) - difficulty(a) || a.id.localeCompare(b.id),
  );
  const broaderFirst = (order: Question[]) => [
    ...order.filter(isBroader).slice(0, count),
    ...order,
  ];
  for (let attempt = 0; attempt < 2000; attempt++) {
    const order = attempt === 0 ? byHardest : shuffled(byHardest, attempt);
    const days = deal(broaderFirst(order), count, history);
    if (days) {
      for (const day of days) day.sort((a, b) => difficulty(a) - difficulty(b));
      return days;
    }
  }
  throw new Error(`Couldn't fill ${count} varied day(s); add more varied questions to the pool`);
}
