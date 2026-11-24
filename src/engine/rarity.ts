import { type Answer, type Question, TIERS, type Tier } from "./types";

/** Rank-based percentile in [0, 1]; ties share their average rank. */
export function percentiles(values: number[]): number[] {
  if (values.length <= 1) return values.map(() => 0.5);
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]?.v === order[start]?.v) end++;
    const rank = (start + end) / 2 / (values.length - 1);
    for (let k = start; k <= end; k++) out[order[k]?.i ?? 0] = rank;
    start = end + 1;
  }
  return out;
}

export interface RarityRow {
  name: string;
  general: number;
  specific: number | null;
  score: number;
}

/** 0 = most common answer, 1 = rarest. Needs `views` on every answer. */
export function rarityScores(q: Question): RarityRow[] {
  const general = percentiles(q.answers.map(popularity(q))).map((p) => 1 - p);
  const metrics = q.metrics ?? [];
  const perMetric = metrics.map((m, i) => {
    const p = percentiles(q.answers.map((a) => a.values?.[i] ?? 0));
    return m.rarerWhen === "higher" ? p : p.map((x) => 1 - x);
  });
  const w = metrics.length ? (q.specificWeight ?? 0.5) : 0;
  return q.answers.map((a, i) => {
    const specific = perMetric.length
      ? perMetric.reduce((sum, p) => sum + (p[i] ?? 0), 0) / perMetric.length
      : null;
    const g = general[i] ?? 0;
    return { name: a.name, general: g, specific, score: (1 - w) * g + w * (specific ?? 0) };
  });
}

/** How well known an answer is in its own right: page views, or source mentions for shared articles. */
export const popularity = (q: Question) => (a: Answer) =>
  Math.log10(1 + ((q.popularity === "mentions" ? a.mentions : a.views) ?? 0));

export function tierCounts(n: number): Record<Tier, number> {
  const six = Math.max(2, Math.round(n * 0.18));
  const four = Math.max(2, Math.round(n * 0.25));
  const two = Math.max(2, Math.round(n * 0.27));
  return { ootg: 1, six, four, two, single: n - 1 - six - four - two };
}

/** Computed tier for each answer name. Overridden answers keep their tier and give up their slot. */
export function computeTiers(q: Question): Map<string, Tier> {
  const overridden = new Map(
    q.answers.filter((a) => a.override).map((a) => [a.name, a.override?.tier as Tier]),
  );
  const rows = rarityScores(q)
    .filter((r) => !overridden.has(r.name))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const counts = tierCounts(q.answers.length);
  for (const tier of overridden.values()) counts[tier] = Math.max(0, counts[tier] - 1);
  const tiers = new Map<string, Tier>(overridden);
  let i = 0;
  for (const tier of TIERS) {
    for (let k = 0; k < counts[tier]; k++) {
      const row = rows[i++];
      if (row) tiers.set(row.name, tier);
    }
  }
  // Any rows left over (more overrides than a tier could absorb) count as singles.
  for (; i < rows.length; i++) tiers.set(rows[i]?.name ?? "", "single");
  return tiers;
}

/** Higher = harder: how little-known the question's best-known answers are. */
export function difficulty(q: Question): number {
  const known = q.answers.map(popularity(q)).sort((a, b) => b - a);
  return -(known[4] ?? known[known.length - 1] ?? 0);
}
