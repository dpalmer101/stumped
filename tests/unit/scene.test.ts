import { describe, expect, it } from "vitest";
import { DISMISSALS, TIMED_OUT } from "../../src/engine/dismissal";
import { TIERS } from "../../src/engine/types";
import { dismissalStyle, OUT_PATHS, SHOTS } from "../../src/ui/scene";

describe("pitch animations", () => {
  it("every tier has its own shot path", () => {
    const ends = TIERS.map((t) => JSON.stringify(SHOTS[t].path.at(-1)));
    expect(new Set(ends).size).toBe(TIERS.length);
  });

  it("bigger shots travel further", () => {
    const distance = (t: (typeof TIERS)[number]) => {
      const m = SHOTS[t].path
        .at(-1)
        ?.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/);
      return m ? Number(m[3]) : 0;
    };
    expect(distance("ootg")).toBeGreaterThan(distance("six"));
    expect(distance("six")).toBeGreaterThan(distance("single"));
  });

  it("every dismissal has its own animation", () => {
    const styles = DISMISSALS.map(dismissalStyle);
    expect(styles).not.toContain("none");
    expect(new Set(styles).size).toBe(DISMISSALS.length);
    expect(dismissalStyle(TIMED_OUT)).toBe("none");
    const paths = Object.values(OUT_PATHS).map((p) => JSON.stringify(p.at(-1)));
    expect(new Set(paths).size).toBe(paths.length);
  });
});
