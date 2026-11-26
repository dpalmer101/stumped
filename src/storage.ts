import type { Ball, BallResult } from "./engine/ball";
import { BANDS } from "./engine/delivery";
import type { Innings } from "./engine/innings";
import type { History, InningsRecord } from "./engine/stats";
import { BALLS_PER_INNINGS, RUNS, TIERS, type Tier } from "./engine/types";

export const STORAGE_KEY = "stumped";
const VERSION = 1;

export const THEME_KEYS = ["hundred", "village", "test", "oneday"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export interface Saved {
  version: typeof VERSION;
  theme: ThemeKey;
  muted: boolean;
  /** The one-time how-to-play sheet has been dismissed. */
  seenHelp: boolean;
  /** Anonymous play events already sent (e.g. "finished-3"), so none is counted twice. */
  counted: string[];
  innings: Innings | null;
  history: History;
  /** The latest archive innings, so one can be resumed. `counts`: it's that day's first play. */
  archive: ArchivePlay | null;
}

export interface ArchivePlay {
  innings: Innings;
  counts: boolean;
}

export function defaults(): Saved {
  return {
    version: VERSION,
    theme: "hundred",
    muted: false,
    seenHelp: false,
    counted: [],
    innings: null,
    history: {},
    archive: null,
  };
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

// Only the times a delivery can give, so an edited save can't make a ball last for ever.
const BALL_TIMES = new Set<number>(BANDS.map((b) => b.ms));

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isTier = (v: unknown): v is Tier => (TIERS as readonly unknown[]).includes(v);

function isResult(r: unknown): r is BallResult {
  const v = r as BallResult;
  if (!v || typeof v !== "object") return false;
  if (v.kind === "out") return typeof v.dismissal === "string" && v.runs === 0;
  return (
    v.kind === "hit" &&
    typeof v.answer === "string" &&
    isTier(v.tier) &&
    v.runs === RUNS[v.tier] &&
    isNum(v.ms)
  );
}

function isBall(b: unknown, i: number): b is Ball {
  const v = b as Ball;
  return (
    !!v &&
    typeof v === "object" &&
    v.index === i &&
    isNum(v.puzzle) &&
    typeof v.questionId === "string" &&
    (v.timeMs === undefined || BALL_TIMES.has(v.timeMs)) &&
    (v.startedAt === undefined || isNum(v.startedAt)) &&
    Array.isArray(v.misses) &&
    v.misses.every((m) => typeof m === "string") &&
    (v.result === undefined || isResult(v.result))
  );
}

function isInnings(value: unknown): value is Innings {
  const v = value as Innings | null;
  return (
    !!v &&
    isNum(v.puzzle) &&
    Array.isArray(v.balls) &&
    v.balls.length === BALLS_PER_INNINGS &&
    v.balls.every(isBall)
  );
}

function cleanHistory(value: unknown): History {
  if (!value || typeof value !== "object") return {};
  const out: History = {};
  for (const [k, r] of Object.entries(value as Record<string, InningsRecord>)) {
    const ok =
      /^\d+$/.test(k) &&
      !!r &&
      isNum(r.runs) &&
      isNum(r.wickets) &&
      Array.isArray(r.balls) &&
      r.balls.every((b) => b === "out" || isTier(b));
    if (!ok) continue;
    const { archive, ...record } = r;
    out[k] = archive === true ? { ...record, archive } : record;
  }
  return out;
}

/** Never throws: missing, corrupt or old-version data falls back to defaults. */
export function load(store: KeyValueStore | undefined): Saved {
  const base = defaults();
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<Saved>;
    if (data?.version !== VERSION) return base;
    return {
      version: VERSION,
      theme: THEME_KEYS.includes(data.theme as ThemeKey) ? (data.theme as ThemeKey) : base.theme,
      muted: data.muted === true,
      seenHelp: data.seenHelp === true,
      // Only recent ones matter; cap the list so it can't grow without limit.
      counted: Array.isArray(data.counted)
        ? data.counted.filter((c): c is string => typeof c === "string").slice(-60)
        : [],
      innings: isInnings(data.innings) ? data.innings : null,
      history: cleanHistory(data.history),
      archive:
        data.archive && isInnings(data.archive.innings) && typeof data.archive.counts === "boolean"
          ? { innings: data.archive.innings, counts: data.archive.counts }
          : null,
    };
  } catch {
    return base;
  }
}

/** Storage can be full or blocked (private mode); the game still works without it. */
export function save(store: KeyValueStore | undefined, saved: Saved): boolean {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(saved));
    return !!store;
  } catch {
    return false;
  }
}

/** The stored string as-is (null if missing or unreadable), to tell whether anything changed. */
export function readRaw(store: KeyValueStore | undefined): string | null {
  try {
    return store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function browserStore(): KeyValueStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
