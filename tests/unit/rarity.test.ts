import { describe, expect, it } from "vitest";
import { computeTiers, percentiles, rarityScores, tierCounts } from "../../src/engine/rarity";
import type { Answer, Question } from "../../src/engine/types";
import { validateContent, verificationKey } from "../../src/engine/validate";
import { groundsQuestion } from "./fixtures";

/** 20 verified answers; views fall as the index rises, so a19 is the least known. */
function question(extra: Partial<Question> = {}, values?: (i: number) => number[]): Question {
  const answers: Answer[] = Array.from({ length: 20 }, (_, i) => ({
    name: `a${i}`,
    tier: "single",
    views: 100_000 / (i + 1),
    ...(values ? { values: values(i) } : {}),
  }));
  const q: Question = { ...groundsQuestion, answers, ...extra };
  for (const a of q.answers)
    a.verified = { wiki: "x", date: "2026-11-24", key: verificationKey(q, a) };
  return q;
}

describe("percentiles", () => {
  it("ranks from 0 to 1 and shares ties", () => {
    expect(percentiles([10, 30, 20])).toEqual([0, 1, 0.5]);
    expect(percentiles([5, 5, 9])).toEqual([0.25, 0.25, 1]);
    expect(percentiles([7])).toEqual([0.5]);
  });
});

describe("tierCounts", () => {
  it("splits 20 answers with at least two in every tier", () => {
    expect(tierCounts(20)).toEqual({ ootg: 1, six: 4, four: 5, two: 5, single: 5 });
  });
  it("adds up for larger questions", () => {
    const c = tierCounts(47);
    expect(c.ootg + c.six + c.four + c.two + c.single).toBe(47);
    expect(c.single).toBeGreaterThanOrEqual(2);
  });
});

describe("rarity", () => {
  it("without metrics, the least-viewed answer is out of the ground", () => {
    const tiers = computeTiers(question());
    expect(tiers.get("a19")).toBe("ootg");
    expect(tiers.get("a0")).toBe("single");
  });

  it("question-specific metrics change the ranking", () => {
    // Caps: the most-viewed player only just qualified, so the metric pulls them up.
    const q = question(
      { metrics: [{ label: "Caps", rarerWhen: "lower" }], specificWeight: 1 },
      (i) => [i === 0 ? 50 : 60 + i],
    );
    expect(computeTiers(q).get("a0")).toBe("ootg");
  });

  it("blends general and specific obscurity", () => {
    const q = question({ metrics: [{ label: "Wins", rarerWhen: "lower" }] }, (i) => [20 - i]);
    const rows = rarityScores(q);
    expect(rows[19]?.score).toBeCloseTo(1);
    expect(rows[0]?.score).toBeCloseTo(0);
    expect(rows[10]?.specific).toBeCloseTo(rows[10]?.general ?? 0);
  });

  it("an override wins over the computed tier", () => {
    const q = question();
    q.answers[19] = {
      ...(q.answers[19] as Answer),
      override: { tier: "single", reason: "Famous despite low views" },
    };
    expect(computeTiers(q).get("a19")).toBe("single");
  });
});

describe("validateContent", () => {
  it("flags unverified or unranked answers", () => {
    const q = question();
    q.answers[3] = { name: "a3", tier: "single" };
    const errors = validateContent(q).join("\n");
    expect(errors).toMatch(/"a3" is not verified/);
    expect(errors).toMatch(/"a3" has no views/);
  });

  it("flags tiers that don't match the ranking, and passes once ranked", () => {
    const q = question();
    expect(validateContent(q).join()).toMatch(/ranks as ootg/);
    const tiers = computeTiers(q);
    const ranked = {
      ...q,
      answers: q.answers.map((a) => ({ ...a, tier: tiers.get(a.name) ?? a.tier })),
    };
    expect(validateContent(ranked)).toEqual([]);
  });
});

describe("questions whose answers share one article", () => {
  it("rank by mentions in the sources instead of page views", () => {
    const q = question({ popularity: "mentions" });
    q.answers = q.answers.map((a, i) => ({ ...a, views: 500, mentions: 40 - i * 2 }));
    expect(computeTiers(q).get("a19")).toBe("ootg");
    expect(computeTiers(q).get("a0")).toBe("single");
  });

  it("need mentions, not views, once verified", () => {
    const q = question({ popularity: "mentions" });
    expect(validateContent(q).join()).toMatch(/has no mentions/);
  });
});

describe("overrides keep the tier rules", () => {
  it("overriding the rarest answer still leaves exactly one out of the ground", () => {
    const q = question();
    q.answers[19] = {
      ...(q.answers[19] as Answer),
      override: { tier: "single", reason: "Famous" },
    };
    const tiers = computeTiers(q);
    const counts: Record<string, number> = {};
    for (const t of tiers.values()) counts[t] = (counts[t] ?? 0) + 1;
    expect(counts).toEqual({ ootg: 1, six: 4, four: 5, two: 5, single: 5 });
    expect(tiers.get("a19")).toBe("single");
    expect(tiers.get("a18")).toBe("ootg");
  });
});

describe("verification stamps", () => {
  it("are invalidated when the answer or its sources change", () => {
    const q = question();
    const ranked = {
      ...q,
      answers: q.answers.map((a) => ({ ...a, tier: computeTiers(q).get(a.name) ?? a.tier })),
    };
    expect(validateContent(ranked)).toEqual([]);
    const renamed = {
      ...ranked,
      answers: ranked.answers.map((a, i) => (i === 0 ? { ...a, name: "Someone else" } : a)),
    };
    expect(validateContent(renamed).join()).toMatch(/changed since it was verified/);
    const resourced = { ...ranked, sources: ["https://en.wikipedia.org/wiki/Other"] };
    expect(validateContent(resourced).join()).toMatch(/changed since it was verified/);
  });
});
