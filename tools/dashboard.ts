/**
 * Exports the question bank as JSON for the question bank dashboard (a claude.ai artifact).
 * Usage: npm run content:dashboard  → content-reports/dashboard/{questions,slots,countries}.json
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { latestStartedPuzzle } from "../src/engine/locks";
import { dayIndex } from "../src/engine/puzzle";
import { rate } from "../src/engine/rating";
import { COUNTRIES, type Question, type Schedule, TIERS } from "../src/engine/types";
import { validateContent } from "../src/engine/validate";

const OUT = "content-reports/dashboard";
const POOL = "src/data/questions";
const pool: Question[] = readdirSync(POOL)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(POOL, f), "utf8")) as Question[]);
const schedule = JSON.parse(readFileSync("src/data/schedule.json", "utf8")) as Schedule;
const now = new Date();
const started = latestStartedPuzzle(now, schedule.launchDate);

// Names as world-atlas spells them; cricket sides that span several countries map to all of them.
const CARIBBEAN = [
  "Jamaica",
  "Trinidad and Tobago",
  "Barbados",
  "Guyana",
  "Antigua and Barb.",
  "Saint Lucia",
  "Grenada",
  "St. Vin. and Gren.",
  "St. Kitts and Nevis",
  "Dominica",
];
const MAP_NAMES: Record<string, string[]> = {
  England: ["United Kingdom"],
  Scotland: ["United Kingdom"],
  Wales: ["United Kingdom"],
  "Northern Ireland": ["United Kingdom"],
  "Young England": ["United Kingdom"],
  "West Indies": CARIBBEAN,
  "United States": ["United States of America"],
  "Antigua and Barbuda": ["Antigua and Barb."],
  "Saint Kitts and Nevis": ["St. Kitts and Nevis"],
  "Saint Vincent and the Grenadines": ["St. Vin. and Gren."],
  "Cayman Islands": ["Cayman Is."],
  "Cook Islands": ["Cook Is."],
  "Falkland Islands": ["Falkland Is."],
  "Turks and Caicos Islands": ["Turks and Caicos Is."],
  "Chinese Taipei": ["Taiwan"],
  "Czech Republic": ["Czechia"],
  Eswatini: ["eSwatini"],
  "Ivory Coast": ["Côte d'Ivoire"],
  "East Africa": ["Kenya", "Uganda", "Tanzania"],
  "East and Central Africa": ["Kenya", "Uganda", "Tanzania", "Zambia", "Malawi"],
  "West Africa": ["Nigeria", "Ghana", "Gambia", "Sierra Leone"],
};
const TAG_MAP: Record<string, string[]> = {
  england: ["United Kingdom"],
  india: ["India"],
  australia: ["Australia"],
  "new-zealand": ["New Zealand"],
  "south-africa": ["South Africa"],
  "west-indies": CARIBBEAN,
  pakistan: ["Pakistan"],
  "sri-lanka": ["Sri Lanka"],
  bangladesh: ["Bangladesh"],
};
// Composite XIs belong to no one country.
const UNPLACEABLE = new Set([
  "Africa XI",
  "Asian Cricket Council XI",
  "ICC World XI",
  "International XI",
]);

const isNationalSide = (q: Question) =>
  q.answerType === "country" ||
  (q.answerType === "team" && q.tags.includes("international") && !q.tags.includes("franchise"));

const dateOf = (puzzle: number) => {
  const d = new Date(`${schedule.launchDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + puzzle - 1);
  return d.toISOString().slice(0, 10);
};

// Overs (puzzles) in play order: every one that has started, then the upcoming ones up to the
// last day not yet played. Once the schedule loops, segments decide which day an over plays, and
// replayed days can sit between the new ones.
const overs: { puzzle: number; day: number }[] = [];
const seen = new Set<number>();
let lastNew = 0;
for (let p = 1; p <= Math.max(started, 0) + schedule.days.length; p++) {
  const day = dayIndex(p, schedule);
  if (!seen.has(day)) lastNew = p;
  seen.add(day);
  overs.push({ puzzle: p, day });
}
overs.splice(Math.max(started, lastNew));
const puzzlesOf = new Map<string, number[]>();
for (const { puzzle, day } of overs) {
  for (const id of schedule.days[day] ?? [])
    puzzlesOf.set(id, [...(puzzlesOf.get(id) ?? []), puzzle]);
}
const scheduled = new Set(schedule.days.flat());

const band = (s?: number) =>
  s === undefined ? "unrated" : s <= 3 ? "easy" : s <= 7 ? "medium" : "hard";
const pick = (q: Question, tags: readonly string[]) =>
  q.tags.filter((t) => tags.includes(t)).join(",");

const questions = pool.map((q) => {
  const r = rate(q, pool);
  const on = puzzlesOf.get(q.id) ?? [];
  const men = q.tags.includes("men");
  const women = q.tags.includes("women");
  return {
    id: q.id,
    prompt: q.prompt,
    category: q.category,
    answerType: q.answerType,
    difficulty: r?.score ?? null,
    band: band(r?.score),
    recency: r?.factors.recency ?? null,
    breadth: r?.factors.breadth ?? null,
    conditions: r?.factors.conditions ?? null,
    answersFactor: r?.factors.answers ?? null,
    fame: r?.factors.fame ?? null,
    guessable: r?.factors.guessable ?? null,
    niche: r?.factors.niche ?? null,
    womenStep: r?.women ?? 0,
    delivery: q.delivery ?? null,
    answers: q.answers.length,
    // Tier order, so the page can list them rarest first without re-ranking.
    answerList: TIERS.flatMap((t) =>
      q.answers.filter((a) => a.tier === t).map((a) => `${t}:${a.name}`),
    ).join("|"),
    gender: men && women ? "both" : women ? "women" : men ? "men" : "open",
    formats: pick(q, ["test", "odi", "t20"]),
    scope: pick(q, ["international", "domestic", "franchise", "general"]),
    countries: pick(q, COUNTRIES),
    firstDay: on[0] ?? null,
    days: on.join(","),
    status: !scheduled.has(q.id) ? "unused" : on.some((p) => p <= started) ? "played" : "scheduled",
    ready: validateContent(q).length === 0,
  };
});

const byId = new Map(pool.map((q) => [q.id, q]));
const slots = overs.flatMap(({ puzzle, day }) =>
  (schedule.days[day] ?? []).map((id, ball) => {
    const q = byId.get(id) as Question;
    return {
      day: puzzle,
      scheduleDay: day + 1,
      ball: ball + 1,
      date: dateOf(puzzle),
      started: puzzle <= started,
      id,
      category: q.category,
      answerType: q.answerType,
      difficulty: rate(q, pool)?.score ?? null,
      delivery: q.delivery ?? null,
    };
  }),
);

// Answers per map country: national sides by the answer itself, other answers by the question's
// single country tag. Answers to multi-country questions stay unplaced.
interface CountryRow {
  country: string;
  questionsAbout: number;
  answers: number;
  answerQuestions: number;
  examples: string;
}
const countries = new Map<string, CountryRow & { qs: Set<string>; names: string[] }>();
const row = (country: string) => {
  let r = countries.get(country);
  if (!r) {
    r = {
      country,
      questionsAbout: 0,
      answers: 0,
      answerQuestions: 0,
      examples: "",
      qs: new Set(),
      names: [],
    };
    countries.set(country, r);
  }
  return r;
};
const placed = new Map<string, number>();
for (const q of pool) {
  const tagged = q.tags.filter((t) => COUNTRIES.includes(t));
  for (const c of new Set(tagged.flatMap((t) => TAG_MAP[t] ?? []))) row(c).questionsAbout++;
  for (const a of q.answers) {
    let places: string[] = [];
    if (isNationalSide(q) && !UNPLACEABLE.has(a.name)) places = MAP_NAMES[a.name] ?? [a.name];
    else if (tagged.length === 1) places = TAG_MAP[tagged[0] as string] ?? [];
    if (places.length) placed.set(q.id, (placed.get(q.id) ?? 0) + 1);
    for (const c of new Set(places)) {
      const r = row(c);
      r.answers++;
      r.qs.add(q.id);
      if (!r.names.includes(a.name)) r.names.push(a.name);
    }
  }
}
const countryRows: CountryRow[] = [...countries.values()]
  .map(({ qs, names, ...r }) => ({
    ...r,
    answerQuestions: qs.size,
    examples: names.slice(0, 6).join(", "),
  }))
  .sort((a, b) => b.answers - a.answers || a.country.localeCompare(b.country));
for (const q of questions) Object.assign(q, { placedAnswers: placed.get(q.id) ?? 0 });

mkdirSync(OUT, { recursive: true });
const meta = [
  { label: "Exported", value: now.toISOString() },
  { label: "Generator", value: "tools/dashboard.ts" },
];
const write = (name: string, rows: unknown[]) =>
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ rows, meta }));
write("questions", questions);
write("slots", slots);
write("countries", countryRows);
console.log(
  `Wrote ${questions.length} questions, ${slots.length} slots, ${countryRows.length} countries to ${OUT}`,
);
