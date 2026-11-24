import { describe, expect, it } from "vitest";
import { puzzleNumber, questionIdsFor, scheduleHasWrapped } from "../../src/engine/puzzle";
import type { Schedule } from "../../src/engine/types";

describe("puzzleNumber", () => {
  it("is 1 on launch day, at any local time", () => {
    expect(puzzleNumber(new Date(2026, 11, 1, 0, 0, 1), "2026-12-01")).toBe(1);
    expect(puzzleNumber(new Date(2026, 11, 1, 23, 59, 59), "2026-12-01")).toBe(1);
  });

  it("changes at local midnight", () => {
    expect(puzzleNumber(new Date(2026, 11, 2, 0, 0, 0), "2026-12-01")).toBe(2);
  });

  it("counts calendar days across a daylight-saving change", () => {
    expect(puzzleNumber(new Date(2027, 3, 1, 12), "2027-03-01")).toBe(32);
  });
});

describe("questionIdsFor", () => {
  const day = (n: number) => Array.from({ length: 6 }, (_, i) => `d${n}q${i}`);
  const schedule: Schedule = { launchDate: "2026-12-01", days: [day(1), day(2), day(3)] };

  it("picks the scheduled day", () => {
    expect(questionIdsFor(2, schedule)).toEqual(day(2));
  });

  it("wraps round when the schedule runs out", () => {
    expect(questionIdsFor(4, schedule)).toEqual(day(1));
    expect(scheduleHasWrapped(4, schedule)).toBe(true);
    expect(scheduleHasWrapped(3, schedule)).toBe(false);
  });

  it("fails loudly on an empty schedule", () => {
    expect(() => questionIdsFor(1, { launchDate: "2026-12-01", days: [] })).toThrow();
  });
});
