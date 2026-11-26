import { describe, expect, it } from "vitest";
import { isNight } from "../../src/engine/night";

const at = (hour: number, minute = 0) => new Date(2026, 5, 1, hour, minute);

describe("night", () => {
  it.each([
    [20, 59, false],
    [21, 0, true],
    [23, 30, true],
    [0, 0, true],
    [4, 59, true],
    [5, 0, false],
    [12, 0, false],
  ])("%i:%i is night: %s", (hour, minute, night) => {
    expect(isNight(at(hour, minute))).toBe(night);
  });
});
