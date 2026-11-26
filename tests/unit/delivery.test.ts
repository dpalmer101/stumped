import { describe, expect, it } from "vitest";
import {
  assignDeliveries,
  BANDS,
  bandFor,
  DELIVERIES,
  type Delivery,
  deliveryHint,
  deliveryMs,
} from "../../src/engine/delivery";

describe("deliveries", () => {
  it("cover every difficulty from 1 to 10 in order, with no gaps", () => {
    expect(BANDS[0].min).toBe(1);
    expect(BANDS.at(-1)?.max).toBe(10);
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i]?.min).toBe((BANDS[i - 1]?.max ?? 0) + 1);
    }
  });

  it("give each delivery one name, in one band", () => {
    expect(new Set(DELIVERIES).size).toBe(DELIVERIES.length);
  });

  it("only change the time for a fast ball or a slower ball", () => {
    expect(deliveryMs("Fast ball")).toBe(15_000);
    expect(deliveryMs("Slower ball")).toBe(25_000);
    for (const d of DELIVERIES.filter((d) => d !== "Fast ball" && d !== "Slower ball")) {
      expect(deliveryMs(d)).toBe(20_000);
      expect(d.toLowerCase()).not.toMatch(/fast|slow/);
    }
  });

  it("give a ball with no delivery, from an older day file, the standard time", () => {
    expect(deliveryMs(undefined)).toBe(20_000);
    expect(deliveryMs("Bumper")).toBe(20_000);
  });

  it("tell the player the delivery and its time, not how hard the question is", () => {
    expect(deliveryHint("Fast ball")).toBe("Fast ball · 15 seconds");
    expect(deliveryHint("Outswinger")).toBe("Outswinger · 20 seconds");
    expect(deliveryHint("Googly")).toBe("Googly · 20 seconds");
    expect(deliveryHint("Slower ball")).toBe("Slower ball · 25 seconds");
    expect(deliveryHint(undefined)).toBe("20 seconds");
  });

  it("map difficulty to bands", () => {
    expect([1, 3, 4, 5, 6, 7, 8, 10].map((s) => bandFor(s).deliveries[0])).toEqual([
      "Fast ball",
      "Fast ball",
      "Good length",
      "Good length",
      "Bouncer",
      "Bouncer",
      "Slower ball",
      "Slower ball",
    ]);
  });
});

describe("assignDeliveries", () => {
  it("picks from the band and never changes a set delivery", () => {
    const picked = assignDeliveries([
      { id: "set", delivery: "Googly", score: 2 },
      { id: "easy", score: 2 },
      { id: "hard", score: 9 },
      { id: "tricky", score: 6 },
    ]);
    expect(picked.has("set")).toBe(false);
    expect(picked.get("easy")).toBe("Fast ball");
    expect(picked.get("hard")).toBe("Slower ball");
    expect(BANDS[2].deliveries).toContain(picked.get("tricky"));
  });

  it("avoids repeating a delivery within a day and spreads them across the bank", () => {
    const day = Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, score: 4, day: 0 }));
    expect(new Set(assignDeliveries(day).values()).size).toBe(6);

    const many = Array.from({ length: 16 }, (_, i) => ({ id: `q${i}`, score: 5 }));
    const counts = new Map<Delivery, number>();
    for (const d of assignDeliveries(many).values()) counts.set(d, (counts.get(d) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });
});
