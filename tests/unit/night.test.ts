import { describe, expect, it } from "vitest";
import { isNight } from "../../src/engine/night";

describe("night", () => {
  it.each([
    [19, false],
    [20, true],
    [23, true],
    [0, true],
    [4, true],
    [5, false],
    [12, false],
  ])("%i:30 is night: %s", (hour, night) => {
    expect(isNight(new Date(2026, 5, 1, hour, 30))).toBe(night);
  });
});
