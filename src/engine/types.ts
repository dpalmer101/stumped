export const TIERS = ["ootg", "six", "four", "two", "single"] as const;
export type Tier = (typeof TIERS)[number];

export const RUNS: Record<Tier, number> = {
  ootg: 12,
  six: 6,
  four: 4,
  two: 2,
  single: 1,
};

export const TIER_LABEL: Record<Tier, string> = {
  ootg: "Out of the ground",
  six: "Six",
  four: "Four",
  two: "Two",
  single: "Single",
};

export type AnswerType =
  | "player"
  | "country"
  | "county"
  | "team"
  | "tournament"
  | "position"
  | "ground"
  | "other";

/** Tags the scheduler uses to mix each day (see docs/CONTENT.md). */
export const TAGS = [
  "men",
  "women",
  "test",
  "odi",
  "t20",
  "franchise",
  "domestic",
  "international",
  "general",
  "england",
  "india",
  "australia",
  "new-zealand",
  "south-africa",
  "west-indies",
  "pakistan",
  "sri-lanka",
] as const;
export type Tag = (typeof TAGS)[number];

export interface Metric {
  label: string;
  rarerWhen: "lower" | "higher";
}

export interface Answer {
  name: string;
  tier: Tier;
  /** Other correct names: nicknames, old names, sponsor names, abbreviations. */
  aliases?: string[];
  /** Common wrong spellings to accept that typo tolerance doesn't already catch. */
  misspellings?: string[];
  /** Wikipedia article title, when the name alone doesn't find the right one. */
  wiki?: string;
  /** One value per question metric, in the same order. */
  values?: number[];
  /** Wikipedia page views over the last 12 months (set by `npm run content:rank`). */
  views?: number;
  /** Mentions across the source pages, used instead of views when answers share an article. */
  mentions?: number;
  /** Set by `npm run content:verify`; never by hand. */
  verified?: { wiki: string; date: string; key: string };
  /** Manual tier with a reason, when the computed one is clearly wrong. */
  override?: { tier: Tier; reason: string };
}

/** What the game needs to play a question; the day files ship only this. */
export type PlayableQuestion = Pick<
  Question,
  "id" | "prompt" | "category" | "answerType" | "answers"
>;

export interface Question {
  id: string;
  prompt: string;
  category: string;
  answerType: AnswerType;
  tags: Tag[];
  /** English Wikipedia pages that list the answers. */
  sources: string[];
  /** Only when the prompt can't be bounded in time (ISO date). */
  asOf?: string;
  /** How general obscurity is measured; "mentions" when answers share one Wikipedia article. */
  popularity?: "views" | "mentions";
  /** Question-specific rarity signals, e.g. caps or number of wins. */
  metrics?: Metric[];
  /** Share of the rarity score from metrics (0–1); defaults to 0.5 with metrics, 0 without. */
  specificWeight?: number;
  answers: Answer[];
}

export interface Schedule {
  /** Local date of puzzle #1, YYYY-MM-DD. */
  launchDate: string;
  /** Each entry is one day's question ids (one over), in ball order. */
  days: string[][];
}

/** One over. */
export const BALLS_PER_INNINGS = 6;
export const BALL_MS = 20_000;
export const MIN_ANSWERS = 20;
