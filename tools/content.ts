/**
 * Content pipeline: import → verify → rank → schedule. See docs/CONTENT.md.
 * Usage: npm run content:<import|spellings|verify|rank|report|schedule> -- [ids or file names]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { answerKeys, generatedForms, normalise, words } from "../src/engine/match";
import { computeTiers, rarityScores } from "../src/engine/rarity";
import { allocate } from "../src/engine/schedule";
import { type Answer, BALLS_PER_INNINGS, type Question, type Schedule } from "../src/engine/types";
import { validateContent, validateQuestion, verificationKey } from "../src/engine/validate";

const DATA = "src/data";
const POOL = join(DATA, "questions");
const SCHEDULE = join(DATA, "schedule.json");
const REPORTS = "content-reports";
// Wikimedia asks automated clients to identify themselves; keep it generic.
const HEADERS = {
  "User-Agent": "StumpedContentTool/0.1 (cricket quiz content checks)",
  "Api-User-Agent": "StumpedContentTool/0.1",
};
const API = "https://en.wikipedia.org/w/api.php";
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

let lastRequest = 0;

/** One request at a time, spaced out, honouring Retry-After: Wikimedia rate-limits bursts. */
async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const wait = lastRequest + 600 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 6) throw new Error(`${res.status} for ${url}`);
    const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return (await res.json()) as T;
}

const titleFromUrl = (url: string) =>
  decodeURIComponent(
    url.replace(/^https:\/\/en\.wikipedia\.org\/wiki\//, "").split("#")[0] ?? "",
  ).replace(/_/g, " ");

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
  const params = new URLSearchParams({
    action: "parse",
    page: titleFromUrl(url),
    prop: "text|links",
    format: "json",
    formatversion: "2",
    redirects: "1",
  });
  const data = await getJson<{
    parse?: { text: string; links: { title: string }[] };
    error?: { info: string };
  }>(`${API}?${params}`);
  if (!data.parse) throw new Error(`Source ${url}: ${data.error?.info ?? "not found"}`);
  const plain = data.parse.text.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  const articleLinks = data.parse.links.map((l) => l.title).filter((t) => !t.includes(":"));
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
  console.log(`Imported ${questions.length} questions into ${out}. Add tags, then verify.`);
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

function report() {
  for (const { q } of selected()) {
    console.log(`\n${q.id}: ${q.prompt}`);
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
  current.days.push(...days.map((d) => d.map((q) => q.id)));
  writeJson(SCHEDULE, current);
  days.forEach((d, i) => {
    console.log(`Day ${current.days.length - days.length + i + 1}:`);
    for (const q of d)
      console.log(`  ${q.answerType.padEnd(10)} [${q.tags.join(", ")}] ${q.prompt}`);
  });
}

const command = process.argv[2];
const run: Record<string, () => unknown> = {
  import: () => importDays(process.argv[3] ?? ""),
  verify,
  rank,
  report,
  spellings,
  schedule,
};
const fn = command ? run[command] : undefined;
if (!fn) {
  console.log(
    "Usage: tsx tools/content.ts <import FILE|verify [ids]|rank [ids]|report [ids]|spellings [ids]|schedule [--days=N]>",
  );
  process.exitCode = 1;
} else {
  await fn();
}
