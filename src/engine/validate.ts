import { hash } from "./hash";
import { answerKeys } from "./match";
import { computeTiers } from "./rarity";
import { COUNTRY_RULE_FROM_DAY, dayProblems, scheduleProblems } from "./schedule";
import {
  type Answer,
  BALLS_PER_INNINGS,
  MIN_ANSWERS,
  type Question,
  type Schedule,
  TAGS,
  TIERS,
} from "./types";

const MIN_PER_TIER = { ootg: 1, six: 2, four: 2, two: 2, single: 2 } as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WIKI_URL = /^https:\/\/en\.wikipedia\.org\/wiki\/[^\s]+$/;

export function validateQuestion(q: Question): string[] {
  const errors: string[] = [];
  const at = (msg: string) => errors.push(`${q.id || "<no id>"}: ${msg}`);

  for (const field of ["id", "prompt", "category", "answerType"] as const) {
    if (!q[field]?.trim()) at(`missing ${field}`);
  }
  if (!q.sources?.length) at("needs at least one Wikipedia source");
  for (const url of q.sources ?? []) {
    if (!WIKI_URL.test(url)) at(`source is not an English Wikipedia article: ${url}`);
  }
  if (!q.tags?.length) at("needs tags");
  for (const tag of q.tags ?? [])
    if (!(TAGS as readonly string[]).includes(tag)) at(`unknown tag ${tag}`);
  const metrics = q.metrics?.length ?? 0;
  if (q.specificWeight !== undefined && !(q.specificWeight >= 0 && q.specificWeight <= 1)) {
    at("specificWeight must be between 0 and 1");
  }
  if (q.asOf !== undefined && !ISO_DATE.test(q.asOf)) at(`asOf must be YYYY-MM-DD`);
  if (q.answers.length < MIN_ANSWERS) at(`has ${q.answers.length} answers, needs ${MIN_ANSWERS}`);

  for (const tier of TIERS) {
    const n = q.answers.filter((a) => a.tier === tier).length;
    if (tier === "ootg" && n !== 1) at(`needs exactly 1 ootg answer, has ${n}`);
    else if (n < MIN_PER_TIER[tier]) at(`needs at least ${MIN_PER_TIER[tier]} ${tier}, has ${n}`);
  }

  const seen = new Map<string, string>();
  for (const a of q.answers) {
    if (!(TIERS as readonly string[]).includes(a.tier))
      at(`"${a.name}" has unknown tier ${a.tier}`);
    if (metrics && (a.values?.length !== metrics || !a.values.every(Number.isFinite))) {
      at(`"${a.name}" needs ${metrics} metric value(s)`);
    }
    if (a.override && !a.override.reason?.trim()) at(`"${a.name}" override needs a reason`);
    for (const key of answerKeys(a)) {
      const owner = seen.get(key);
      if (owner !== undefined && owner !== a.name)
        at(`"${a.name}" and "${owner}" share key "${key}"`);
      else if (owner === a.name) at(`"${a.name}" repeats key "${key}"`);
      seen.set(key, a.name);
    }
  }
  return errors;
}

export function validateBank(questions: Question[], schedule: Schedule): string[] {
  const errors = questions.flatMap(validateQuestion);
  const ids = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) errors.push(`duplicate question id ${q.id}`);
    ids.add(q.id);
  }

  if (!ISO_DATE.test(schedule.launchDate)) errors.push("schedule launchDate must be YYYY-MM-DD");
  const byId = new Map(questions.map((q) => [q.id, q]));
  schedule.days.forEach((day, i) => {
    const label = `day ${i + 1}`;
    const qs = day.map((id) => byId.get(id)).filter((q): q is Question => !!q);
    const countryRule = i + 1 >= COUNTRY_RULE_FROM_DAY;
    for (const p of dayProblems(qs, { countryRule })) errors.push(`${label}: ${p}`);
    if (day.length !== BALLS_PER_INNINGS) errors.push(`${label} has ${day.length} questions`);
    if (new Set(day).size !== day.length) errors.push(`${label} repeats a question`);
    for (const id of day) if (!ids.has(id)) errors.push(`${label} uses unknown question ${id}`);
  });
  const days = schedule.days.map((d) =>
    d.map((id) => byId.get(id)).filter((q): q is Question => !!q),
  );
  errors.push(...scheduleProblems(days));
  return errors;
}

/** Checks the verify and rank steps ran and the stored tiers match the computed ones. */
export function validateContent(q: Question): string[] {
  const errors: string[] = [];
  for (const a of q.answers) {
    if (!a.verified?.wiki || !ISO_DATE.test(a.verified.date ?? "")) {
      errors.push(`${q.id}: "${a.name}" is not verified (run npm run content:verify)`);
    } else if (a.verified.key !== verificationKey(q, a)) {
      errors.push(
        `${q.id}: "${a.name}" changed since it was verified (run npm run content:verify)`,
      );
    }
    const measure = q.popularity === "mentions" ? a.mentions : a.views;
    if (typeof measure !== "number") {
      errors.push(
        `${q.id}: "${a.name}" has no ${q.popularity ?? "views"} (run npm run content:rank)`,
      );
    }
  }
  if (errors.length) return errors;
  const tiers = computeTiers(q);
  for (const a of q.answers) {
    if (tiers.get(a.name) !== a.tier) {
      errors.push(
        `${q.id}: "${a.name}" is ${a.tier} but ranks as ${tiers.get(a.name)} (run npm run content:rank)`,
      );
    }
  }
  return errors;
}

/** Ties a verification to what was checked: changing the answer or sources invalidates it. */
export function verificationKey(q: Question, a: Answer): string {
  return hash(JSON.stringify([a.name, a.aliases ?? [], a.wiki ?? null, q.sources])).toString(36);
}
