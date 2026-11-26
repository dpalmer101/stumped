import { describe, expect, it } from "vitest";
import { newInnings } from "../../src/engine/innings";
import { defaults, load, STORAGE_KEY, save } from "../../src/storage";

function memoryStore(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("storage", () => {
  it("round-trips saved state under one versioned key", () => {
    const store = memoryStore();
    const state = {
      ...defaults(),
      theme: "test" as const,
      muted: true,
      innings: newInnings(2, ["a", "b", "c", "d", "e", "f"]),
    };
    expect(save(store, state)).toBe(true);
    expect([...store.data.keys()]).toEqual([STORAGE_KEY]);
    expect(load(store)).toEqual(state);
  });

  it.each([
    ["missing", undefined],
    ["corrupt JSON", "{not json"],
    ["wrong version", JSON.stringify({ version: 99, theme: "test" })],
    ["null", "null"],
  ])("falls back to defaults when data is %s", (_label, raw) => {
    expect(load(memoryStore(raw))).toEqual(defaults());
  });

  it("drops invalid fields but keeps valid ones", () => {
    const raw = JSON.stringify({
      version: 1,
      theme: "neon",
      muted: "yes",
      innings: { puzzle: 1 },
      history: { 1: { runs: 5, wickets: 0, balls: [] } },
    });
    const loaded = load(memoryStore(raw));
    expect(loaded.theme).toBe("hundred");
    expect(loaded.muted).toBe(false);
    expect(loaded.innings).toBeNull();
    expect(loaded.history[1]?.runs).toBe(5);
  });

  it("keeps the seen news ids, and treats an older save as having seen none", () => {
    const raw = (extra: object) => JSON.stringify({ version: 1, seenHelp: true, ...extra });
    expect(load(memoryStore(raw({ seenNews: ["deliveries", 3] }))).seenNews).toEqual([
      "deliveries",
    ]);
    expect(load(memoryStore(raw({}))).seenNews).toEqual([]);
    expect(load(memoryStore(raw({ seenNews: "deliveries" }))).seenNews).toEqual([]);
  });

  it("survives a store that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(load(broken)).toEqual(defaults());
    expect(save(broken, defaults())).toBe(false);
  });
});

describe("tampered or corrupt saves", () => {
  const ball = (i: number, extra: object = {}) => ({
    puzzle: 1,
    index: i,
    questionId: `q${i}`,
    misses: [],
    ...extra,
  });
  const innings = (balls: unknown[]) =>
    JSON.stringify({ version: 1, innings: { puzzle: 1, balls } });

  it("drops an innings with a broken ball", () => {
    for (const bad of [
      null,
      { ...ball(3), misses: [1] },
      { ...ball(3), startedAt: "now" },
      { ...ball(3), timeMs: "long" },
      { ...ball(3), timeMs: 1e9 },
      { ...ball(3), timeMs: 0 },
      ball(9),
    ]) {
      const balls = Array.from({ length: 6 }, (_, i) => (i === 3 ? bad : ball(i)));
      expect(load(memoryStore(innings(balls))).innings).toBeNull();
    }
  });

  it("drops results that could inject markup or fake runs", () => {
    const evil = {
      kind: "hit",
      answer: "x",
      tier: "six",
      runs: "<img src=x onerror=alert(1)>",
      ms: 1,
    };
    const balls = Array.from({ length: 6 }, (_, i) => ball(i, i === 0 ? { result: evil } : {}));
    expect(load(memoryStore(innings(balls))).innings).toBeNull();
    const fake = { kind: "hit", answer: "x", tier: "six", runs: 99, ms: 1 };
    const balls2 = Array.from({ length: 6 }, (_, i) => ball(i, i === 0 ? { result: fake } : {}));
    expect(load(memoryStore(innings(balls2))).innings).toBeNull();
  });

  it("keeps a valid innings", () => {
    const ok = { kind: "hit", answer: "Lord's", tier: "single", runs: 1, ms: 500 };
    const balls = Array.from({ length: 6 }, (_, i) =>
      ball(i, i === 0 ? { startedAt: 5, result: ok } : {}),
    );
    expect(load(memoryStore(innings(balls))).innings?.balls[0]?.result).toEqual(ok);
    const timed = Array.from({ length: 6 }, (_, i) => ball(i, { timeMs: 15_000 }));
    expect(load(memoryStore(innings(timed))).innings?.balls[0]?.timeMs).toBe(15_000);
  });

  it("drops broken history records but keeps good ones", () => {
    const raw = JSON.stringify({
      version: 1,
      history: {
        1: { runs: 4, wickets: 0, balls: ["four"] },
        2: null,
        3: { runs: "x" },
        abc: { runs: 1, wickets: 0, balls: [] },
      },
    });
    expect(load(memoryStore(raw)).history).toEqual({ 1: { runs: 4, wickets: 0, balls: ["four"] } });
  });

  it("keeps the archive flag only when it is exactly true", () => {
    const raw = JSON.stringify({
      version: 1,
      history: {
        1: { runs: 4, wickets: 0, balls: [], archive: true },
        2: { runs: 4, wickets: 0, balls: [], archive: "yes" },
      },
    });
    expect(load(memoryStore(raw)).history).toEqual({
      1: { runs: 4, wickets: 0, balls: [], archive: true },
      2: { runs: 4, wickets: 0, balls: [] },
    });
  });

  it("keeps a valid archive play and drops a broken one", () => {
    const balls = Array.from({ length: 6 }, (_, i) => ball(i));
    const inn = JSON.parse(innings(balls)).innings;
    const withArchive = (archive: unknown) => memoryStore(JSON.stringify({ version: 1, archive }));
    expect(load(withArchive({ innings: inn, counts: true })).archive).toEqual({
      innings: inn,
      counts: true,
    });
    expect(load(withArchive({ innings: inn })).archive).toBeNull();
    expect(load(withArchive({ innings: { puzzle: 1 }, counts: false })).archive).toBeNull();
  });
});

describe("counted events in the save", () => {
  it("keeps strings only and caps the list", () => {
    const counted = [1, null, ...Array.from({ length: 80 }, (_, i) => `started-${i}`)];
    const loaded = load(memoryStore(JSON.stringify({ version: 1, counted })));
    expect(loaded.counted).toHaveLength(60);
    expect(loaded.counted.every((c) => typeof c === "string")).toBe(true);
    expect(load(memoryStore(JSON.stringify({ version: 1, counted: "nope" }))).counted).toEqual([]);
  });
});
