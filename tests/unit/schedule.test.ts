import { describe, expect, it } from "vitest";
import { difficulty } from "../../src/engine/rarity";
import { allocate, dayProblems } from "../../src/engine/schedule";
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

  it("fails clearly when the pool can't make varied days", () => {
    const samey = Array.from({ length: 6 }, (_, i) => ({
      ...q(`s${i}`, 0, ["men"]),
      category: "same",
    }));
    expect(() => allocate(samey, 1)).toThrow(/only got 1 questions/);
  });
});
