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

  it("follows segments added after the schedule looped back", () => {
    // Overs 1-3 played days 1-3, overs 4-5 repeated days 1-2, then days 4-5 were added.
    const extended: Schedule = {
      ...schedule,
      days: [day(1), day(2), day(3), day(4), day(5)],
      segments: [
        { from: 1, start: 0, size: 3 },
        { from: 6, start: 3, size: 5 },
      ],
    };
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => questionIdsFor(p, extended)[0])).toEqual([
      "d1q0",
      "d2q0",
      "d3q0",
      "d1q0",
      "d2q0",
      "d4q0",
      "d5q0",
      "d1q0",
      "d2q0",
    ]);
    expect(scheduleHasWrapped(6, extended)).toBe(false);
    expect(scheduleHasWrapped(8, extended)).toBe(true);
  });

  it("fails loudly on an empty schedule", () => {
    expect(() => questionIdsFor(1, { launchDate: "2026-12-01", days: [] })).toThrow();
  });
});
