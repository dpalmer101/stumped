import { describe, expect, it } from "vitest";
import {
  buildDays,
  latestStartedPuzzle,
  lockDays,
  lockProblems,
  oldestLivePuzzle,
  playable,
} from "../../src/engine/locks";
import type { PlayableQuestion } from "../../src/engine/types";
import { groundsQuestion, playersQuestion } from "./fixtures";

const LAUNCH = "2026-11-24";
const g = playable(groundsQuestion);
const p = playable(playersQuestion);
// Three days, each distinguishable.
const days = (): PlayableQuestion[][] => [[g], [p], [g, p]];
const locked = lockDays(LAUNCH, days());

describe("day timing", () => {
  it("a day counts as started an hour before UTC+14 reaches it", () => {
    // UTC+14 reaches 24 Nov at 10:00 UTC on the 23rd; the hour before covers deploy time.
    expect(latestStartedPuzzle(new Date("2026-11-23T08:59:00Z"), LAUNCH)).toBe(0);
    expect(latestStartedPuzzle(new Date("2026-11-23T09:00:00Z"), LAUNCH)).toBe(1);
  });

  it("a day stays live until UTC-12 finishes it", () => {
    // UTC-12 finishes 24 Nov at 12:00 UTC on the 25th.
    expect(oldestLivePuzzle(new Date("2026-11-25T11:59:00Z"), LAUNCH)).toBe(1);
    expect(oldestLivePuzzle(new Date("2026-11-25T12:00:00Z"), LAUNCH)).toBe(2);
  });
});

describe("locked days", () => {
  const now = new Date("2026-11-25T12:00:00Z"); // days 1-3 have started somewhere

  it("passes when nothing changed", () => {
    expect(lockProblems(locked, LAUNCH, days(), now)).toEqual([]);
  });

  it("allows new aliases and misspellings on a started day", () => {
    const d = days();
    const answers = g.answers.map((a, i) =>
      i === 0 ? { ...a, aliases: ["New"], misspellings: ["Bordaa"] } : a,
    );
    d[0] = [{ ...g, answers }];
    expect(lockProblems(locked, LAUNCH, d, now)).toEqual([]);
  });

  it("rejects a changed prompt, answer type, answer or tier on a started day", () => {
    for (const change of [
      (q: PlayableQuestion) => ({ ...q, answerType: "other" as const }),
      (q: PlayableQuestion) => ({ ...q, prompt: `${q.prompt}!` }),
      (q: PlayableQuestion) => ({ ...q, answers: q.answers.slice(1) }),
      (q: PlayableQuestion) => ({
        ...q,
        answers: q.answers.map((a, i) => (i === 0 ? { ...a, tier: "single" as const } : a)),
      }),
    ]) {
      const d = days();
      d[0] = [change(g)];
      expect(lockProblems(locked, LAUNCH, d, now)).toContain("day 1 has started and can't change");
    }
  });

  it("rejects reordering or removing started days", () => {
    expect(lockProblems(locked, LAUNCH, [[p], [g], [g, p]], now)).toContain(
      "day 1 has started and can't change",
    );
    expect(lockProblems(locked, LAUNCH, [[g]], now)).toContain(
      "day 2 has started and can't change",
    );
  });

  it("lets future days change", () => {
    const early = new Date("2026-11-23T12:00:00Z"); // only day 1 has started
    expect(lockProblems(locked, LAUNCH, [[g], [g], [p]], early)).toEqual([]);
  });

  it("rejects moving the launch date once launched", () => {
    expect(lockProblems(locked, "2026-12-01", days(), now)).toEqual([
      "launch date changed from 2026-11-24 after launch",
    ]);
  });

  it("rejects extending a wrapped schedule in a way that changes a live over", () => {
    // Over #5 is live; with 3 days it plays day 2, with 5 days it would play the new day 5.
    const wrapped = new Date("2026-11-28T12:00:00Z");
    const extended = [...days(), [p, g], [g, g]];
    expect(lockProblems(locked, LAUNCH, extended, wrapped).join()).toMatch(/is live/);
  });
});

describe("the real schedule", () => {
  it("builds every day from the pool", async () => {
    const { readDays } = await import("../../tools/days");
    const { pool, schedule } = readDays();
    expect(buildDays(pool, schedule)).toHaveLength(schedule.days.length);
  });

  it("every scheduled day is locked and matches its lock", async () => {
    // Run `npm run content:lock` after scheduling or editing a future day.
    const { readDays, readLocks } = await import("../../tools/days");
    const { pool, schedule } = readDays();
    expect(readLocks(schedule.launchDate)).toEqual(
      lockDays(schedule.launchDate, buildDays(pool, schedule)),
    );
  });
});

describe("checking against the live locks", () => {
  const asUrl = (locks: unknown) =>
    `data:application/json,${encodeURIComponent(JSON.stringify(locks))}`;

  it("passes when the live locks match", async () => {
    const { checkPushed, readLocks } = await import("../../tools/days");
    await expect(checkPushed(asUrl(readLocks(LAUNCH)))).resolves.toBeUndefined();
  });

  it("fails when a started day differs from what's live", async () => {
    const { checkPushed, readLocks } = await import("../../tools/days");
    const live = readLocks(LAUNCH);
    const changed = { ...live, days: ["00000000", ...live.days.slice(1)] };
    await expect(checkPushed(asUrl(changed), new Date("2026-11-24T12:00:00Z"))).rejects.toThrow(
      "day 1 has started",
    );
  });
});
