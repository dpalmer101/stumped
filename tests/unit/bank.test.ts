import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { puzzleNumber } from "../../src/engine/puzzle";
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

  it("every scheduled question is verified against Wikipedia and ranked", () => {
    // Only scheduled questions ship; pool questions still being verified or ranked don't block.
    const scheduled = new Set(schedule.days.flat());
    expect(questions.filter((q) => scheduled.has(q.id)).flatMap(validateContent)).toEqual([]);
  });

  it("covers today's puzzle", () => {
    expect(schedule.days.length).toBeGreaterThanOrEqual(
      puzzleNumber(new Date(), schedule.launchDate),
    );
  });
});
