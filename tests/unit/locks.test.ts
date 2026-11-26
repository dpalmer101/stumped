import { describe, expect, it } from "vitest";
import {
  appendDays,
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

  it("accepts a recorded change to a started day, and only that change", () => {
    const changed = days();
    changed[1] = [g];
    const to = lockDays(LAUNCH, changed).days[1] ?? "";
    const relock = { day: 2, from: locked.days[1] ?? "", to, reason: "test" };
    expect(lockProblems(locked, LAUNCH, changed, now, undefined, [relock])).toEqual([]);
    const other = days();
    other[1] = [g, g];
    expect(lockProblems(locked, LAUNCH, other, now, undefined, [relock]).join()).toMatch(
      /day 2 has started/,
    );
    expect(
      lockProblems(locked, LAUNCH, changed, now, undefined, [{ ...relock, day: 1 }]).join(),
    ).toMatch(/day 2 has started/);
    expect(
      lockProblems(locked, LAUNCH, changed, now, undefined, [
        { ...relock, from: "deadbeef" },
      ]).join(),
    ).toMatch(/day 2 has started/);
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

describe("adding days", () => {
  const ids = (n: number) => [`q${n}`];
  const three = { launchDate: LAUNCH, days: [ids(1), ids(2), ids(3)] };

  it("just appends before the schedule has looped", () => {
    const now = new Date("2026-11-24T12:00:00Z"); // overs 1-2 started
    expect(appendDays(three, [ids(4)], now)).toEqual({ ...three, days: [...three.days, ids(4)] });
  });

  it("after a loop, plays the new days next and leaves started overs alone", () => {
    // 28 Nov 12:00 UTC: overs up to #6 have started (#4-#6 repeat days 1-3).
    const now = new Date("2026-11-28T12:00:00Z");
    const extended = appendDays(three, [ids(4), ids(5)], now);
    expect(extended.segments).toEqual([
      { from: 1, start: 0, size: 3 },
      { from: 7, start: 3, size: 5 },
    ]);
    const locked = lockDays(LAUNCH, asDays(three));
    expect(lockProblems(locked, LAUNCH, asDays(extended), now, extended.segments)).toEqual([]);
    // Without the segment the same append would change a live over.
    const naive = { ...three, days: [...three.days, ids(4), ids(5)] };
    expect(lockProblems(locked, LAUNCH, asDays(naive), now).join()).toMatch(/is live/);
  });

  const asDays = (s: { days: string[][] }) =>
    s.days.map((d) => d.map((id) => ({ ...g, prompt: id })));

  it("keeps earlier segments when adding again later, and the locks hold", () => {
    const first = appendDays(three, [ids(4)], new Date("2026-11-28T12:00:00Z"));
    // 10 Dec 12:00 UTC: overs up to #18 have started; #18 is a repeat (day 2), so #19 plays day 5.
    const now = new Date("2026-12-10T12:00:00Z");
    const later = appendDays(first, [ids(5)], now);
    expect(later.segments).toEqual([...(first.segments ?? []), { from: 19, start: 4, size: 5 }]);
    const locked = lockDays(LAUNCH, asDays(first), first.segments);
    expect(lockProblems(locked, LAUNCH, asDays(later), now, later.segments)).toEqual([]);
  });

  it("keeps going in order when segments exist but haven't looped", () => {
    // Day 4 added on 28 Nov plays at #7; on 29 Nov (#7 started) add day 5: #8 plays it.
    const first = appendDays(three, [ids(4)], new Date("2026-11-28T12:00:00Z"));
    const later = appendDays(first, [ids(5)], new Date("2026-11-29T12:00:00Z"));
    expect(later.segments?.at(-1)).toEqual({ from: 8, start: 4, size: 5 });
  });

  it("adding no days changes nothing", () => {
    const first = appendDays(three, [ids(4)], new Date("2026-11-28T12:00:00Z"));
    expect(appendDays(first, [], new Date("2026-11-28T12:00:00Z"))).toBe(first);
  });

  it("days added after a loop can still be edited until they start", () => {
    const now = new Date("2026-11-28T12:00:00Z");
    const extended = appendDays(three, [ids(4), ids(5)], now);
    const locked = lockDays(LAUNCH, asDays(extended), extended.segments);
    const edited = { ...extended, days: [...extended.days.slice(0, 4), ["changed"]] };
    expect(lockProblems(locked, LAUNCH, asDays(edited), now, extended.segments)).toEqual([]);
  });

  it("refuses removed segments and days added by hand", () => {
    const now = new Date("2026-12-10T12:00:00Z");
    const extended = appendDays(three, [ids(4)], new Date("2026-11-28T12:00:00Z"));
    const locked = lockDays(LAUNCH, asDays(extended), extended.segments);
    expect(
      lockProblems(locked, LAUNCH, asDays(extended), now, extended.segments?.slice(1)).join(),
    ).toMatch(/segments/);
    const byHand = { ...extended, days: [...extended.days, ids(5)] };
    expect(lockProblems(locked, LAUNCH, asDays(byHand), now, byHand.segments).join()).toMatch(
      /without content:schedule/,
    );
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
      lockDays(schedule.launchDate, buildDays(pool, schedule), schedule.segments),
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
