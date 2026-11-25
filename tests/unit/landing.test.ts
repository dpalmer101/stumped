import { describe, expect, it } from "vitest";
import { TIERS } from "../../src/engine/types";
import type { ThemeKey } from "../../src/storage";
import {
  atNight,
  CUT,
  isLanding,
  type Key,
  LANDING_TIERS,
  LANDINGS,
  landingFrames,
  WIPE_IN,
  wipeKeys,
  wipeSvg,
} from "../../src/ui/landing";
import { THEMES } from "../../src/ui/themes";

const themes = Object.keys(THEMES) as ThemeKey[];
const all = themes.flatMap((theme) => LANDING_TIERS.map((tier) => ({ theme, tier })));

function tracks(theme: ThemeKey, tier: (typeof LANDING_TIERS)[number]) {
  const out: { part: string; keys: Key[] }[] = [];
  LANDINGS[theme][tier].play((part, keys) => out.push({ part, keys }));
  return out;
}

describe("landing scenes", () => {
  it("only fours, sixes and out of the ground cut to a landing", () => {
    expect(TIERS.filter(isLanding).sort()).toEqual(["four", "ootg", "six"]);
  });

  it("every theme has its own scene for each of them", () => {
    const svgs = all.map(({ theme, tier }) => LANDINGS[theme][tier].svg());
    expect(svgs).toHaveLength(12);
    expect(new Set(svgs).size).toBe(12);
  });

  it.each(all)("$theme $tier animates only parts it draws, and the ball", ({ theme, tier }) => {
    const svg = LANDINGS[theme][tier].svg();
    const ts = tracks(theme, tier);
    expect(ts.map((t) => t.part)).toContain("ball");
    for (const { part } of ts) expect(svg).toContain(`data-p="${part}"`);
  });

  it.each(all)("$theme $tier never gives a part two tracks for one property", ({ theme, tier }) => {
    // Tracks fill both ways, so a second one would hide the first for the whole scene.
    const seen = new Set<string>();
    for (const { part, keys } of tracks(theme, tier)) {
      for (const prop of new Set(keys.flatMap(([, p]) => Object.keys(p)))) {
        const id = `${part}.${prop}`;
        expect(seen, id).not.toContain(id);
        seen.add(id);
      }
    }
  });

  it.each(all.filter(({ theme }) => theme !== "hundred"))(
    "$theme $tier has a night sky at night",
    ({ theme, tier }) => {
      const day = LANDINGS[theme][tier].svg();
      const sky = (svg: string) =>
        [...svg.matchAll(/fill="#([0-9a-f]{6})"/g)]
          .map(([, hex]) => hex)
          .filter((hex) =>
            [
              "a9d8f2",
              "e6f4fb",
              "8cc8ec",
              "b9dcf2",
              "3b5ba8",
              "7d6fb8",
              "e9876a",
              "f6c88e",
              "fffffe",
            ].includes(hex ?? ""),
          );
      // The Test six lands on the pavilion balcony, with no sky in view.
      if (theme === "test" && tier === "six") return expect(sky(day)).toEqual([]);
      expect(sky(day).length).toBeGreaterThan(0);
      expect(sky(atNight(day))).toEqual([]);
    },
  );

  it.each(all)("$theme $tier keys run forwards in time", ({ theme, tier }) => {
    for (const { part, keys } of tracks(theme, tier)) {
      const times = keys.map(([t]) => t);
      expect(times, part).toEqual([...times].sort((a, b) => a - b));
      expect(times[0], part).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("landingFrames", () => {
  it("spreads keys over the track and steps each segment", () => {
    const { frames, delay, duration } = landingFrames([
      [200, { opacity: 0 }],
      [200, { opacity: 1 }],
      [1100, { opacity: 0 }],
    ]);
    expect(delay).toBe(200);
    expect(duration).toBe(900);
    expect(frames.map((f) => f.offset)).toEqual([0, 0, 1]);
    expect(frames[1]?.easing).toBe("steps(10, end)");
  });
});

describe("wipe", () => {
  it("covers the whole scene", () => {
    expect(wipeSvg("village").match(/data-w=/g)).toHaveLength(54);
  });

  it("covers the pitch before the cut and uncovers the landing after it", () => {
    const keys = wipeKeys(0);
    const on = keys.find(([, p]) => p.opacity === 1);
    const off = keys.at(-1);
    expect(on?.[0]).toBe(WIPE_IN);
    expect(off?.[0]).toBe(CUT);
    expect(off?.[1].opacity).toBe(0);
  });
});
