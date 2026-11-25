import { BALL_MS, type Tier } from "../engine/types";
import type { ThemeKey } from "../storage";
import {
  atNight,
  CUT,
  isLanding,
  type Key,
  LANDINGS,
  type LandingTier,
  landingFrames,
  NIGHT_ALPHA,
  NIGHT_TINT,
  wipeKeys,
  wipeSvg,
} from "./landing";
import { crowd, P, px } from "./pixels";
import { type ScenePalette, THEMES } from "./themes";

const WOOD = "#f1e6c8";
const PITCH_LABEL = "Looking down the pitch at the batter";

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

/** Lamp heads per theme, as [x, y, w, h]: on the 100 and One Day's own towers, new ones elsewhere. */
const LAMPS: Record<ThemeKey, [number, number, number, number][]> = {
  hundred: [
    [3, 0, 5, 2],
    [82, 0, 5, 2],
  ],
  oneday: [
    [68, 0, 5, 1],
    [84, 0, 5, 1],
  ],
  village: [
    [12, 0, 5, 2],
    [73, 0, 5, 2],
  ],
  test: [
    [0, 0, 5, 2],
    [85, 0, 5, 2],
  ],
};
const NEEDS_TOWERS: readonly ThemeKey[] = ["village", "test"];

/** At night the sky darkens and floodlights shine; "dark" starts them off, for Pitch.lightsOn. */
export type Night = "dark" | "lit";

function nightSky(theme: ThemeKey): string {
  let s = theme === "hundred" ? "" : px(0, 0, 90, 20, NIGHT_TINT, `opacity="${NIGHT_ALPHA}"`);
  for (const [x, , w] of LAMPS[theme]) {
    if (NEEDS_TOWERS.includes(theme)) s += px(x + Math.floor(w / 2), 2, 1, 17, "#2a3040");
    s += px(x, 0, w, 2, "#4a4f5c");
  }
  return s;
}

function floodlights(theme: ThemeKey, dark: boolean): string {
  let s = "";
  for (const [x, y, w, h] of LAMPS[theme]) {
    s += px(x - 1, y, w + 2, h + 1, "#ffe680", 'opacity=".35"') + px(x, y, w, h, "#fffbe0");
    // A beam that widens in steps, like the 8-bit sprites.
    for (const [spread, top, rows, alpha] of [
      [1, 1, 2, ".28"],
      [3, 3, 3, ".16"],
      [6, 6, 5, ".08"],
    ] as const)
      s += px(x - spread, y + h + top - 1, w + spread * 2, rows, "#ffe680", `opacity="${alpha}"`);
  }
  return `<g data-part="floodlights" pointer-events="none"${dark ? ' opacity="0"' : ""}>${s}</g>`;
}

export function sceneSvg(theme: ThemeKey, night?: Night): string {
  const c = THEMES[theme].scene;
  let s = BACKDROPS[theme](c);
  if (night) s += nightSky(theme);
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
    // One rounded half-width for both sides, so the right edge steps exactly like the left.
    const half = Math.round(10 + (r - 25) * 0.45);
    s += px(45 - half, r, half * 2, 1, c.pitch);
  }
  s += px(35, 27, 20, 1, "#fff") + px(25, 49, 40, 1, "#fff");
  // Far stumps in the middle of the wicket, the batter standing off to the left of them.
  s += px(42, 16, 1, 12, WOOD) + px(44, 16, 1, 12, WOOD) + px(46, 16, 1, 12, WOOD);
  s += px(42, 15, 2, 1, WOOD, 'data-part="bail1"') + px(45, 15, 2, 1, WOOD, 'data-part="bail2"');
  s += '<g data-part="batter">';
  s += px(34, 18, 2, 10, "#fff") + px(37, 18, 2, 10, "#fff");
  s += px(33, 9, 7, 9, c.kit) + px(32, 10, 1, 5, c.kit) + px(40, 10, 1, 4, c.kit);
  s += px(34, 4, 5, 5, c.helmet) + px(34, 7, 5, 1, "#222") + px(35, 8, 3, 1, c.skin);
  s += `<g data-part="bat" style="transform-origin:${40 * P}px ${14 * P}px">${px(40, 13, 1, 2, "#333")}${px(39, 15, 2, 10, "#d9b779")}</g></g>`;
  s += px(41, 44, 2, 11, WOOD) + px(44, 44, 2, 11, WOOD) + px(47, 44, 2, 11, WOOD);
  s += `<g data-part="bowler">${px(30, 48, 2, 7, c.kit2)}${px(33, 48, 2, 7, c.kit2)}${px(29, 39, 7, 10, c.kit2)}${px(35, 31, 2, 9, c.kit2)}${px(30, 34, 5, 5, "#5a3b26")}</g>`;
  // Invisible, generous tap target over the far stumps (an easter egg; see App.tapStumps).
  s += px(39, 12, 11, 18, "transparent", 'data-part="stumps-hit"');
  s += `<rect data-part="ball" x="-2" y="-2" width="4" height="4" fill="${c.ball}" transform="translate(144 122) scale(2)"/>`;
  if (night === "dark")
    s += px(0, 0, 90, 55, "#02030a", 'data-part="dark" opacity=".9" pointer-events="none"');
  if (night) s += floodlights(theme, night === "dark");
  return `<svg data-theme="${theme}"${night ? " data-night" : ""} viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" role="img" aria-label="${PITCH_LABEL}">${s}</svg>`;
}

type Frame = { transform: string };
const at = (x: number, y: number, s = 1): Frame => ({
  transform: `translate(${x}px, ${y}px) scale(${s})`,
});
const START = at(144, 122, 2);
const AT_BAT = at(162, 84, 1.25);
const RUN_UP_MS = 600;
// Stepped easing gives the choppy, frame-by-frame 8-bit feel.
const steps = (n: number) => `steps(${n}, end)`;

export const SHOTS: Record<Tier, { path: Frame[]; dur: number; swing: number }> = {
  single: { path: [AT_BAT, at(150, 100, 1.25), at(128, 104, 1.25)], dur: 1000, swing: 30 },
  two: { path: [AT_BAT, at(260, 100, 1.5), at(332, 110, 1.5)], dur: 1100, swing: -50 },
  four: { path: [AT_BAT, at(110, 150, 2), at(-20, 215, 3)], dur: 900, swing: 70 },
  six: { path: [AT_BAT, at(250, 30, 2), at(345, -40, 3)], dur: 1100, swing: -110 },
  ootg: { path: [AT_BAT, at(190, 40, 3), at(195, -80, 8)], dur: 1100, swing: 140 },
};

export type DismissalStyle =
  | "bowled"
  | "lbw"
  | "behind"
  | "slip"
  | "deep"
  | "bowler"
  | "stumped"
  | "runout"
  | "hitwicket"
  | "none";

const STYLES: Record<string, DismissalStyle> = {
  Bowled: "bowled",
  LBW: "lbw",
  "Caught behind": "behind",
  "Caught at slip": "slip",
  "Caught in the deep": "deep",
  "Caught & bowled": "bowler",
  Stumped: "stumped",
  "Run out": "runout",
  "Hit wicket": "hitwicket",
};

/** Each dismissal has its own animation, so what's shown matches what's called. */
export const dismissalStyle = (dismissal: string): DismissalStyle => STYLES[dismissal] ?? "none";

/** Where the ball goes for the dismissals that are just a ball path. */
export const OUT_PATHS: Record<"lbw" | "behind" | "slip" | "deep" | "bowler", Frame[]> = {
  lbw: [AT_BAT, at(148, 100, 1.3), at(146, 108, 1.2)],
  behind: [AT_BAT, at(180, 74, 1), at(186, 66, 0.8)],
  slip: [AT_BAT, at(202, 74, 1), at(232, 70, 0.85)],
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
    for (const el of this.svg.querySelectorAll('[data-part="landing"], [data-part="wipe"]'))
      el.remove();
    this.svg.setAttribute("aria-label", PITCH_LABEL);
    return this.gen;
  }

  /**
   * The ball travels down the pitch for the whole ball, reaching the batter as time runs out.
   * `elapsed` resumes it part-way (after a reload, or coming back from home); the bowler only runs in
   * at the start.
   */
  bowl(elapsed: number): void {
    this.clear();
    if (this.reduce) {
      this.part("ball").setAttribute("transform", "translate(154 108) scale(1.6)");
      return;
    }
    if (elapsed < RUN_UP_MS) {
      this.run(
        this.part("bowler"),
        [
          { transform: "none" },
          { transform: "translate(8px,-12px)" },
          { transform: "translate(-4px,4px)" },
        ],
        { duration: RUN_UP_MS, delay: -elapsed, easing: steps(2) },
      );
    }
    // Held in the hand for the run-up, then down the pitch, pitching near the end.
    const runUp = RUN_UP_MS / BALL_MS;
    this.run(
      this.part("ball"),
      [
        { ...START, offset: 0 },
        { ...START, offset: runUp },
        { ...at(156, 116, 0.95), offset: 0.85 },
        { ...AT_BAT, offset: 1 },
      ],
      // 3 frames a second keeps the 8-bit feel without looking frozen.
      { duration: BALL_MS, delay: -elapsed, easing: steps(Math.round(BALL_MS / 333)) },
    );
  }

  private swing(deg: number, duration: number, frames: number) {
    const rest = { transform: "rotate(0)" };
    this.run(this.part("bat"), [rest, { transform: `rotate(${deg}deg)` }, rest], {
      duration,
      easing: steps(frames),
    });
  }

  /** Stop the ball where it is and bring it on to the bat quickly. */
  private toBat() {
    const ball = this.part("ball");
    const here = getComputedStyle(ball).transform;
    this.clear();
    ball.style.transform = here;
    const done = this.run(ball, [{ transform: here }, AT_BAT], { duration: 180, easing: steps(3) });
    ball.style.transform = "";
    return done;
  }

  lightsOn(delay: number): void {
    const dark = this.svg.querySelector<SVGElement>('[data-part="dark"]');
    const lights = this.svg.querySelector<SVGElement>('[data-part="floodlights"]');
    if (!dark || !lights) return;
    if (this.reduce) {
      dark.remove();
      lights.removeAttribute("opacity");
      return;
    }
    const opts = { delay, duration: 600, fill: "forwards", easing: "linear" } as const;
    lights.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 0, offset: 0.25 },
        { opacity: 1, offset: 0.4 },
        { opacity: 0.3, offset: 0.5 },
        { opacity: 1 },
      ],
      { ...opts, easing: steps(6) },
    );
    dark.animate([{ opacity: 0.9 }, { opacity: 0.9, offset: 0.4 }, { opacity: 0 }], {
      ...opts,
      easing: steps(4),
    });
  }

  /** An air shot: the batter swings and misses, and the ball keeps coming. */
  miss(): void {
    if (this.reduce) return;
    this.swing(25, 300, 2);
  }

  async hit(tier: Tier): Promise<void> {
    if (this.reduce) {
      if (isLanding(tier)) {
        this.clear();
        await this.land(tier, true);
      }
      return;
    }
    const shot = SHOTS[tier];
    const arrive = this.toBat();
    const g = this.gen;
    await arrive;
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
    const flight = this.run(this.part("ball"), shot.path, {
      duration: shot.dur,
      easing: steps(Math.round(shot.dur / 90)),
    });
    // The landing plays on after this resolves, so it never holds up the next ball.
    await (isLanding(tier) ? this.land(tier, false) : flight);
  }

  /**
   * Wipes from the pitch to where the ball lands, timed from the swing, and resolves once it shows.
   * `still` shows its last frame straight away, for reduced motion.
   */
  private land(tier: LandingTier, still: boolean): Promise<void> {
    const theme = this.svg.dataset.theme;
    if (!theme || !(theme in LANDINGS)) return Promise.resolve();
    const landing = LANDINGS[theme as keyof typeof LANDINGS][tier];
    const night = this.svg.hasAttribute("data-night");
    const wipe = still ? "" : `<g data-part="wipe">${wipeSvg(theme as keyof typeof LANDINGS)}</g>`;
    this.svg.insertAdjacentHTML(
      "beforeend",
      `<g data-part="landing"${still ? "" : ' opacity="0"'}>${night ? atNight(landing.svg()) : landing.svg()}</g>${wipe}`,
    );
    const scene = this.part("landing");
    this.svg.setAttribute("aria-label", "Where the ball landed");
    const from = this.anims.length;
    const track = (el: Element | null, keys: Key[], base: number) => {
      if (!el) return Promise.resolve();
      const { frames, delay, duration } = landingFrames(keys);
      return this.run(el, frames, {
        delay: base + delay,
        duration,
        easing: "linear",
        fill: "both",
      });
    };
    landing.play((name, keys) => {
      void track(scene.querySelector(`[data-p="${name}"]`), keys, still ? 0 : CUT);
    });
    if (still) {
      for (const a of this.anims.slice(from)) a.finish();
      return Promise.resolve();
    }
    for (const block of this.part("wipe").querySelectorAll<SVGElement>("[data-w]")) {
      void track(block, wipeKeys(Number(block.dataset.w)), 0);
    }
    return track(
      scene,
      [
        [0, { opacity: 0 }],
        [CUT, { opacity: 0 }],
        [CUT, { opacity: 1 }],
      ],
      0,
    );
  }

  async out(dismissal: string): Promise<void> {
    if (this.reduce) return;
    const style = dismissalStyle(dismissal);
    const arrive = this.toBat();
    const g = this.gen;
    await arrive;
    if (g !== this.gen || style === "none") return;
    const ball = this.part("ball");
    const batter = this.part("batter");
    switch (style) {
      case "bowled":
        this.run(ball, [AT_BAT, at(176, 92, 1.25)], { duration: 160, easing: steps(2) });
        return this.flyBails(120);
      case "stumped":
        // Down the track, beaten, and the keeper whips the bails off.
        this.swing(30, 300, 2);
        this.run(
          batter,
          [{ transform: "none" }, { transform: "translate(-4px, 22px) scale(1.12)" }],
          {
            duration: 400,
            easing: steps(3),
          },
        );
        await this.run(ball, [AT_BAT, at(174, 82, 1), at(178, 80, 0.8)], {
          duration: 450,
          easing: steps(4),
        });
        return this.flyBails(0);
      case "runout": {
        // Pushed into the off side, sets off for a run, and the throw beats them back.
        this.swing(25, 300, 2);
        this.run(
          batter,
          [{ transform: "none" }, { transform: "translate(-6px, 40px) scale(1.25)" }],
          {
            duration: 700,
            easing: steps(5),
          },
        );
        await this.run(ball, [AT_BAT, at(130, 106, 1.3)], { duration: 450, easing: steps(4) });
        if (g !== this.gen) return;
        await this.run(ball, [at(130, 106, 1.3), at(176, 92, 1.2)], {
          duration: 350,
          easing: steps(4),
        });
        return this.flyBails(0);
      }
      case "hitwicket":
        // A big swing, and the batter treads back on to the stumps.
        this.swing(-120, 450, 3);
        this.run(ball, [AT_BAT, at(250, 50, 1.4), at(300, 70, 1.4)], {
          duration: 700,
          easing: steps(6),
        });
        this.run(batter, [{ transform: "none" }, { transform: "translate(10px, -4px)" }], {
          duration: 300,
          easing: steps(2),
        });
        return this.flyBails(250);
      default:
        await this.run(ball, OUT_PATHS[style], { duration: 800, easing: steps(8) });
    }
  }

  /** Easter egg: the bails fly off for no reason at all, then settle back. */
  async knockBails(): Promise<void> {
    const gen = this.gen;
    await this.flyBails(0);
    await new Promise((r) => setTimeout(r, 1200));
    if (gen !== this.gen) return;
    for (const i of [1, 2]) {
      for (const a of this.part(`bail${i}`).getAnimations()) a.cancel();
    }
  }

  private async flyBails(delay: number): Promise<void> {
    await Promise.all(
      [1, 2].map((i) =>
        this.run(
          this.part(`bail${i}`),
          [
            { transform: "none" },
            { transform: `translate(${i === 2 ? 8 : -8}px,-12px)` },
            { transform: `translate(${i === 2 ? 12 : -12}px,4px)` },
          ],
          { duration: 700, delay, easing: steps(6) },
        ),
      ),
    );
  }
}

/** An 8-bit duck for a total of nought. Our own pixel art. */
export function duckSvg(): string {
  const d = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const body = "#f5c518";
  const s =
    d(6, 0, 4, 4, body) +
    d(8, 1, 1, 1, "#222") +
    d(10, 2, 2, 1, "#f08a1c") +
    d(0, 3, 2, 2, body) +
    d(1, 4, 9, 4, body) +
    d(3, 5, 4, 2, "#d9a514") +
    d(4, 8, 1, 2, "#f08a1c") +
    d(7, 8, 1, 2, "#f08a1c");
  return `<svg viewBox="0 0 12 10" width="36" height="30" shape-rendering="crispEdges">${s}</svg>`;
}
