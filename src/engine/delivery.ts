import { BALL_MS } from "./types";

/** Deliveries by difficulty band; see docs/CONTENT.md, Deliveries. */
export const BANDS = [
  { min: 1, max: 3, ms: 15_000, deliveries: ["Fast ball"] },
  {
    min: 4,
    max: 5,
    ms: BALL_MS,
    deliveries: [
      "Good length",
      "Full toss",
      "Outswinger",
      "Inswinger",
      "Off cutter",
      "Leg cutter",
      "Off-break",
      "Leg-break",
    ],
  },
  {
    min: 6,
    max: 7,
    ms: BALL_MS,
    deliveries: [
      "Bouncer",
      "Yorker",
      "Reverse swing",
      "Knuckle ball",
      "Googly",
      "Doosra",
      "Flipper",
    ],
  },
  { min: 8, max: 10, ms: 25_000, deliveries: ["Slower ball"] },
] as const;

export type Band = (typeof BANDS)[number];
export type Delivery = Band["deliveries"][number];

export const DELIVERIES: readonly Delivery[] = BANDS.flatMap((b) => b.deliveries);

export const isDelivery = (name: unknown): name is Delivery =>
  (DELIVERIES as readonly unknown[]).includes(name);

/** The band a 1–10 difficulty falls in. */
export const bandFor = (score: number): Band =>
  BANDS.find((b) => score >= b.min && score <= b.max) ?? BANDS[1];

export const bandOf = (delivery: Delivery): Band =>
  BANDS.find((b) => (b.deliveries as readonly string[]).includes(delivery)) ?? BANDS[1];

/** How long a ball lasts. Without a delivery (an older day file) it's the standard time. */
export const deliveryMs = (delivery?: string): number =>
  isDelivery(delivery) ? bandOf(delivery).ms : BALL_MS;

/** What the player is told before a ball: the delivery and its time, never how hard it is. */
export function deliveryHint(delivery?: string): string {
  const seconds = `${deliveryMs(delivery) / 1000} seconds`;
  return isDelivery(delivery) ? `${delivery} · ${seconds}` : seconds;
}

/**
 * Deliveries for the questions that have none, in the order given: the band's least-used
 * delivery across the bank, avoiding one already bowled the same day. Set deliveries never change.
 */
export function assignDeliveries(
  questions: { id: string; delivery?: Delivery; score: number; day?: number }[],
): Map<string, Delivery> {
  const uses = new Map<Delivery, number>();
  const byDay = new Map<number, Set<Delivery>>();
  const note = (d: Delivery, day?: number) => {
    uses.set(d, (uses.get(d) ?? 0) + 1);
    if (day === undefined) return;
    const set = byDay.get(day) ?? new Set();
    byDay.set(day, set.add(d));
  };
  for (const q of questions) if (q.delivery) note(q.delivery, q.day);

  const picked = new Map<string, Delivery>();
  for (const q of questions) {
    if (q.delivery) continue;
    const options: readonly Delivery[] = bandFor(q.score).deliveries;
    const today = q.day === undefined ? undefined : byDay.get(q.day);
    const fresh = options.filter((d) => !today?.has(d));
    const pool = fresh.length ? fresh : options;
    const choice = pool.reduce((best, d) =>
      (uses.get(d) ?? 0) < (uses.get(best) ?? 0) ? d : best,
    );
    picked.set(q.id, choice);
    note(choice, q.day);
  }
  return picked;
}
