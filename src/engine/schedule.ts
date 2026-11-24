import { difficulty } from "./rarity";
import { BALLS_PER_INNINGS, type Question, type Tag } from "./types";

const FORMATS: Tag[] = ["test", "odi", "t20"];
/** Anything other than men's international cricket. */
const BROADER: Tag[] = ["women", "domestic", "franchise", "general"];
const MAX_SAME_TYPE = 2;
const MAX_SAME_FORMAT = 3;

const isBroader = (q: Question) => q.tags.some((t) => BROADER.includes(t));

function fits(day: Question[], q: Question): boolean {
  if (day.length >= BALLS_PER_INNINGS) return false;
  if (day.some((d) => d.category === q.category)) return false;
  if (day.filter((d) => d.answerType === q.answerType).length >= MAX_SAME_TYPE) return false;
  return FORMATS.every(
    (f) => !q.tags.includes(f) || day.filter((d) => d.tags.includes(f)).length < MAX_SAME_FORMAT,
  );
}

/** Variety rules for one day; see docs/CONTENT.md. */
export function dayProblems(day: Question[]): string[] {
  const problems: string[] = [];
  const categories = new Set(day.map((q) => q.category));
  if (categories.size !== day.length) problems.push("two questions share a category");
  for (const type of new Set(day.map((q) => q.answerType))) {
    const n = day.filter((q) => q.answerType === type).length;
    if (n > MAX_SAME_TYPE) problems.push(`${n} questions with ${type} answers`);
  }
  for (const f of FORMATS) {
    const n = day.filter((q) => q.tags.includes(f)).length;
    if (n > MAX_SAME_FORMAT) problems.push(`${n} ${f} questions`);
  }
  if (!day.some(isBroader)) problems.push("only men's international questions");
  return problems;
}

/**
 * Deal unused questions into `count` new days: broader-cricket questions first so every day gets
 * one, then hardest first onto the day with the least difficulty so far. Each day is then ordered
 * easiest to hardest.
 */
export function allocate(pool: Question[], count: number): Question[][] {
  const days: Question[][] = Array.from({ length: count }, () => []);
  const load = (day: Question[]) => day.reduce((sum, q) => sum + difficulty(q), 0);
  const byHardest = [...pool].sort(
    (a, b) => difficulty(b) - difficulty(a) || a.id.localeCompare(b.id),
  );
  const ordered = [...byHardest.filter(isBroader).slice(0, count), ...byHardest];
  const placed = new Set<string>();

  for (const q of ordered) {
    if (placed.has(q.id)) continue;
    const target = days
      .filter((d) => fits(d, q))
      .sort((a, b) => a.length - b.length || load(a) - load(b))[0];
    if (target) {
      target.push(q);
      placed.add(q.id);
    }
  }
  days.forEach((day, i) => {
    if (day.length !== BALLS_PER_INNINGS) {
      throw new Error(
        `Day ${i + 1} only got ${day.length} questions; add more varied questions to the pool`,
      );
    }
    const problems = dayProblems(day);
    if (problems.length) throw new Error(`Day ${i + 1}: ${problems.join(", ")}`);
    day.sort((a, b) => difficulty(a) - difficulty(b));
  });
  return days;
}
