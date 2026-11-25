/**
 * Draft a question's answers from its Wikipedia list pages, so writing one means trimming a list
 * rather than typing 20–60 names. See docs/CONTENT.md, Write.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalise } from "../src/engine/match";
import type { Answer, AnswerType, Question } from "../src/engine/types";
import { parsePage } from "./wiki";

export interface Link {
  /** Article title, or undefined for a red link (no article yet). */
  title?: string;
  text: string;
}

export interface Cell {
  html: string;
  header: boolean;
}

export interface Table {
  headers: string[];
  rows: Cell[][];
}

export interface Candidate {
  name: string;
  wiki?: string;
  value?: number;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  ndash: "–",
  mdash: "—",
};

export function cellText(html: string): string {
  return html
    .replace(/<sup[\s\S]*?<\/sup>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[†‡*§¶#^~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Article links in an HTML fragment, skipping flags, footnotes, files and other namespaces. */
export function links(html: string): Link[] {
  // Flag icons link with an image only, so the empty-text check drops them.
  const clean = html.replace(/<sup[\s\S]*?<\/sup>/g, "");
  const out: Link[] = [];
  for (const m of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = m[1] ?? "";
    const text = cellText(m[2] ?? "");
    const href = /href="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (!text) continue;
    const article = /^\/wiki\/([^#?]+)/.exec(href)?.[1];
    if (article) {
      const title = decodeURIComponent(article).replace(/_/g, " ");
      if (!title.includes(":")) out.push({ title, text });
    } else if (/redlink=1/.test(href)) {
      out.push({ text });
    }
  }
  return out;
}

/** The top-level element bodies for an opening tag, matched by depth so nested tables stay inside. */
function blocks(html: string, open: RegExp, tag: string): string[] {
  const out: string[] = [];
  const any = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
  let depth = 0;
  let start = -1;
  for (const m of html.matchAll(any)) {
    const closing = m[0].startsWith("</");
    if (!closing) {
      if (depth === 0 && open.test(m[0])) start = (m.index ?? 0) + m[0].length;
      if (depth > 0 || start >= 0) depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(html.slice(start, m.index));
        start = -1;
      }
    }
  }
  return out;
}

/** Every "wikitable" on the page, with rowspans and colspans laid out as a full grid. */
export function wikitables(html: string): Table[] {
  return blocks(html, /class="[^"]*\bwikitable\b/, "table").map((body) => {
    // Nested tables would confuse row splitting; their content isn't a list entry anyway.
    let flat = body;
    const innermost = /<table\b(?:(?!<table\b)[\s\S])*?<\/table>/;
    while (innermost.test(flat)) flat = flat.replace(innermost, "");
    const grid: Cell[][] = [];
    const pending = new Map<number, { cell: Cell; left: number }>();
    for (const row of flat.split(/<tr\b[^>]*>/).slice(1)) {
      const out: Cell[] = [];
      const fill = () => {
        for (let p = pending.get(out.length); p; p = pending.get(out.length)) {
          out.push(p.cell);
          p.left -= 1;
          if (p.left === 0) pending.delete(out.length - 1);
        }
      };
      for (const m of row.matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)(?=<t[hd]\b|<\/tr>|$)/g)) {
        fill();
        const attrs = m[2] ?? "";
        const cell = { html: (m[3] ?? "").replace(/<\/t[hd]>\s*$/, ""), header: m[1] === "th" };
        const colspan = Number(/colspan="?(\d+)/.exec(attrs)?.[1] ?? 1);
        const rowspan = Number(/rowspan="?(\d+)/.exec(attrs)?.[1] ?? 1);
        for (let i = 0; i < colspan; i++) {
          if (rowspan > 1) pending.set(out.length, { cell, left: rowspan - 1 });
          out.push(cell);
        }
      }
      fill();
      if (out.length) grid.push(out);
    }
    let headerRows = grid.filter((r) => r.every((c) => c.header));
    let rows = grid.filter((r) => !r.every((c) => c.header));
    // Some tables write the header row with <td>; a first row with no links is one.
    if (!headerRows.length && rows[0] && !rows[0].some((c) => links(c.html).length)) {
      headerRows = [rows[0]];
      rows = rows.slice(1);
    }
    // Stacked header rows ("Runs" over "Tests" and "ODIs") combine per column: "Runs Tests".
    const width = Math.max(0, ...headerRows.map((r) => r.length));
    const headers = Array.from({ length: width }, (_, c) =>
      [...new Set(headerRows.map((r) => (r[c] ? cellText(r[c].html) : "")).filter(Boolean))].join(
        " ",
      ),
    );
    return { headers, rows };
  });
}

const NAME_COLUMN =
  /\b(player|name|batter|batsman|bowler|cricketer|captain|team|club|side|ground|venue|stadium|country|nation|county|winners?|champions?)\b/i;

/** The column to take answers from: the one matching `wanted`, else the first name-like one. */
export function pickColumn(table: Table, wanted?: RegExp): number {
  if (wanted) return table.headers.findIndex((h) => wanted.test(h));
  const named = table.headers.findIndex((h) => NAME_COLUMN.test(h));
  if (named >= 0) return named;
  const width = Math.max(0, ...table.rows.map((r) => r.length));
  for (let c = 0; c < width; c++) {
    const linked = table.rows.filter((r) => r[c] && links(r[c]?.html ?? "").length).length;
    if (linked > table.rows.length / 2) return c;
  }
  return -1;
}

export function fromTables(
  html: string,
  opts: { column?: RegExp; value?: RegExp; tables?: number[] } = {},
): Candidate[] {
  const out: Candidate[] = [];
  wikitables(html).forEach((table, i) => {
    if (opts.tables && !opts.tables.includes(i + 1)) return;
    const col = pickColumn(table, opts.column);
    if (col < 0) return;
    const valueCol = opts.value ? table.headers.findIndex((h) => opts.value?.test(h)) : -1;
    for (const row of table.rows) {
      const cell = row[col];
      if (!cell) continue;
      const link = links(cell.html)[0];
      const name = link?.text ?? cellText(cell.html);
      if (!name) continue;
      const raw = valueCol >= 0 ? cellText(row[valueCol]?.html ?? "").replace(/,/g, "") : "";
      const num = /-?\d+(\.\d+)?/.exec(raw)?.[0];
      out.push({ name, wiki: link?.title, value: num === undefined ? undefined : Number(num) });
    }
  });
  return out;
}

const END_SECTIONS =
  /<h2[^>]*id="(See_also|References|Notes|Footnotes|External_links|Further_reading|Bibliography|Citations|Sources)"/;

/** The first link of each bulleted or numbered list item in the article body. */
export function fromLists(html: string): Candidate[] {
  const body = html.split(END_SECTIONS)[0] ?? html;
  const out: Candidate[] = [];
  // Each item's own text, up to its sub-list, so nested items count as entries of their own.
  for (const m of body.matchAll(/<li\b[^>]*>([\s\S]*?)(?=<li\b|<\/li>|<ul\b|<ol\b)/g)) {
    const link = links(m[1] ?? "")[0];
    if (link) out.push({ name: link.text, wiki: link.title });
  }
  return out;
}

/** One candidate per article (or per name for red links), first appearance wins. */
export function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = normalise(c.wiki ?? c.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Tiers come later, from content:rank. */
type DraftAnswer = Omit<Answer, "tier">;

export function toAnswers(candidates: Candidate[]): DraftAnswer[] {
  return candidates.map((c) => ({
    name: c.name,
    ...(c.wiki && c.wiki !== c.name ? { wiki: c.wiki } : {}),
    ...(c.value === undefined ? {} : { values: [c.value] }),
  }));
}

const flag = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/**
 * npm run content:draft -- <id> <url…> [--type=player] [--lists] [--column=Player]
 * [--value=Caps] [--tables=1,3]
 */
export async function draft() {
  const [id, ...urls] = process.argv.slice(3).filter((a) => !a.startsWith("--"));
  if (!id || !urls.length)
    throw new Error("Usage: content:draft -- <id> <wikipedia url…> [options]");
  const column = flag("column");
  const value = flag("value");
  const tables = flag("tables")?.split(",").map(Number);
  if (tables?.some((t) => !Number.isInteger(t) || t < 1)) {
    throw new Error("--tables takes table numbers separated by commas, e.g. --tables=1,3");
  }
  const candidates: Candidate[] = [];
  for (const url of urls) {
    const { html } = await parsePage(url);
    if (process.argv.includes("--lists")) {
      candidates.push(...fromLists(html));
    } else {
      // Headers let the author pick --tables and --column.
      for (const [i, t] of wikitables(html).entries()) {
        if (tables && !tables.includes(i + 1)) continue;
        const missing = [column, value].filter(
          (f) => f && !t.headers.some((h) => new RegExp(f, "i").test(h)),
        );
        const note = missing.length ? `  (no column matches ${missing.join(", ")})` : "";
        console.log(`  ${url.split("/").pop()} table ${i + 1}: ${t.headers.join(" | ")}${note}`);
      }
      candidates.push(
        ...fromTables(html, {
          column: column ? new RegExp(column, "i") : undefined,
          value: value ? new RegExp(value, "i") : undefined,
          tables,
        }),
      );
    }
  }
  const answers = toAnswers(dedupe(candidates));
  const withValues = answers.filter((a) => a.values).length;
  if (value && withValues < answers.length) {
    console.log(
      `! Only ${withValues}/${answers.length} answers got a "${value}" value; fill the rest by hand.`,
    );
  }
  const question: Omit<Question, "answers"> & { answers: DraftAnswer[] } = {
    id,
    prompt: "TODO",
    category: "TODO",
    answerType: (flag("type") ?? "player") as AnswerType,
    tags: [],
    sources: urls,
    ...(value && withValues ? { metrics: [{ label: value, rarerWhen: "lower" as const }] } : {}),
    answers,
  };
  mkdirSync("content-drafts", { recursive: true });
  const file = join("content-drafts", `${id}.json`);
  writeFileSync(file, `${JSON.stringify(question, null, 2)}\n`);
  console.log(`\n${answers.length} candidate answers written to ${file}:`);
  console.log(answers.map((a) => `  ${a.name}${a.wiki ? ` → ${a.wiki}` : ""}`).join("\n"));
  if (answers.length < 20 || answers.length > 60) {
    console.log(`\n! ${answers.length} answers: aim for 20–60 (narrow with --tables or --column).`);
  }
  console.log(
    "\nTrim it, write the prompt, category and tags, add aliases, then move it into a batch file.",
  );
}
