/**
 * Content pipeline: draft → verify → rank → schedule. See docs/CONTENT.md.
 * Usage: npm run content:<draft|gaps|import|spellings|verify|rank|report|schedule> -- [ids or file names]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { assignDeliveries, bandFor, bandOf } from "../src/engine/delivery";
import { appendDays, startedQuestionIds } from "../src/engine/locks";
import { answerKeys, generatedForms, normalise, words } from "../src/engine/match";
import { computeTiers, rarityScores } from "../src/engine/rarity";
import { type Rated, rate } from "../src/engine/rating";
import { allocate, isBroader } from "../src/engine/schedule";
import { type Answer, BALLS_PER_INNINGS, type Question, type Schedule } from "../src/engine/types";
import { validateContent, validateQuestion, verificationKey } from "../src/engine/validate";
import { checkPushed, lock } from "./days";
import { draft } from "./draft";
import { API, getJson, parsePage, titleFromUrl } from "./wiki";

const DATA = "src/data";
const POOL = join(DATA, "questions");
const SCHEDULE = join(DATA, "schedule.json");
const REPORTS = "content-reports";
const today = new Date().toISOString().slice(0, 10);

type PoolFile = { file: string; questions: Question[] };

function readPool(): PoolFile[] {
  return readdirSync(POOL)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({
      file: join(POOL, f),
      questions: JSON.parse(readFileSync(join(POOL, f), "utf8")) as Question[],
    }));
}

function writeJson(file: string, data: unknown) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** Pool questions named on the command line by id or file name (without .json); all if none. */
function* selected(): Generator<{ pf: PoolFile; q: Question }> {
  const names = process.argv.slice(3).filter((a) => !a.startsWith("--"));
  for (const pf of readPool()) {
    for (const q of pf.questions) {
      if (!names.length || names.includes(q.id) || names.includes(basename(pf.file, ".json"))) {
        yield { pf, q };
      }
    }
  }
}

interface SourcePage {
  title: string;
  /** Normalised titles of the articles the page links to. */
  links: Set<string>;
  /** Link titles as written, for the completeness report. */
  linkTitles: string[];
  /** Normalised text (no spaces), for counting mentions. */
  text: string;
  /** Space-separated words with a space at each end, for whole-word matching. */
  wordText: string;
}
const sourceCache = new Map<string, SourcePage>();

async function sourcePage(url: string): Promise<SourcePage> {
  const cached = sourceCache.get(url);
  if (cached) return cached;
  const { html, links } = await parsePage(url);
  const plain = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  const articleLinks = links.filter((t) => !t.includes(":"));
  const page: SourcePage = {
    title: titleFromUrl(url),
    links: new Set(articleLinks.map(normalise)),
    linkTitles: articleLinks,
    text: normalise(plain),
    wordText: ` ${words(plain).join(" ")} `,
  };
  sourceCache.set(url, page);
  return page;
}

interface Resolved {
  title: string;
  missing: boolean;
  disambiguation: boolean;
}

/** Resolve titles in batches of 50, following redirects. */
async function resolveTitles(titles: string[]): Promise<Map<string, Resolved>> {
  const out = new Map<string, Resolved>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      titles: batch.join("|"),
      redirects: "1",
      prop: "pageprops",
      ppprop: "disambiguation",
      format: "json",
      formatversion: "2",
    });
    const data = await getJson<{
      query: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages: { title: string; missing?: boolean; pageprops?: { disambiguation?: string } }[];
      };
    }>(`${API}?${params}`);
    const norm = new Map((data.query.normalized ?? []).map((n) => [n.from, n.to]));
    const redirect = new Map((data.query.redirects ?? []).map((r) => [r.from, r.to]));
    const pages = new Map(data.query.pages.map((p) => [p.title, p]));
    for (const t of batch) {
      const n = norm.get(t) ?? t;
      const final = redirect.get(n) ?? n;
      const page = pages.get(final);
      out.set(t, {
        title: final,
        missing: !page || !!page.missing,
        disambiguation: page?.pageprops?.disambiguation !== undefined,
      });
    }
  }
  return out;
}

async function search(text: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: text,
    srlimit: "3",
    format: "json",
    formatversion: "2",
  });
  const data = await getJson<{ query: { search: { title: string }[] } }>(`${API}?${params}`);
  return data.query.search.map((r) => r.title);
}

async function monthlyViews(title: string): Promise<number> {
  const end = new Date();
  end.setUTCDate(1);
  const start = new Date(end);
  start.setUTCFullYear(end.getUTCFullYear() - 1);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}0100`;
  const article = encodeURIComponent(title.split("#")[0]?.replace(/ /g, "_") ?? title);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${article}/monthly/${fmt(start)}/${fmt(end)}`;
  try {
    const data = await getJson<{ items: { views: number }[] }>(url);
    return data.items.reduce((sum, i) => sum + i.views, 0);
  } catch (e) {
    if (String(e).includes("404")) return 0;
    throw e;
  }
}

/** Wikipedia URLs in free text; keeps balanced brackets such as "(cricket)". */
function wikiUrls(text: string): string[] {
  return (text.match(/https:\/\/en\.wikipedia\.org\/wiki\/\S+/g) ?? []).map((u) => {
    let url = u.replace(/[,;.]+$/, "");
    while ((url.match(/\)/g) ?? []).length > (url.match(/\(/g) ?? []).length)
      url = url.slice(0, -1);
    return url;
  });
}

/** Convert an old-style day file ({ days: Question[][] } with `source`) into a pool file. */
function importDays(file: string) {
  const old = JSON.parse(readFileSync(file, "utf8")) as {
    days: (Question & { source?: string })[][];
  };
  const questions = old.days.flat().map(({ source, ...q }) => ({
    ...q,
    tags: q.tags ?? [],
    sources: q.sources ?? wikiUrls(source ?? ""),
  }));
  const out = join(POOL, basename(file));
  if (existsSync(out) && !process.argv.includes("--force")) {
    throw new Error(
      `${out} already exists and may hold verify/rank results; pass --force to replace it`,
    );
  }
  writeJson(out, questions);
  console.log(
    `Imported ${questions.length} questions into ${out}. Add tags and difficulty ratings, then verify.`,
  );
}

/** Articles the sources link to that aren't answers: a person skims these for missing answers. */
function writeCompletenessReport(q: Question, pages: SourcePage[]) {
  const covered = new Set(
    q.answers.flatMap((a) => [normalise(a.verified?.wiki ?? ""), ...answerKeys(a)]),
  );
  const others = [...new Set(pages.flatMap((p) => p.linkTitles))].filter(
    (t) => !covered.has(normalise(t)),
  );
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(
    join(REPORTS, `${q.id}.txt`),
    `Linked from the sources but not an answer (check for anything missing):\n${others.join("\n")}\n`,
  );
}

async function verify() {
  let failures = 0;
  for (const { pf, q } of selected()) {
    const upToDate = q.answers.every((a) => a.verified?.key === verificationKey(q, a));
    if (!process.argv.includes("--recheck") && upToDate) {
      console.log(`✓ ${q.id} (already verified; --recheck to check again)`);
      continue;
    }
    const pages: SourcePage[] = [];
    const badSources: string[] = [];
    for (const url of q.sources) {
      try {
        pages.push(await sourcePage(url));
      } catch (e) {
        badSources.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (badSources.length || !pages.length) {
      failures += 1;
      console.log(`✗ ${q.id}: bad source(s)`);
      for (const b of badSources) console.log(`    - ${b}`);
      continue;
    }
    const candidates = (a: Answer) =>
      a.wiki
        ? [a.wiki]
        : q.answerType === "player"
          ? [a.name, `${a.name} (cricketer)`]
          : [a.name, `${a.name} (cricket ground)`, `${a.name} cricket team`];
    const resolved = await resolveTitles([...new Set(q.answers.flatMap(candidates))]);
    const problems: string[] = [];
    const articles = new Map<string, string[]>();
    // Evidence is the name and real aliases, never listed misspellings.
    const named = (a: Answer) =>
      [a.name, ...(a.aliases ?? [])].map((n) => words(n).join(" ")).filter((n) => n.length >= 3);

    for (const a of q.answers) {
      const key = verificationKey(q, a);
      const stamp = (wiki: string) => {
        a.verified = { wiki, date: today, key };
        articles.set(wiki, [...(articles.get(wiki) ?? []), a.name]);
      };
      // The article must be one a source actually links to, so a same-named article on
      // something else (the landform "Gully") can't stand in for the right one.
      const linked = candidates(a)
        .map((t) => resolved.get(t))
        .find(
          (r) =>
            r &&
            !r.missing &&
            !r.disambiguation &&
            pages.some((p) => p.links.has(normalise(r.title))),
        );
      if (linked) {
        stamp(linked.title);
        continue;
      }
      // Concepts (positions, deliveries, kit) often have no article of their own; being named,
      // as whole words, on a source page is still verifiable on Wikipedia.
      const mentionedIn = pages.find((p) => named(a).some((n) => p.wordText.includes(` ${n} `)));
      if (mentionedIn) {
        stamp(mentionedIn.title);
        continue;
      }
      const hints = await search(`${a.name} cricket`);
      problems.push(
        `"${a.name}" isn't linked or named in the sources: set "wiki", add an alias or source, or drop it (try: ${hints.join(" | ")})`,
      );
      delete a.verified;
    }
    writeCompletenessReport(q, pages);
    for (const [title, names] of articles) {
      if (names.length > 1)
        console.log(
          `  ! ${q.id}: ${names.join(", ")} share the article "${title}"; ranking will use mentions in the sources instead of page views`,
        );
    }
    failures += problems.length;
    console.log(
      `${problems.length ? "✗" : "✓"} ${q.id} (${q.answers.length - problems.length}/${q.answers.length} verified)`,
    );
    for (const p of problems) console.log(`    - ${p}`);
    writeJson(pf.file, pf.questions);
  }
  console.log(failures ? `\n${failures} answers need attention.` : "\nAll answers verified.");
  if (failures) process.exitCode = 1;
}

/** True when at least a third of the answers verify against the same article. */
function sharesArticles(q: Question): boolean {
  const counts = new Map<string, number>();
  for (const a of q.answers) {
    const w = a.verified?.wiki ?? "";
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return Math.max(...counts.values()) >= q.answers.length / 3;
}

function countMentions(text: string, keys: string[]): number {
  let total = 0;
  for (const k of new Set(keys.filter((x) => x.length >= 3))) total += text.split(k).length - 1;
  return total;
}

async function rank() {
  for (const { pf, q } of selected()) {
    const unverified = q.answers.filter((a) => !a.verified);
    if (unverified.length) {
      console.log(`✗ ${q.id}: verify first (${unverified.length} unverified)`);
      process.exitCode = 1;
      continue;
    }
    if (sharesArticles(q)) {
      // Page views can't tell answers apart that live on one article; how often the sources
      // mention each term is the next best measure of how well known it is.
      const pages: SourcePage[] = [];
      for (const url of q.sources) pages.push(await sourcePage(url));
      q.popularity = "mentions";
      for (const a of q.answers) {
        a.mentions = pages.reduce((sum, p) => sum + countMentions(p.text, answerKeys(a)), 0);
      }
    } else {
      delete q.popularity;
      for (const a of q.answers) a.views = await monthlyViews(a.verified?.wiki ?? a.name);
    }
    const tiers = computeTiers(q);
    for (const a of q.answers) a.tier = tiers.get(a.name) ?? a.tier;
    console.log(`✓ ${q.id}`);
    writeJson(pf.file, pf.questions);
  }
}

const describeRating = (r: Rated | null) =>
  r
    ? `difficulty ${r.score}/10 (${Object.entries(r.factors)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}${r.women ? `, women's +${r.women}` : ""})`
    : "difficulty not rated: add rating.recency, rating.breadth and rating.conditions";

function report() {
  const bank = readPool().flatMap((pf) => pf.questions);
  for (const { q } of selected()) {
    console.log(`\n${q.id}: ${q.prompt}`);
    console.log(`  ${describeRating(rate(q, bank))}`);
    const rows = rarityScores(q).sort((a, b) => b.score - a.score);
    const byName = new Map(q.answers.map((a) => [a.name, a]));
    for (const r of rows) {
      const a = byName.get(r.name);
      const spec = r.specific === null ? "" : ` specific ${r.specific.toFixed(2)}`;
      console.log(
        `  ${(a?.tier ?? "").padEnd(6)} ${r.score.toFixed(2)}  ${r.name}  (${q.popularity === "mentions" ? `mentions ${a?.mentions ?? "?"}` : `views ${a?.views ?? "?"}`}, general ${r.general.toFixed(2)}${spec}${a?.override ? `, override: ${a.override.reason}` : ""})`,
      );
    }
  }
}

/** Every form each answer accepts, so the author can spot missing short names and misspellings. */
function spellings() {
  for (const { q } of selected()) {
    console.log(`\n${q.id}: ${q.prompt}`);
    const generated = generatedForms(q);
    for (const a of q.answers) {
      const auto = [...generated].filter(([, owner]) => owner === a).map(([f]) => f);
      const extra = [...(a.aliases ?? []), ...(a.misspellings ?? [])];
      const flag = extra.length || auto.length ? "" : "  <- name only";
      console.log(
        `  ${a.name}: aliases [${(a.aliases ?? []).join(", ")}] misspellings [${(a.misspellings ?? []).join(", ")}] auto [${auto.join(", ")}]${flag}`,
      );
    }
  }
}

function schedule() {
  const current = JSON.parse(readFileSync(SCHEDULE, "utf8")) as Schedule;
  const pool = readPool().flatMap((pf) => pf.questions);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const history = current.days.map((d) => d.map((id) => byId.get(id) as Question));
  const broken = pool.flatMap(validateQuestion);
  if (broken.length) throw new Error(`Fix these first:\n${broken.join("\n")}`);
  // --ranked-only: schedule from questions that have finished verify and rank, while the rest run.
  const rankedOnly = process.argv.includes("--ranked-only");
  // The allocator handles re-use (only after 30 days), so offer it the whole eligible pool.
  const eligible = pool.filter((q) => !rankedOnly || validateContent(q).length === 0);
  const unused = eligible.filter((q) => !current.days.flat().includes(q.id));
  const count = Number(
    process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ??
      Math.floor(unused.length / BALLS_PER_INNINGS),
  );
  const days = allocate(eligible, count, history);
  const extended = appendDays(
    current,
    days.map((d) => d.map((q) => q.id)),
    new Date(),
  );
  const before = readFileSync(SCHEDULE, "utf8");
  writeJson(SCHEDULE, extended);
  try {
    lock();
  } catch (e) {
    writeFileSync(SCHEDULE, before);
    throw e;
  }
  days.forEach((d, i) => {
    console.log(`Day ${current.days.length + i + 1}:`);
    for (const q of d)
      console.log(`  ${q.answerType.padEnd(10)} [${q.tags.join(", ")}] ${q.prompt}`);
  });
}

/** What the unused pool can still fill, and which answer types to write next. */
function gaps() {
  const current = JSON.parse(readFileSync(SCHEDULE, "utf8")) as Schedule;
  const pool = readPool().flatMap((pf) => pf.questions);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const history = current.days.map((d) => d.map((id) => byId.get(id) as Question));
  const scheduled = new Set(current.days.flat());
  // Only questions content:schedule would accept, and no re-use: this counts new material.
  const unused = pool.filter((q) => !scheduled.has(q.id) && !validateQuestion(q).length);
  let fits = 0;
  for (let n = 1; n <= Math.floor(unused.length / BALLS_PER_INNINGS); n++) {
    try {
      allocate(unused, n, history);
      fits = n;
    } catch {
      break;
    }
  }
  const types: Question["answerType"][] = [
    "player",
    "country",
    "county",
    "team",
    "tournament",
    "position",
    "ground",
    "other",
  ];
  console.log(`Unused questions: ${unused.length}. New days they can fill: ${fits}.\n`);
  console.log("Unused by answer type (a day takes at most 2 players and 1 of each other type):");
  for (const t of types) {
    const n = unused.filter((q) => q.answerType === t).length;
    console.log(`  ${t.padEnd(10)} ${String(n).padStart(3)}${n === 0 ? "  <- none waiting" : ""}`);
  }
  const general = unused.filter((q) => q.tags.includes("general")).length;
  const broader = unused.filter(isBroader).length;
  console.log(`\n  general knowledge ${general} (max 2 a day)`);
  console.log(`  beyond men's internationals ${broader} (at least 1 a day)`);
  console.log(`\nDifficulty, whole bank:  ${spread(pool, pool)}`);
  console.log(`Difficulty, unused:      ${spread(unused, pool)}`);
  console.log("\nPick the next themes from docs/THEMES.md for the types that are short.");
}

/** How many questions are easy (1–3), medium (4–7) and hard (8–10), and how many aren't rated. */
function spread(qs: Question[], bank: Question[]): string {
  const scores = qs.map((q) => rate(q, bank)?.score);
  const count = (lo: number, hi: number) =>
    scores.filter((s) => s !== undefined && s >= lo && s <= hi).length;
  const unrated = scores.filter((s) => s === undefined).length;
  return `easy ${count(1, 3)}, medium ${count(4, 7)}, hard ${count(8, 10)}${unrated ? `, not rated ${unrated}` : ""}`;
}

/** Every question's 1–10 difficulty, easiest first, with the days it's scheduled on. */
function difficultyReport() {
  const current = JSON.parse(readFileSync(SCHEDULE, "utf8")) as Schedule;
  const bank = readPool().flatMap((pf) => pf.questions);
  const days = new Map<string, number[]>();
  current.days.forEach((d, i) => {
    for (const id of d) days.set(id, [...(days.get(id) ?? []), i + 1]);
  });
  const rows = bank
    .map((q) => ({ q, r: rate(q, bank) }))
    .sort((a, b) => (a.r?.score ?? 99) - (b.r?.score ?? 99) || a.q.id.localeCompare(b.q.id));
  for (const { q, r } of rows) {
    const on = days.get(q.id);
    console.log(
      `${String(r?.score ?? "?").padStart(2)}  ${q.id}  ${on ? `day ${on.join(", ")}` : "unused"}\n    ${describeRating(r)}`,
    );
  }
  console.log("\nAverage difficulty per day:");
  current.days.forEach((d, i) => {
    const scores = d.map((id) => rate(bank.find((q) => q.id === id) as Question, bank)?.score);
    const rated = scores.filter((s): s is number => s !== undefined);
    const avg = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : "?";
    console.log(
      `  day ${String(i + 1).padStart(2)}  ${avg}  [${scores.map((s) => s ?? "?").join(", ")}]`,
    );
  });
  console.log(`\n${spread(bank, bank)}`);
}

/**
 * Gives every question without a delivery one from its difficulty band, and replaces any that's
 * drifted out of its band, except on started days (docs/CONTENT.md, Deliveries).
 */
function deliveries() {
  const current = JSON.parse(readFileSync(SCHEDULE, "utf8")) as Schedule;
  const pool = readPool();
  const bank = pool.flatMap((pf) => pf.questions);
  const dayOf = new Map<string, number>();
  current.days.forEach((d, i) => {
    for (const id of d) if (!dayOf.has(id)) dayOf.set(id, i);
  });
  const unrated = bank.filter((q) => !q.delivery && !q.rating).map((q) => q.id);
  if (unrated.length) console.log(`Not rated, so skipped: ${unrated.join(", ")}`);
  // Scheduled days first, in ball order, so a day's balls vary; then the unused questions.
  const order = [...current.days.flat(), ...bank.map((q) => q.id)];
  const byId = new Map(bank.map((q) => [q.id, q]));
  const started = startedQuestionIds(current, new Date());
  const rows = [...new Set(order)].flatMap((id) => {
    const q = byId.get(id);
    const r = q && rate(q, bank);
    if (!q || !r) return [];
    const drifted = q.delivery && !started.has(id) && bandOf(q.delivery) !== bandFor(r.score);
    if (drifted) console.log(`${q.id}: ${q.delivery} no longer fits difficulty ${r.score}`);
    const delivery = drifted ? undefined : q.delivery;
    return [{ id, delivery, score: r.score, day: dayOf.get(id) }];
  });
  const picked = assignDeliveries(rows);
  for (const pf of pool) {
    if (!pf.questions.some((q) => picked.has(q.id))) continue;
    pf.questions = pf.questions.map((q) => {
      const delivery = picked.get(q.id);
      if (!delivery) return q;
      console.log(`${delivery.padEnd(14)} ${q.id}`);
      // Straight after rating, as in docs/CONTENT.md, leaving the other fields where they are.
      const entries = Object.entries(q).filter(([k]) => k !== "delivery");
      const at = entries.findIndex(([k]) => k === "rating") + 1 || entries.length;
      entries.splice(at, 0, ["delivery", delivery]);
      return Object.fromEntries(entries) as Question;
    });
    writeJson(pf.file, pf.questions);
  }
  console.log(`\nGave ${picked.size} question(s) a delivery.`);
}

const command = process.argv[2];
const run: Record<string, () => unknown> = {
  import: () => importDays(process.argv[3] ?? ""),
  verify,
  rank,
  report,
  spellings,
  schedule,
  draft,
  gaps,
  difficulty: difficultyReport,
  deliveries,
  lock: () => lock(),
  "check-pushed": () => checkPushed(process.argv[3] || undefined),
};
const fn = command ? run[command] : undefined;
if (!fn) {
  console.log(
    "Usage: tsx tools/content.ts <draft ID URL…|gaps|import FILE|verify [ids]|rank [ids]|report [ids]|difficulty|deliveries|spellings [ids]|schedule [--days=N]|lock|check-pushed [url]>",
  );
  process.exitCode = 1;
} else {
  await fn();
}
