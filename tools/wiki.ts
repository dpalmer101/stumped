/** Wikipedia and Wikimedia requests for the content tools: rate-limited per host and cached on disk. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Wikimedia asks automated clients to identify themselves; keep it generic.
const HEADERS = {
  "User-Agent": "StumpedContentTool/0.1 (cricket quiz content checks)",
  "Api-User-Agent": "StumpedContentTool/0.1",
};
export const API = "https://en.wikipedia.org/w/api.php";
const CACHE = ".cache/wikipedia";
const CACHE_DAYS = 7;
/** --fresh skips cached responses (and refreshes them). */
const fresh = process.argv.includes("--fresh");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Runs requests one at a time, started at least `gap` ms apart. */
class Queue {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private gap: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      await sleep(this.last + this.gap - Date.now());
      this.last = Date.now();
      return fn();
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}

// Both rate-limit bursts (page views allow about 7 before a 429), so one request at a time per
// host. Separate hosts keep verify and rank from slowing each other down.
const apiQueue = new Queue(600);
const pageViewsQueue = new Queue(600);

function cacheFile(url: string) {
  return join(CACHE, `${createHash("sha1").update(url).digest("hex")}.json`);
}

function readCache<T>(url: string): T | undefined {
  const file = cacheFile(url);
  if (fresh || !existsSync(file)) return undefined;
  try {
    const { fetched, data } = JSON.parse(readFileSync(file, "utf8")) as {
      fetched: number;
      data: T;
    };
    return Date.now() - fetched < CACHE_DAYS * 86_400_000 ? data : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(url: string, data: unknown) {
  mkdirSync(CACHE, { recursive: true });
  // Write then rename, so an interrupted run can't leave half a file behind.
  const file = cacheFile(url);
  writeFileSync(`${file}.tmp`, JSON.stringify({ url, fetched: Date.now(), data }));
  renameSync(`${file}.tmp`, file);
}

/** GET JSON, honouring Retry-After. Successful responses are cached for a week. */
export async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const cached = readCache<T>(url);
  if (cached !== undefined) return cached;
  const queue = new URL(url).hostname === "wikimedia.org" ? pageViewsQueue : apiQueue;
  const res = await queue.run(() => fetch(url, { headers: HEADERS }));
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 6) throw new Error(`${res.status} for ${url}`);
    await sleep((Number(res.headers.get("retry-after")) || 2 ** attempt) * 1000);
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const data = (await res.json()) as T;
  // The action API reports "no such page" with a 200; don't remember that for a week.
  if (!(data && typeof data === "object" && "error" in data)) writeCache(url, data);
  return data;
}

export const titleFromUrl = (url: string) =>
  decodeURIComponent(
    url.replace(/^https:\/\/en\.wikipedia\.org\/wiki\//, "").split("#")[0] ?? "",
  ).replace(/_/g, " ");

/** A page's rendered HTML and the article titles it links to. */
export async function parsePage(url: string): Promise<{ html: string; links: string[] }> {
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
  return { html: data.parse.text, links: data.parse.links.map((l) => l.title) };
}
