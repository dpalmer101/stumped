import { describe, expect, it } from "vitest";
import { difficulty } from "../../src/engine/rarity";
import { allocate, dayProblems, scheduleProblems } from "../../src/engine/schedule";
import type { AnswerType, Question, Tag } from "../../src/engine/types";
import { groundsQuestion } from "./fixtures";

const TYPES: AnswerType[] = [
  "ground",
  "player",
  "team",
  "country",
  "county",
  "position",
  "tournament",
];

function q(id: string, i: number, tags: Tag[], fame = 1000): Question {
  return {
    ...groundsQuestion,
    id,
    category: `cat-${id}`,
    answerType: TYPES[i % TYPES.length] ?? "other",
    tags,
    answers: groundsQuestion.answers.map((a) => ({ ...a, views: fame })),
  };
}

describe("dayProblems", () => {
  const varied = TYPES.map((_, i) => q(`v${i}`, i, i === 0 ? ["women"] : ["men", "international"]));

  it("accepts a varied day", () => {
    expect(dayProblems(varied)).toEqual([]);
  });

  it("flags repeated categories, answer types and formats", () => {
    const day = varied.map((x, i) => ({
      ...x,
      category: i < 2 ? "same" : x.category,
      answerType: i < 3 ? ("player" as const) : x.answerType,
      tags: i < 4 ? (["men", "test"] as Tag[]) : x.tags,
    }));
    const problems = dayProblems(day).join("\n");
    expect(problems).toMatch(/share a category/);
    expect(problems).toMatch(/3 questions with player answers/);
    expect(problems).toMatch(/4 test questions/);
  });

  it("needs something beyond men's international cricket", () => {
    expect(
      dayProblems(varied.map((x) => ({ ...x, tags: ["men", "international"] as Tag[] }))),
    ).toContain("only men's international questions");
  });

  it("allows one question per country, counting questions that cover several", () => {
    const day = varied.map((x, i) => ({
      ...x,
      tags: [...x.tags, ...((i === 1 ? ["india"] : i === 2 ? ["india", "pakistan"] : []) as Tag[])],
    }));
    expect(dayProblems(day)).toEqual(["2 questions about india"]);
    // Days played before the rule keep their clashes.
    expect(dayProblems(day, { countryRule: false })).toEqual([]);
  });

  it("allows one women's cricket question, not counting ones open to men's answers too", () => {
    const tagged = (second: Tag[]) => varied.map((x, i) => (i === 1 ? { ...x, tags: second } : x));
    expect(dayProblems(tagged(["women", "odi"]))).toEqual(["2 women's cricket questions"]);
    expect(dayProblems(tagged(["men", "women", "odi"]))).toEqual([]);
    // Days 1–3 were played before the rule.
    expect(dayProblems(tagged(["women", "odi"]), { womenRule: false })).toEqual([]);
  });
});

describe("allocate", () => {
  // 12 questions: two broader ones, fame varying so difficulty varies.
  const pool = Array.from({ length: 12 }, (_, i) =>
    q(`p${i}`, i, i % 6 === 0 ? ["women", "odi"] : ["men", "international"], 10 ** (1 + (i % 5))),
  );

  it("fills days that pass the variety rules, using each question once", () => {
    const days = allocate(pool, 2);
    expect(days).toHaveLength(2);
    for (const day of days) {
      expect(day).toHaveLength(6);
      expect(dayProblems(day)).toEqual([]);
    }
    expect(new Set(days.flat().map((x) => x.id)).size).toBe(12);
  });

  it("orders each day from easiest to hardest", () => {
    for (const day of allocate(pool, 2)) {
      const d = day.map(difficulty);
      expect(d).toEqual([...d].sort((a, b) => a - b));
    }
  });

  it("puts the women's cricket questions on different days", () => {
    // pool has women's questions at 0 and 6; making 1 women's too leaves one day with two
    // unless the allocator spreads them.
    const tagged = pool.map((x, i) => (i === 1 ? { ...x, tags: ["women", "t20"] as Tag[] } : x));
    const more = [...tagged, q("extra", 1, ["men", "international"], 100)];
    for (const day of allocate(more, 2)) {
      expect(day.filter((x) => x.tags.includes("women")).length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps questions about the same country on different days", () => {
    const tagged = pool.map((x, i) => (i < 2 ? { ...x, tags: [...x.tags, "england" as Tag] } : x));
    for (const day of allocate(tagged, 2)) {
      expect(day.filter((x) => x.tags.includes("england"))).toHaveLength(1);
    }
  });

  it("fails clearly when the pool can't make varied days", () => {
    const samey = Array.from({ length: 6 }, (_, i) => ({
      ...q(`s${i}`, 0, ["men"]),
      category: "same",
    }));
    expect(() => allocate(samey, 1)).toThrow(/Couldn.t fill 1 varied day/);
  });
});

describe("variety beyond a single day", () => {
  const cat = (id: string, category: string, tags: Tag[] = ["men", "international"]) => ({
    ...q(id, Number(id.replace(/\D/g, "")) || 0, tags),
    category,
  });

  it("allows at most two general-knowledge questions a day", () => {
    const day = TYPES.map((_, i) => q(`g${i}`, i, i < 3 ? ["general"] : ["men", "international"]));
    expect(dayProblems(day)).toContain("3 general-knowledge questions");
  });

  it("flags a category on more than two days in any week", () => {
    const days = Array.from({ length: 7 }, (_, d) => [
      cat(`w${d}`, d % 3 === 0 ? "Grounds" : `C${d}`),
    ]);
    expect(scheduleProblems(days).join()).toMatch(/"Grounds" on 3 days/);
    const spaced = Array.from({ length: 9 }, (_, d) => [
      cat(`s${d}`, d === 0 || d === 8 ? "Grounds" : `C${d}`),
    ]);
    expect(scheduleProblems(spaced)).toEqual([]);
  });

  it("re-uses a question only after 30 days", () => {
    const days = Array.from({ length: 31 }, (_, d) => [
      cat(d === 0 || d === 29 ? "same" : `u${d}`, `C${d}`),
    ]);
    expect(scheduleProblems(days).join()).toMatch(/day 30 reuses same from day 1/);
    const later = Array.from({ length: 32 }, (_, d) => [
      cat(d === 0 || d === 30 ? "same" : `u${d}`, `C${d}`),
    ]);
    expect(scheduleProblems(later)).toEqual([]);
  });

  it("the allocator keeps the week rule against days already scheduled", () => {
    const history = [[cat("h1", "cat-p0")], [cat("h2", "cat-p0")]];
    const pool = Array.from({ length: 12 }, (_, i) =>
      q(`p${i}`, i, i % 6 === 0 ? ["women", "odi"] : ["men", "international"], 10 ** (1 + (i % 5))),
    );
    const days = allocate(pool, 1, history);
    expect(days[0]?.some((x) => x.category === "cat-p0")).toBe(false);
  });
});
