import { describe, expect, it } from "vitest";
import { pickQuote, QUOTES } from "../../src/ui/quotes";

describe("home screen quotes", () => {
  it("has 30 different quotes, each with someone to blame", () => {
    expect(new Set(QUOTES.map(([q]) => q)).size).toBe(30);
    for (const [quote, by] of QUOTES) expect(quote && by).toBeTruthy();
  });

  it("picks from the whole list", () => {
    expect(pickQuote(() => 0)).toBe(QUOTES[0]);
    expect(pickQuote(() => 0.9999)).toBe(QUOTES[QUOTES.length - 1]);
  });
});
