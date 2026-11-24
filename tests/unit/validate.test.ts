import { describe, expect, it } from "vitest";
import type { Question } from "../../src/engine/types";
import { validateBank, validateQuestion } from "../../src/engine/validate";
import { groundsQuestion, variedQuestion } from "./fixtures";

const ids = (prefix: string) => Array.from({ length: 6 }, (_, i) => `${prefix}${i}`);
const withId = (id: string): Question => variedQuestion(id, Number(id.slice(1)));

describe("validateQuestion", () => {
  it("accepts a well-formed question", () => {
    expect(validateQuestion(groundsQuestion)).toEqual([]);
  });

  it("needs at least 20 answers", () => {
    const q = { ...groundsQuestion, answers: groundsQuestion.answers.slice(0, 19) };
    expect(validateQuestion(q).join()).toMatch(/needs 20/);
  });

  it("needs exactly one out-of-the-ground answer", () => {
    const answers = groundsQuestion.answers.map((a) =>
      a.name === "Sabina Park" ? { ...a, tier: "ootg" as const } : a,
    );
    expect(validateQuestion({ ...groundsQuestion, answers }).join()).toMatch(/exactly 1 ootg/);
  });

  it("needs at least two of each other tier", () => {
    const answers = groundsQuestion.answers.map((a) =>
      a.tier === "six" && a.name !== "Hagley Oval" ? { ...a, tier: "four" as const } : a,
    );
    expect(validateQuestion({ ...groundsQuestion, answers }).join()).toMatch(/at least 2 six/);
  });

  it("rejects answers that collide after normalisation", () => {
    const answers = [...groundsQuestion.answers, { name: "Lords", tier: "single" as const }];
    expect(validateQuestion({ ...groundsQuestion, answers }).join()).toMatch(/share key "lords"/);
  });

  it("requires Wikipedia sources, known tags and a valid asOf", () => {
    const errors = validateQuestion({
      ...groundsQuestion,
      sources: ["https://example.com/grounds"],
      tags: ["cricket" as never],
      asOf: "Nov 2026",
    }).join();
    expect(errors).toMatch(/not an English Wikipedia article/);
    expect(errors).toMatch(/unknown tag cricket/);
    expect(errors).toMatch(/asOf/);
    expect(validateQuestion({ ...groundsQuestion, sources: [] }).join()).toMatch(
      /Wikipedia source/,
    );
  });

  it("needs a value per metric and a reason for overrides", () => {
    const answers = groundsQuestion.answers.map((a, i) =>
      i === 0 ? { ...a, override: { tier: "six" as const, reason: " " } } : { ...a, values: [i] },
    );
    const errors = validateQuestion({
      ...groundsQuestion,
      metrics: [{ label: "Tests hosted", rarerWhen: "lower" }],
      answers,
    }).join();
    expect(errors).toMatch(/"Bourda" needs 1 metric value/);
    expect(errors).toMatch(/override needs a reason/);
  });
});

describe("validateBank", () => {
  const bank = [...ids("a"), ...ids("b")].map(withId);

  it("accepts a valid schedule", () => {
    expect(validateBank(bank, { launchDate: "2026-12-01", days: [ids("a"), ids("b")] })).toEqual(
      [],
    );
  });

  it("flags unknown, repeated and reused questions", () => {
    const errors = validateBank(bank, {
      launchDate: "2026-12-01",
      days: [ids("a"), ["a0", "a0", "b1", "b2", "b3", "zz"]],
    }).join("\n");
    expect(errors).toMatch(/day 2 repeats a question/);
    expect(errors).toMatch(/unknown question zz/);
    expect(errors).toMatch(/reuses a0 from day 1 \(needs 30 days\)/);
  });

  it("flags days without 6 questions and duplicate ids", () => {
    const errors = validateBank([...bank, withId("a0")], {
      launchDate: "2026-12-01",
      days: [ids("a").slice(0, 5)],
    }).join("\n");
    expect(errors).toMatch(/day 1 has 5 questions/);
    expect(errors).toMatch(/duplicate question id a0/);
  });
});
