import type { Tier } from "../engine/types";
import type { ThemeKey } from "../storage";
import { type ScenePalette, THEMES } from "./themes";

// 8-bit scene: a 90×55 grid of 4px "pixels" in a 360×220 viewBox.
const P = 4;
const WOOD = "#f1e6c8";

const px = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
  `<rect x="${x * P}" y="${y * P}" width="${w * P}" height="${h * P}" fill="${fill}" ${extra}/>`;

// Seeded so the crowd looks the same on every visit.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function crowd(
  x0: number,
  y0: number,
  w: number,
  h: number,
  colours: string[],
  density: number,
  seed: number,
) {
  const r = rng(seed);
  let s = "";
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (r() < density) s += px(x, y, 1, 1, colours[Math.floor(r() * colours.length)] ?? "#fff");
    }
  }
  return s;
}

function boards(y: number, a: string, b: string, seg: number) {
  let s = "";
  for (let x = 0; x < 90; x += seg) s += px(x, y, seg, 2, (x / seg) % 2 ? b : a);
  return s;
}

const BACKDROPS: Record<ThemeKey, (c: ScenePalette) => string> = {
  hundred(c) {
    let s = px(0, 0, 90, 20, "#07021a");
    for (const [x, y] of [
      [10, 2],
      [24, 1],
      [33, 4],
      [58, 2],
      [66, 5],
      [74, 1],
      [50, 3],
      [18, 5],
    ] as const) {
      s += px(x, y, 1, 1, "#fff");
    }
    s += px(5, 0, 1, 8, "#2a3358") + px(84, 0, 1, 8, "#2a3358");
    s += px(3, 0, 5, 2, "#fffbe0") + px(82, 0, 5, 2, "#fffbe0");
    s += px(1, 2, 9, 3, "#fff6c0", 'opacity=".25"') + px(80, 2, 9, 3, "#fff6c0", 'opacity=".25"');
    s += px(20, 6, 50, 1, "#1a0f38") + px(0, 7, 90, 11, "#1a0f38");
    s += crowd(0, 7, 90, 11, ["#ff2bd6", "#22d3ee", "#ffe600", "#7cff6b", "#ffffff"], 0.3, 7);
    s += px(36, 9, 18, 9, c.screen);
    return s + boards(18, "#ff2bd6", "#22d3ee", 6);
  },
  village(c) {
    let s = px(0, 0, 90, 10, "#a9d8f2") + px(0, 10, 90, 10, "#e6f4fb");
    s +=
      px(56, 2, 10, 2, "#fff") +
      px(58, 1, 5, 1, "#fff") +
      px(14, 4, 8, 1, "#fff") +
      px(15, 3, 4, 1, "#fff");
    const tree = "#3f7d45";
    const dark = "#346b3a";
    s +=
      px(0, 11, 12, 8, tree) +
      px(2, 9, 8, 2, tree) +
      px(76, 10, 14, 9, tree) +
      px(78, 8, 10, 2, dark);
    s += px(64, 13, 10, 6, dark) + px(66, 11, 6, 2, tree);
    const roof = "#a4483d";
    s += px(18, 12, 14, 7, "#fbf7ec") + px(17, 11, 16, 1, roof) + px(19, 10, 12, 1, roof);
    s +=
      px(21, 9, 8, 1, roof) +
      px(23, 8, 4, 1, roof) +
      px(24, 15, 3, 4, "#5d4a3a") +
      px(18, 13, 14, 1, "#e0d8c2");
    s +=
      px(57, 13, 7, 6, "#3a3a34") +
      px(58, 14, 2, 2, "#fff") +
      px(61, 14, 2, 2, "#fff") +
      px(58, 17, 5, 1, "#fff");
    s += px(36, 10, 18, 9, c.screen) + px(0, 19, 90, 1, "#ffffff");
    for (let x = 0; x < 90; x += 3) s += px(x, 18, 1, 1, "#ffffff");
    return s;
  },
  test(c) {
    let s = px(0, 0, 90, 10, "#8cc8ec") + px(0, 10, 90, 10, "#dcefff");
    s += px(62, 3, 12, 2, "#fff") + px(64, 2, 7, 1, "#fff");
    const brick = "#a4513f";
    const trim = "#7d3a2d";
    s += px(4, 7, 30, 11, brick) + px(3, 6, 32, 1, trim);
    s += px(17, 2, 4, 5, brick) + px(16, 1, 6, 1, trim) + px(18, 3, 2, 2, "#f4efe1");
    for (let y = 8; y < 16; y += 3) for (let x = 6; x < 33; x += 3) s += px(x, y, 2, 2, "#f4efe1");
    s += px(4, 13, 30, 1, "#ffffff");
    s += crowd(5, 14, 28, 3, ["#f7f3e6", "#e8d9a8", "#c9d7e8"], 0.35, 11);
    s +=
      px(56, 9, 34, 9, "#8b96a1") +
      crowd(56, 9, 34, 9, ["#f7f3e6", "#e8d9a8", "#c9d7e8", brick], 0.22, 3);
    s += px(36, 9, 18, 9, c.screen);
    return s + px(0, 18, 90, 2, "#1f3b2c");
  },
  oneday(c) {
    let s = px(0, 0, 90, 3, "#3b5ba8") + px(0, 3, 90, 3, "#7d6fb8") + px(0, 6, 90, 4, "#e9876a");
    s += px(0, 10, 90, 10, "#f6c88e");
    s +=
      px(0, 4, 90, 1, "#1d2436") +
      px(0, 5, 90, 5, "#3d4a63") +
      px(0, 10, 90, 1, "#1d2436") +
      px(0, 11, 90, 7, "#3d4a63");
    s += crowd(0, 5, 90, 5, ["#1e5eff", "#ffcc00", "#ffffff", "#ff7a3d"], 0.45, 21);
    s += crowd(0, 11, 90, 7, ["#1e5eff", "#ffcc00", "#ffffff", "#ff7a3d", "#7dff9a"], 0.5, 5);
    s += px(4, 0, 16, 5, "#111") + px(6, 1, 5, 1, "#ffcc00") + px(6, 3, 9, 1, "#ffffff");
    s +=
      px(70, 0, 1, 4, "#1d2436") +
      px(68, 0, 5, 1, "#fffbe0") +
      px(86, 0, 1, 4, "#1d2436") +
      px(84, 0, 5, 1, "#fffbe0");
    s += px(36, 9, 18, 9, c.screen);
    return s + boards(18, "#ffcc00", "#1e5eff", 9);
  },
};

export function sceneSvg(theme: ThemeKey): string {
  const c = THEMES[theme].scene;
  let s = BACKDROPS[theme](c);
  s += px(0, 20, 90, 35, c.grass);
  for (const [r, h] of [
    [21, 1],
    [24, 2],
    [29, 3],
    [36, 4],
    [45, 6],
  ] as const)
    s += px(0, r, 90, h, c.stripe);
  for (let r = 25; r < 55; r++) {
    const half = 10 + (r - 25) * 0.45;
    s += px(Math.round(45 - half), r, Math.round(half * 2), 1, c.pitch);
  }
  s += px(35, 27, 20, 1, "#fff") + px(25, 49, 40, 1, "#fff");
  // Far stumps peek out beside the batter.
  s += px(47, 16, 1, 12, WOOD) + px(49, 16, 1, 12, WOOD) + px(51, 16, 1, 12, WOOD);
  s += px(47, 15, 2, 1, WOOD, 'data-part="bail1"') + px(50, 15, 2, 1, WOOD, 'data-part="bail2"');
  s += px(40, 18, 2, 10, "#fff") + px(43, 18, 2, 10, "#fff");
  s += px(39, 9, 7, 9, c.kit) + px(38, 10, 1, 5, c.kit) + px(46, 10, 1, 4, c.kit);
  s += px(40, 4, 5, 5, c.helmet) + px(40, 7, 5, 1, "#222") + px(41, 8, 3, 1, c.skin);
  s += `<g data-part="bat" style="transform-origin:${46 * P}px ${14 * P}px">${px(46, 13, 1, 2, "#333")}${px(45, 15, 2, 10, "#d9b779")}</g>`;
  s += px(41, 44, 2, 11, WOOD) + px(44, 44, 2, 11, WOOD) + px(47, 44, 2, 11, WOOD);
  s += `<g data-part="bowler">${px(30, 48, 2, 7, c.kit2)}${px(33, 48, 2, 7, c.kit2)}${px(29, 39, 7, 10, c.kit2)}${px(35, 31, 2, 9, c.kit2)}${px(30, 34, 5, 5, "#5a3b26")}</g>`;
  s += `<rect data-part="ball" x="-2" y="-2" width="4" height="4" fill="${c.ball}" transform="translate(144 122) scale(2)"/>`;
  return `<svg viewBox="0 0 360 220" shape-rendering="crispEdges" role="img" aria-label="Looking down the pitch at the batter">${s}</svg>`;
}

type Frame = { transform: string };
const at = (x: number, y: number, s = 1): Frame => ({
  transform: `translate(${x}px, ${y}px) scale(${s})`,
});
const START = at(144, 122, 2);
const HOLD = at(178, 108, 1.6);
const AT_BAT = at(186, 84, 1.25);
// Stepped easing gives the choppy, frame-by-frame 8-bit feel.
const steps = (n: number) => `steps(${n}, end)`;

export const SHOTS: Record<Tier, { path: Frame[]; dur: number; swing: number }> = {
  single: { path: [AT_BAT, at(150, 100, 1.25), at(128, 104, 1.25)], dur: 1000, swing: 30 },
  two: { path: [AT_BAT, at(260, 100, 1.5), at(332, 110, 1.5)], dur: 1100, swing: -50 },
  four: { path: [AT_BAT, at(110, 150, 2), at(-20, 215, 3)], dur: 900, swing: 70 },
  six: { path: [AT_BAT, at(250, 30, 2), at(345, -40, 3)], dur: 1100, swing: -110 },
  ootg: { path: [AT_BAT, at(190, 40, 3), at(195, -80, 8)], dur: 1100, swing: 140 },
};

export type DismissalStyle = "bails" | "pad" | "behind" | "deep" | "bowler" | "none";

export function dismissalStyle(dismissal: string): DismissalStyle {
  if (/^(Bowled|Hit wicket|Stumped|Run out)$/.test(dismissal)) return "bails";
  if (dismissal === "LBW") return "pad";
  if (/Caught (behind|at slip)/.test(dismissal)) return "behind";
  if (dismissal === "Caught in the deep") return "deep";
  if (dismissal === "Caught & bowled") return "bowler";
  return "none";
}

export const OUT_PATHS: Record<Exclude<DismissalStyle, "bails" | "none">, Frame[]> = {
  pad: [AT_BAT, at(172, 100, 1.3), at(170, 108, 1.2)],
  behind: [AT_BAT, at(214, 70, 1), at(236, 64, 0.8)],
  deep: [AT_BAT, at(120, 20, 2.2), at(30, 60, 2.6)],
  bowler: [AT_BAT, at(160, 104, 1.6), at(146, 118, 2)],
};

/** Drives the pitch animations. With reduced motion every method resolves at once. */
export class Pitch {
  private anims: Animation[] = [];
  /** Bumped by clear(), so an animation sequence that was interrupted stops at its next step. */
  private gen = 0;
  private readonly reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private readonly svg: SVGSVGElement) {}

  private part(name: string): SVGElement {
    const el = this.svg.querySelector<SVGElement>(`[data-part="${name}"]`);
    if (!el) throw new Error(`Missing scene part ${name}`);
    return el;
  }

  private run(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
    const a = el.animate(frames, { fill: "forwards", ...opts });
    this.anims.push(a);
    return a.finished.then(
      () => undefined,
      () => undefined,
    );
  }

  private clear(): number {
    this.gen += 1;
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.part("ball").removeAttribute("transform");
    return this.gen;
  }

  /** Bowler runs in and the ball hangs in flight while the player thinks. */
  async deliver(): Promise<void> {
    const g = this.clear();
    if (this.reduce) return this.hold();
    this.run(
      this.part("bowler"),
      [
        { transform: "none" },
        { transform: "translate(8px,-12px)" },
        { transform: "translate(-4px,4px)" },
      ],
      {
        duration: 500,
        easing: steps(2),
      },
    );
    await this.run(this.part("ball"), [START, HOLD], {
      duration: 450,
      delay: 350,
      easing: steps(5),
    });
    if (g === this.gen) this.hover();
  }

  /** Puts the ball straight into its waiting position, e.g. after a reload mid-ball. */
  hold(): void {
    this.clear();
    if (this.reduce) {
      this.part("ball").setAttribute("transform", "translate(178 108) scale(1.6)");
      return;
    }
    this.hover();
  }

  private swing(deg: number, duration: number, frames: number) {
    const rest = { transform: "rotate(0)" };
    this.run(this.part("bat"), [rest, { transform: `rotate(${deg}deg)` }, rest], {
      duration,
      easing: steps(frames),
    });
  }

  private toBat() {
    return this.run(this.part("ball"), [HOLD, AT_BAT], { duration: 150, easing: steps(2) });
  }

  private hover() {
    this.run(this.part("ball"), [HOLD, { transform: "translate(178px, 106px) scale(1.6)" }], {
      duration: 600,
      iterations: Number.POSITIVE_INFINITY,
      direction: "alternate",
      easing: steps(1),
    });
  }

  async miss(): Promise<void> {
    if (this.reduce) return;
    const g = this.clear();
    this.swing(25, 300, 2);
    await this.run(this.part("ball"), [HOLD, AT_BAT, at(194, 82, 1), at(198, 76, 0.6)], {
      duration: 380,
      easing: steps(4),
    });
    if (g !== this.gen) return;
    await this.run(this.part("ball"), [START, HOLD], {
      duration: 300,
      delay: 150,
      easing: steps(4),
    });
    if (g === this.gen) this.hover();
  }

  async hit(tier: Tier): Promise<void> {
    if (this.reduce) return;
    const g = this.clear();
    const shot = SHOTS[tier];
    await this.toBat();
    if (g !== this.gen) return;
    this.swing(shot.swing, 420, 3);
    if (tier === "ootg") {
      this.run(
        this.svg,
        [{ filter: "brightness(1)" }, { filter: "brightness(1.7)" }, { filter: "brightness(1)" }],
        {
          duration: 600,
          delay: 600,
          easing: steps(4),
          fill: "none",
        },
      );
    }
    await this.run(this.part("ball"), shot.path, {
      duration: shot.dur,
      easing: steps(Math.round(shot.dur / 90)),
    });
  }

  async out(dismissal: string): Promise<void> {
    if (this.reduce) return;
    const g = this.clear();
    const style = dismissalStyle(dismissal);
    if (style === "none") {
      this.part("ball").setAttribute("transform", "translate(-20 -20)");
      return;
    }
    await this.toBat();
    if (g !== this.gen) return;
    if (style === "bails") {
      this.run(this.part("ball"), [AT_BAT, at(196, 92, 1.25)], { duration: 160, easing: steps(2) });
      await Promise.all(
        [1, 2].map((i) =>
          this.run(
            this.part(`bail${i}`),
            [
              { transform: "none" },
              { transform: `translate(${i === 2 ? 8 : -8}px,-12px)` },
              { transform: `translate(${i === 2 ? 12 : -12}px,4px)` },
            ],
            { duration: 700, delay: 120, easing: steps(6) },
          ),
        ),
      );
      return;
    }
    await this.run(this.part("ball"), OUT_PATHS[style], { duration: 800, easing: steps(8) });
  }
}
