import { describe, expect, it } from "vitest";
import { claimEvent, countingEnabled, countUrl, eventKey } from "../../src/analytics";

describe("anonymous play counts", () => {
  const live = { site: "stumped", hostname: "dpalmer101.github.io", doNotTrack: null };

  it("count only on the live site, with a site code, unless Do Not Track is on", () => {
    expect(countingEnabled(live)).toBe(true);
    expect(countingEnabled({ ...live, site: "" })).toBe(false);
    expect(countingEnabled({ ...live, hostname: "localhost" })).toBe(false);
    expect(countingEnabled({ ...live, hostname: "192.168.4.45" })).toBe(false);
    expect(countingEnabled({ ...live, doNotTrack: "1" })).toBe(false);
    // A fork published on someone else's GitHub Pages, or a lookalike host, doesn't count.
    expect(countingEnabled({ ...live, hostname: "someone.github.io" })).toBe(false);
    expect(countingEnabled({ ...live, hostname: "foogithub.io" })).toBe(false);
  });

  it("build GoatCounter's count URL with nothing personal in it", () => {
    const url = new URL(countUrl("stumped", "finished-over-3", "Finished over #3", true));
    expect(url.origin).toBe("https://stumped.goatcounter.com");
    expect(url.pathname).toBe("/count");
    expect(url.searchParams.get("p")).toBe("finished-over-3");
    expect(url.searchParams.get("e")).toBe("true");
    expect([...url.searchParams.keys()].sort()).toEqual(["e", "p", "rnd", "t"]);
    expect(new URL(countUrl("stumped", "/stumped/", "Stumped", false)).searchParams.has("e")).toBe(
      false,
    );
  });

  it("key events by name and puzzle", () => {
    expect(eventKey("started", 4)).toBe("started-4");
  });
});

describe("each event is sent once per puzzle per device", () => {
  it("sends the first time and remembers it", () => {
    const first = claimEvent("finished-3", [], []);
    expect(first).toEqual({ send: true, counted: ["finished-3"] });
    expect(claimEvent("finished-3", first.counted, []).send).toBe(false);
  });

  it("doesn't send if another tab already did", () => {
    const claim = claimEvent("finished-3", ["started-3"], ["started-3", "finished-3"]);
    expect(claim.send).toBe(false);
    expect(claim.counted).toEqual(["started-3", "finished-3"]);
  });

  it("keeps the list short", () => {
    const many = Array.from({ length: 70 }, (_, i) => `started-${i}`);
    expect(claimEvent("finished-99", many, []).counted).toHaveLength(60);
  });
});
