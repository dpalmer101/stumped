import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Question, Schedule } from "../../src/engine/types";
import { validateBank, validateContent } from "../../src/engine/validate";

const questions = readdirSync("src/data/questions")
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(`src/data/questions/${f}`, "utf8")) as Question[]);
const schedule = JSON.parse(readFileSync("src/data/schedule.json", "utf8")) as Schedule;

describe("question bank", () => {
  it("passes every bank and variety rule", () => {
    expect(validateBank(questions, schedule)).toEqual([]);
  });

  it("every answer is verified against Wikipedia and ranked", () => {
    expect(questions.flatMap(validateContent)).toEqual([]);
  });

  it("covers at least the first week", () => {
    expect(schedule.days.length).toBeGreaterThanOrEqual(7);
  });
});
