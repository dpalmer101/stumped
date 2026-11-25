import type { Tier } from "../engine/types";
import type { ThemeKey } from "../storage";
import { crowd, P, pixelText, px, rng, scatter } from "./pixels";
import { THEMES } from "./themes";

/**
 * Where the ball lands on a four, six or out of the ground: after the shot the pitch scene wipes to
 * a second scene, one per theme and tier. Our own pixel art, drawn on the pitch's 90×55 grid.
 */
export type LandingTier = "four" | "six" | "ootg";
export const LANDING_TIERS: readonly LandingTier[] = ["four", "six", "ootg"];
export const isLanding = (tier: Tier): tier is LandingTier =>
  (LANDING_TIERS as readonly Tier[]).includes(tier);

export interface Props {
  transform?: string;
  opacity?: number;
  filter?: string;
}
/** A time in ms from the cut to the landing scene, and the part's look from then on. */
export type Key = [number, Props];
/** Animates one part (its `data-p` name). One call per part and property: see landingFrames. */
export type Track = (part: string, keys: Key[]) => void;

export interface Landing {
  svg(): string;
  play(track: Track): void;
}

/** When the wipe starts covering the pitch, and when the landing scene shows, from the swing. */
export const WIPE_IN = 650;
export const CUT = 1000;
// The wipe's 10-pixel blocks sweep diagonally, each this far behind the one before.
const WIPE_STEP = 22;

/**
 * Segments move in 90ms steps for the 8-bit feel; two keys at one time make an instant change.
 * Tracks fill both ways (parts sit at their first key until they start), so one per part and property.
 */
export function landingFrames(keys: Key[]): {
  frames: Keyframe[];
  delay: number;
  duration: number;
} {
  const t0 = keys[0]?.[0] ?? 0;
  const t1 = keys.at(-1)?.[0] ?? t0;
  const span = Math.max(1, t1 - t0);
  const frames = keys.map(([t, p], i) => {
    const dt = (keys[i + 1]?.[0] ?? t) - t;
    return {
      ...p,
      offset: (t - t0) / span,
      easing: `steps(${Math.max(1, Math.round(dt / 90))}, end)`,
    };
  });
  return { frames, delay: t0, duration: span };
}

export function wipeSvg(theme: ThemeKey): string {
  const [a, b] = THEMES[theme].swatch;
  let s = "";
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 9; c++) {
      s += px(c * 10, r * 10, 10, 10, (c + r) % 2 ? b : a, `data-w="${c + r}" opacity="0"`);
    }
  }
  return s;
}

/** A wipe block (its `data-w` step) covers the pitch, then uncovers the landing. From the swing. */
export function wipeKeys(step: number): Key[] {
  const d = step * WIPE_STEP;
  return [
    [0, op(0)],
    [WIPE_IN + d, op(0)],
    [WIPE_IN + d, op(1)],
    [CUT + d, op(1)],
    [CUT + d, op(0)],
  ];
}

/* ---------- Drawing ---------- */
const G = (name: string, inner: string, extra = "") => `<g data-p="${name}" ${extra}>${inner}</g>`;
const CENTRE = 'style="transform-box:fill-box;transform-origin:center"';
const BASE = 'style="transform-box:fill-box;transform-origin:50% 100%"';
const HIDDEN = 'opacity="0"';
const SKIN = ["#e5b993", "#c99a76", "#8a5a3a", "#d8a982"];

function ball(fill: string, seam: string) {
  return `<g data-p="ball" style="transform:translate(-200px,-200px)"><rect x="-4" y="-4" width="8" height="8" fill="${fill}"/><rect x="-4" y="-1" width="8" height="2" fill="${seam}"/></g>`;
}
const RED_BALL = ball("#c0262d", "#e27a72");
const TEST_BALL = ball("#b3202a", "#d9585f");
const WHITE_BALL = ball("#ffffff", "#d0d6e0");

const armsUp = (x: number, y: number, c: string, skin: string) =>
  px(x - 1, y, 1, 3, c) +
  px(x - 1, y - 1, 1, 1, skin) +
  px(x + 5, y, 1, 3, c) +
  px(x + 5, y - 1, 1, 1, skin);

/* ---------- Keys ---------- */
const tr = (x: number, y: number, s = 1, r = 0): Props => ({
  transform: `translate(${x * P}px,${y * P}px) scale(${s}) rotate(${r}deg)`,
});
const op = (o: number): Props => ({ opacity: o });
type Pt = [x: number, y: number, s: number];
const path = (t0: number, dur: number, pts: Pt[]): Key[] =>
  pts.map(([x, y, s], i) => [t0 + (dur * i) / (pts.length - 1), tr(x, y, s)]);
const showAt = (t: number): Key[] => [
  [0, op(0)],
  [t, op(0)],
  [t, op(1)],
];
const hideAt = (t: number): Key[] => [
  [0, op(1)],
  [t, op(1)],
  [t, op(0)],
];
/** Flips between on and off n+1 times from t0, starting on. */
function blink(t0: number, n: number, period: number, on = 1, off = 0, before = off): Key[] {
  const k: Key[] = [[0, op(before)]];
  let last = before;
  for (let i = 0; i <= n; i++) {
    const t = t0 + i * period;
    const v = i % 2 === 0 ? on : off;
    k.push([t, op(last)], [t, op(v)]);
    last = v;
  }
  return k;
}
function bob(t0: number, n: number, period: number, dy: number, dx = 0): Key[] {
  const k: Key[] = [
    [0, tr(0, 0)],
    [t0, tr(0, 0)],
  ];
  for (let i = 0; i < n; i++) {
    k.push([t0 + i * period + period / 2, tr(dx, dy)], [t0 + (i + 1) * period, tr(0, 0)]);
  }
  return k;
}
const burst = (t: number, from: string, to: string): Key[] => [
  [0, { opacity: 0, transform: from }],
  [t, { opacity: 0, transform: from }],
  [t, { opacity: 1, transform: from }],
  [t + 350, { opacity: 1, transform: to }],
  [t + 700, { opacity: 0, transform: to }],
];

/* ---------- Village ---------- */
const village: Record<LandingTier, Landing> = {
  // Over the rope into a family picnic; the fielder's dive is too late and the dog fetches it.
  four: {
    svg() {
      let s = px(0, 0, 90, 12, "#a9d8f2") + px(0, 12, 90, 6, "#e6f4fb");
      s += px(12, 3, 10, 2, "#fff") + px(14, 2, 5, 1, "#fff") + px(60, 5, 8, 1, "#fff");
      for (let x = 0; x < 90; x += 7)
        s += px(x + 1, 12, 5, 2, "#3f7d45") + px(x + 2, 11, 3, 1, "#346b3a");
      s += px(0, 14, 90, 6, "#3f7d45") + px(0, 20, 90, 35, "#6fb35e");
      s += px(0, 22, 90, 2, "#79bd67") + px(0, 28, 90, 3, "#79bd67") + px(0, 40, 90, 5, "#79bd67");
      let rope = px(0, 35, 90, 1, "#ffffff") + px(0, 36, 90, 1, "#d9e9cf");
      for (let x = 6; x < 90; x += 16)
        rope += px(x, 32, 1, 3, "#ffffff") + px(x + 1, 32, 2, 1, "#e04b3a");
      s += G("rope", rope);
      for (let y = 26; y < 31; y++) {
        for (let x = 52; x < 70; x += 2)
          s += px(x, y, 2, 1, (x / 2 + y) % 2 ? "#d84a3e" : "#fff6ea");
      }
      s += px(66, 23, 5, 4, "#a8743f") + px(66, 23, 5, 1, "#7a5229") + px(67, 22, 3, 1, "#7a5229");
      s += px(59, 20, 3, 3, "#e5b993") + px(59, 20, 3, 1, "#6b3e1f") + px(57, 19, 7, 1, "#f2e3a0");
      s += px(58, 18, 5, 1, "#f2e3a0") + px(58, 23, 5, 4, "#7fb3e8") + px(63, 26, 4, 1, "#e5b993");
      s += G("mumDown", px(57, 24, 1, 2, "#7fb3e8") + px(63, 24, 1, 2, "#7fb3e8"));
      s += G("mumUp", armsUp(58, 20, "#7fb3e8", "#e5b993"), HIDDEN);
      s += G(
        "dog",
        px(72, 27, 3, 3, "#9a6431") +
          px(74, 26, 1, 2, "#6b4220") +
          px(72, 28, 1, 1, "#222") +
          px(71, 29, 1, 1, "#222") +
          px(75, 29, 5, 2, "#9a6431") +
          px(75, 31, 1, 1, "#6b4220") +
          px(79, 31, 1, 1, "#6b4220") +
          G("tail", px(80, 28, 1, 2, "#9a6431")) +
          G("dogBall", px(69, 29, 2, 2, "#c0262d"), HIDDEN),
      );
      s += G(
        "fielder",
        px(13, 45, 1, 1, "#e5b993") +
          px(14, 45, 6, 1, "#ffffff") +
          px(20, 43, 3, 3, "#e5b993") +
          px(20, 42, 3, 1, "#2f6b45") +
          px(23, 43, 8, 3, "#ffffff") +
          px(31, 44, 6, 2, "#f3efe2") +
          px(37, 44, 1, 2, "#333"),
      );
      s += G(
        "dust",
        px(10, 44, 2, 1, "#d9e9cf") + px(8, 42, 1, 1, "#d9e9cf") + px(11, 41, 1, 1, "#d9e9cf"),
        HIDDEN,
      );
      return s + RED_BALL;
    },
    play(t) {
      const run: Pt[] = [
        [18, 58, 2.4],
        [30, 48, 2],
        [40, 40, 1.6],
        [48, 35, 1.3],
        [54, 32, 1.1],
        [60, 31, 1],
      ];
      t("ball", path(0, 1100, run));
      t("ball", hideAt(1850));
      t("rope", [
        [0, tr(0, 0)],
        [650, tr(0, 0)],
        [750, tr(0, -0.5)],
        [850, tr(0, 0.5)],
        [950, tr(0, 0)],
      ]);
      t("fielder", [
        [0, tr(-50, 0)],
        [200, tr(-50, 0)],
        [900, tr(0, 0)],
      ]);
      t("dust", [
        [0, op(0)],
        [900, op(0)],
        [900, op(1)],
        [1400, op(0)],
      ]);
      t("dog", [
        [0, tr(0, 0)],
        [1150, tr(0, 0)],
        [1250, tr(0, -1.5)],
        [1350, tr(0, 0)],
        [1850, tr(-11, 0)],
        [2050, tr(-11, 0)],
        [2500, tr(-6, 0)],
      ]);
      t("dogBall", showAt(1850));
      t("tail", bob(2000, 8, 180, -1));
      t("mumUp", showAt(1300));
      t("mumDown", hideAt(1300));
    },
  },
  // Into the teapot at the tea tent: the lid lands on the sponge and the dozing spectator wakes.
  six: {
    svg() {
      let s = px(0, 0, 90, 14, "#a9d8f2") + px(0, 14, 90, 12, "#e6f4fb");
      s += px(4, 3, 9, 2, "#fff") + px(6, 2, 4, 1, "#fff");
      s += px(0, 10, 10, 16, "#3f7d45") + px(1, 8, 7, 2, "#3f7d45");
      s += px(80, 9, 10, 17, "#3f7d45") + px(81, 7, 8, 2, "#346b3a");
      s += px(14, 12, 62, 14, "#fbf7ec") + px(38, 15, 14, 11, "#e9dfc6");
      s += px(38, 15, 1, 11, "#d8cdb0") + px(51, 15, 1, 11, "#d8cdb0");
      for (let r = 0; r < 6; r++) {
        for (let x = 20 - r; x < 70 + r; x++) {
          s += px(x, 6 + r, 1, 1, Math.floor(x / 3) % 2 ? "#c0262d" : "#fbf7ec");
        }
      }
      s += px(44, 4, 2, 2, "#c0262d") + px(45, 1, 1, 3, "#777") + px(46, 1, 3, 1, "#2f6b45");
      const bunting = ["#e04b3a", "#3a6fb5", "#f2c14e", "#2f6b45"];
      for (let x = 14, i = 0; x < 76; x += 3, i++) {
        const c = bunting[i % 4] ?? "#fff";
        s += px(x, 13, 2, 1, c) + px(x, 14, 1, 1, c);
      }
      s += px(0, 26, 90, 29, "#6fb35e") + px(0, 34, 90, 3, "#79bd67") + px(0, 46, 90, 5, "#79bd67");
      s += px(26, 30, 40, 3, "#ffffff") + px(26, 33, 40, 1, "#e3ddd0");
      s += px(28, 34, 1, 6, "#8a6a45") + px(63, 34, 1, 6, "#8a6a45");
      for (const x of [32, 37]) s += px(x, 28, 3, 2, "#ffffff") + px(x + 1, 28, 1, 1, "#3a6fb5");
      s += px(43, 26, 7, 4, "#f1ece0") + px(43, 28, 7, 1, "#3a6fb5") + px(50, 27, 2, 1, "#f1ece0");
      s += px(52, 26, 1, 1, "#f1ece0") + px(41, 26, 1, 3, "#f1ece0");
      s += G("lid", px(44, 25, 5, 1, "#f1ece0") + px(46, 24, 1, 1, "#3a6fb5"), CENTRE);
      s += px(55, 29, 8, 1, "#dddddd") + px(56, 26, 6, 3, "#f2d38a");
      s += px(56, 27, 6, 1, "#c0262d") + px(56, 26, 6, 1, "#fff6e0");
      const tea = [
        [44, 22],
        [48, 21],
        [42, 20],
        [50, 19],
        [46, 18],
        [45, 21],
        [47, 23],
      ];
      s += G(
        "splash",
        tea.map(([x = 0, y = 0], i) => px(x, y, 1, 1, i < 5 ? "#8a5a2b" : "#a87444")).join(""),
        HIDDEN,
      );
      s += px(4, 32, 1, 10, "#8a6a45") + px(13, 36, 1, 6, "#8a6a45") + px(5, 32, 7, 9, "#2f6b45");
      s += px(7, 32, 1, 9, "#fff") + px(10, 32, 1, 9, "#fff");
      s += px(6, 30, 3, 3, "#e5b993") + px(6, 29, 4, 1, "#6b5a45") + px(5, 33, 6, 5, "#c9b27a");
      s += px(11, 37, 5, 1, "#5b5b6b") + px(16, 36, 1, 2, "#333");
      let z = "";
      for (const [x, y] of [
        [12, 24],
        [15, 21],
      ] as const) {
        z += px(x, y, 2, 1, "#fff") + px(x + 1, y + 1, 1, 1, "#fff") + px(x, y + 2, 2, 1, "#fff");
      }
      s += G("zzz", z);
      s += G(
        "paper",
        px(5, 29, 5, 4, "#f4f1e8") + px(6, 30, 3, 1, "#999") + px(6, 32, 3, 1, "#999"),
        CENTRE,
      );
      s += px(73, 24, 3, 3, "#e5b993") + px(71, 23, 7, 1, "#f2e3a0") + px(73, 22, 3, 1, "#f2e3a0");
      s += px(72, 27, 5, 6, "#e88fb0") + px(73, 33, 1, 3, "#e5b993") + px(75, 33, 1, 3, "#e5b993");
      s += G(
        "ladyDown",
        px(71, 27, 1, 3, "#e88fb0") +
          px(71, 30, 1, 1, "#e5b993") +
          px(77, 27, 1, 3, "#e88fb0") +
          px(77, 30, 1, 1, "#e5b993"),
      );
      s += G("ladyUp", armsUp(72, 24, "#e88fb0", "#e5b993"), HIDDEN);
      return s + RED_BALL;
    },
    play(t) {
      const fall: Pt[] = [
        [84, -6, 2.6],
        [70, 4, 2.2],
        [58, 14, 1.8],
        [50, 20, 1.4],
        [46, 25, 1.1],
      ];
      t("ball", path(0, 900, fall));
      t("ball", hideAt(900));
      t("splash", [
        [0, { opacity: 0, transform: "translate(0,8px)" }],
        [900, { opacity: 0, transform: "translate(0,8px)" }],
        [900, { opacity: 1, transform: "translate(0,0)" }],
        [1300, { opacity: 1, transform: "translate(0,-12px)" }],
        [1600, { opacity: 0, transform: "translate(0,-4px)" }],
      ]);
      t("lid", [
        [0, tr(0, 0)],
        [900, tr(0, 0)],
        [1100, tr(3, -10, 1, 120)],
        [1300, tr(6, -15, 1, 240)],
        [1500, tr(10, -6, 1, 330)],
        [1650, tr(12, 0, 1, 360)],
      ]);
      t("paper", [
        [0, tr(0, 0)],
        [1000, tr(0, 0)],
        [1200, tr(1, -8, 1, -30)],
        [1400, tr(3, -13, 1, -80)],
        [1650, tr(6, -8, 1, -160)],
        [1900, tr(8, 6, 1, -200)],
      ]);
      t("zzz", hideAt(1000));
      t("ladyUp", showAt(1100));
      t("ladyDown", hideAt(1100));
    },
  },
  // Over the hedge into the village pond; two ducks take off and the third comes up wearing the ball.
  ootg: {
    svg() {
      let s = px(0, 0, 90, 16, "#a9d8f2") + px(14, 4, 10, 2, "#fff") + px(16, 3, 5, 1, "#fff");
      s += px(48, 6, 8, 1, "#fff") + px(70, 6, 8, 12, "#b8b2a3");
      s += px(73, 0, 2, 2, "#8d877a") + px(72, 2, 4, 2, "#8d877a") + px(71, 4, 6, 2, "#8d877a");
      s += px(73, 9, 2, 3, "#3a3a34") + px(73, 13, 2, 2, "#fff") + px(0, 16, 90, 3, "#9fcf8a");
      for (let x = 0; x < 90; x += 5) s += px(x, 17, 4, 1, "#2f6b3a");
      s += px(0, 18, 90, 5, "#2f6b3a") + px(20, 18, 6, 5, "#79bd67");
      s += px(20, 19, 6, 1, "#8a6a45") + px(20, 21, 6, 1, "#8a6a45");
      s += px(20, 18, 1, 5, "#8a6a45") + px(25, 18, 1, 5, "#8a6a45");
      s += px(0, 23, 90, 32, "#79bd67") + px(0, 27, 90, 3, "#6fb35e") + px(0, 48, 90, 4, "#6fb35e");
      for (let r = -8; r <= 8; r++) {
        const hw = Math.round(26 * Math.sqrt(Math.max(0, 1 - (r / 8.6) ** 2)));
        s += px(45 - hw, 40 + r, hw * 2, 1, r === -8 ? "#5d8a4a" : "#4a90c8");
      }
      s += px(30, 36, 6, 1, "#7fb7e0") + px(54, 43, 8, 1, "#7fb7e0") + px(38, 46, 4, 1, "#7fb7e0");
      s += px(25, 42, 2, 1, "#3f7d45") + px(62, 36, 3, 1, "#3f7d45") + px(58, 46, 2, 1, "#3f7d45");
      for (const x of [19, 21, 68, 70])
        s += px(x, 33, 1, 5, "#2f6b3a") + px(x, 32, 1, 2, "#6b4220");
      const duck = (x: number, y: number, n: string, extra = "") =>
        G(
          n,
          px(x, y + 1, 5, 2, "#ffffff") +
            px(x, y + 2, 5, 1, "#dfe6ea") +
            px(x + 4, y - 1, 2, 2, "#ffffff") +
            px(x + 6, y, 1, 1, "#f08a1c") +
            px(x + 5, y - 1, 1, 1, "#222") +
            G(`${n}Wing`, px(x + 1, y + 1, 3, 1, "#dfe6ea")) +
            extra,
        );
      s += duck(30, 37, "duck1") + duck(56, 41, "duck2");
      s += duck(40, 43, "duck3", G("duckBall", px(44, 40, 2, 2, "#c0262d"), HIDDEN));
      s += G(
        "ripple",
        px(41, 39, 9, 1, "#bfe0f5") +
          px(41, 41, 9, 1, "#bfe0f5") +
          px(40, 40, 1, 1, "#bfe0f5") +
          px(50, 40, 1, 1, "#bfe0f5"),
        `${HIDDEN} ${CENTRE}`,
      );
      s += G(
        "splash",
        px(44, 36, 1, 2, "#ffffff") +
          px(46, 35, 1, 3, "#ffffff") +
          px(42, 37, 1, 1, "#bfe0f5") +
          px(48, 36, 1, 1, "#bfe0f5") +
          px(40, 38, 1, 1, "#ffffff") +
          px(50, 38, 1, 1, "#ffffff") +
          px(45, 33, 1, 1, "#bfe0f5"),
        `${HIDDEN} ${BASE}`,
      );
      return s + RED_BALL;
    },
    play(t) {
      const arc: Pt[] = [
        [-6, -8, 3.2],
        [10, -4, 3],
        [25, 6, 2.4],
        [36, 20, 1.9],
        [43, 32, 1.5],
        [45, 40, 1.2],
      ];
      t("ball", path(0, 1000, arc));
      t("ball", hideAt(1000));
      t("splash", [
        [0, { opacity: 0, transform: "scale(.3)" }],
        [1000, { opacity: 0, transform: "scale(.3)" }],
        [1000, { opacity: 1, transform: "scale(.6)" }],
        [1250, { opacity: 1, transform: "scale(1.5)" }],
        [1600, { opacity: 0, transform: "scale(1.8)" }],
      ]);
      t("ripple", [
        [0, { opacity: 0, transform: "scale(.5)" }],
        [1050, { opacity: 0, transform: "scale(.5)" }],
        [1050, { opacity: 1, transform: "scale(.8)" }],
        [1700, { opacity: 0.8, transform: "scale(2.2)" }],
        [2300, { opacity: 0, transform: "scale(3)" }],
      ]);
      t("duck1", [
        [0, tr(0, 0)],
        [1050, tr(0, 0)],
        [1300, tr(-4, -6)],
        [1700, tr(-14, -18)],
        [2100, tr(-28, -32)],
      ]);
      t("duck2", [
        [0, tr(0, 0)],
        [1100, tr(0, 0)],
        [1350, tr(5, -6)],
        [1750, tr(16, -18)],
        [2150, tr(32, -34)],
      ]);
      t("duck1Wing", bob(1050, 6, 180, -2));
      t("duck2Wing", bob(1100, 6, 180, -2));
      t("duck3", [
        [0, { ...tr(0, 0), opacity: 1 }],
        [1050, { ...tr(0, 0), opacity: 1 }],
        [1250, { ...tr(0, 2), opacity: 0 }],
        [1800, { ...tr(1, 2), opacity: 0 }],
        [1800, { ...tr(1, 2), opacity: 1 }],
        [2000, { ...tr(1, 0), opacity: 1 }],
      ]);
      t("duckBall", showAt(1500));
    },
  },
};

/* ---------- Test ---------- */
const BLAZERS = ["#13284f", "#2c5a3a", "#efe3b8", "#6b1f2a", "#13284f", "#2c5a3a"];
const panama = (x: number, y: number) =>
  px(x, y, 5, 1, "#efe3b8") + px(x + 1, y - 1, 3, 1, "#efe3b8") + px(x + 1, y, 3, 1, "#13284f");

const test: Record<LandingTier, Landing> = {
  // Along the ground into the pavilion fence: papers down, polite applause, a panama raised.
  four: {
    svg() {
      let s = px(0, 0, 90, 4, "#8cc8ec") + px(0, 4, 90, 18, "#a4513f");
      s += px(0, 3, 90, 2, "#7d3a2d") + px(39, 0, 12, 4, "#a4513f") + px(38, 0, 14, 1, "#7d3a2d");
      s += px(43, 1, 4, 3, "#f4efe1") + px(45, 1, 1, 2, "#222");
      for (const y of [6, 12]) {
        for (let x = 3; x < 88; x += 6)
          s += px(x, y, 3, 4, "#f4efe1") + px(x + 1, y + 1, 1, 2, "#33404f");
      }
      s += px(0, 17, 90, 1, "#f4efe1");
      for (let x = 0; x < 90; x += 3) s += px(x, 18, 1, 3, "#f4efe1");
      s += px(0, 21, 90, 9, "#2c4a36") + px(0, 28, 90, 2, "#f4efe1");
      let apart = "";
      let together = "";
      [8, 20, 32, 52, 64, 76].forEach((x, i) => {
        const skin = SKIN[i % 4] ?? "#e5b993";
        const blazer = BLAZERS[i] ?? "#13284f";
        s += px(x + 1, 23, 3, 3, skin) + px(x, 26, 5, 3, blazer) + px(x + 2, 26, 1, 2, "#b3202a");
        if (i !== 3) s += panama(x, 22);
        apart += px(x - 1, 26, 1, 2, blazer) + px(x + 5, 26, 1, 2, blazer);
        together += px(x + 1, 25, 3, 1, skin);
      });
      s += G("hat", panama(52, 22));
      s += G("clapApart", apart) + G("clapTogether", together, HIDDEN);
      s += G(
        "paper",
        px(31, 23, 7, 5, "#f4f1e8") + px(32, 24, 5, 1, "#999") + px(32, 26, 5, 1, "#999"),
      );
      let fence = px(0, 30, 90, 2, "#ffffff");
      for (let x = 1; x < 90; x += 3) fence += px(x, 31, 1, 1, "#dfe8e0");
      s += G("fence", fence) + px(0, 32, 90, 23, "#3f8a4f");
      for (let x = 0; x < 90; x += 12) s += px(x, 32, 6, 23, "#4a9a5b");
      return s + px(0, 36, 90, 1, "#ffffff") + TEST_BALL;
    },
    play(t) {
      const run: Pt[] = [
        [84, 58, 2.4],
        [74, 48, 2],
        [64, 40, 1.6],
        [56, 34, 1.2],
        [52, 31.5, 1],
        [51, 33.5, 1],
      ];
      t("ball", path(0, 1000, run));
      t("fence", [
        [0, tr(0, 0)],
        [800, tr(0, 0)],
        [880, tr(0.5, 0)],
        [960, tr(-0.5, 0)],
        [1040, tr(0, 0)],
      ]);
      t("paper", [
        [0, tr(0, 0)],
        [1000, tr(0, 0)],
        [1200, tr(0, 4)],
      ]);
      t("clapTogether", blink(1100, 10, 180));
      t("clapApart", blink(1100, 10, 180, 0, 1));
      t("hat", [
        [0, tr(0, 0)],
        [1300, tr(0, 0)],
        [1500, tr(0, -3)],
        [2100, tr(0, -3)],
        [2300, tr(0, 0)],
      ]);
    },
  },
  // Onto the members' balcony and into a panama; the pigeons leave and the clock loses its minute.
  six: {
    svg() {
      let s =
        px(0, 0, 90, 44, "#a4513f") + px(0, 10, 90, 1, "#7d3a2d") + px(0, 11, 90, 1, "#c67a5f");
      s += px(38, 0, 14, 10, "#a4513f") + px(41, 1, 8, 8, "#7d3a2d") + px(42, 2, 6, 6, "#f4efe1");
      for (const [x, y] of [
        [44, 2],
        [47, 4],
        [44, 7],
        [42, 4],
      ] as const) {
        s += px(x + 0.5, y, 0.5, 0.5, "#333");
      }
      s += px(45, 5, 2, 0.5, "#222");
      s += G(
        "hand",
        px(45, 2.5, 0.5, 3, "#222"),
        `style="transform-origin:${45.25 * P}px ${5.25 * P}px"`,
      );
      for (let x = 3; x < 88; x += 8) {
        if (x < 36 || x > 52) s += px(x, 3, 4, 5, "#f4efe1") + px(x + 1, 4, 2, 4, "#33404f");
      }
      for (let x = 4; x < 88; x += 10) {
        s +=
          px(x, 13, 5, 7, "#f4efe1") +
          px(x + 1, 14, 3, 6, "#33404f") +
          px(x + 1, 13, 3, 1, "#f4efe1");
      }
      const pigeon = (x: number, n: string) =>
        G(
          n,
          px(x, 10, 3, 2, "#8d94a0") +
            px(x + 3, 9, 2, 2, "#8d94a0") +
            px(x + 3, 11, 1, 1, "#5e8f7a") +
            px(x + 5, 10, 1, 1, "#e0a060") +
            G(`${n}Wing`, px(x, 9, 3, 1, "#a8aeb8")),
        );
      s += pigeon(30, "pigeon1") + pigeon(58, "pigeon2") + px(0, 22, 90, 17, "#6e3427");
      let cheer = "";
      let rest = "";
      [10, 24, 44, 60, 74].forEach((x, i) => {
        const skin = SKIN[i % 4] ?? "#e5b993";
        const blazer = BLAZERS[i] ?? "#13284f";
        s += px(x + 1, 26, 3, 3, skin) + px(x, 29, 5, 5, blazer) + px(x + 2, 29, 1, 2, "#b3202a");
        if (i === 2) return;
        s += px(x, 25, 5, 1, "#efe3b8") + px(x + 1, 24, 3, 1, "#efe3b8");
        cheer += armsUp(x, 26, blazer, skin);
        rest += px(x - 1, 29, 1, 3, blazer) + px(x + 5, 29, 1, 3, blazer);
      });
      s += px(44, 26, 1, 1, "#6b3e1f") + G("rest", rest) + G("cheer", cheer, HIDDEN);
      s += G("catcherArms", armsUp(44, 26, "#13284f", "#e5b993"), HIDDEN);
      s += G("hat", panama(44, 25) + G("hatBall", px(46, 23, 2, 1, "#b3202a"), HIDDEN));
      s += px(0, 34, 90, 1, "#f4efe1");
      for (let x = 0; x < 90; x += 2) s += px(x, 35, 1, 4, "#f4efe1");
      s += px(0, 39, 90, 1, "#f4efe1") + px(0, 44, 90, 11, "#3f8a4f") + px(0, 47, 90, 1, "#ffffff");
      for (let x = 6; x < 90; x += 12) s += px(x, 48, 6, 7, "#4a9a5b");
      return s + TEST_BALL;
    },
    play(t) {
      const fall: Pt[] = [
        [8, -6, 2.6],
        [20, 0, 2.2],
        [32, 8, 1.8],
        [40, 14, 1.4],
        [46, 19, 1.1],
      ];
      t("ball", path(0, 900, fall));
      t("ball", hideAt(900));
      t("hat", [
        [0, tr(0, 0)],
        [450, tr(0, 0)],
        [650, tr(0, -5)],
        [900, tr(0, -5)],
        [990, tr(0, -4)],
        [1080, tr(0, -5)],
      ]);
      t("hatBall", showAt(900));
      t("catcherArms", [
        [0, { ...tr(0, 0), opacity: 0 }],
        [450, { ...tr(0, 0), opacity: 0 }],
        [450, { ...tr(0, 0), opacity: 1 }],
        [650, { ...tr(0, -2), opacity: 1 }],
      ]);
      t("cheer", showAt(1050));
      t("rest", hideAt(1050));
      t("pigeon1", [
        [0, tr(0, 0)],
        [700, tr(0, 0)],
        [1600, tr(-30, -20)],
      ]);
      t("pigeon2", [
        [0, tr(0, 0)],
        [750, tr(0, 0)],
        [1650, tr(30, -18)],
      ]);
      t("pigeon1Wing", bob(700, 5, 180, -1.5));
      t("pigeon2Wing", bob(750, 5, 180, -1.5));
      t("hand", [
        [0, { transform: "rotate(0deg)" }],
        [1000, { transform: "rotate(0deg)" }],
        [1800, { transform: "rotate(-360deg)" }],
      ]);
    },
  },
  // Over the pavilion onto the terraces next door: down a chimney, out comes soot, then the ball.
  ootg: {
    svg() {
      let s = px(0, 0, 90, 14, "#8cc8ec") + px(0, 14, 90, 6, "#b9dcf2");
      s += px(52, 4, 10, 2, "#fff") + px(54, 3, 5, 1, "#fff") + px(0, 18, 90, 6, "#7d8894");
      for (let x = 0; x < 90; x += 10) s += px(x + 2, 16, 6, 2, "#7d8894");
      for (let r = 0; r < 16; r++) s += px(0, 24 + r, 90, 1, r % 3 === 0 ? "#4b5360" : "#5b6573");
      s += px(0, 24, 90, 1, "#3f4652");
      for (const x of [14, 44, 72]) {
        s += px(x, 14, 6, 10, "#a4513f") + px(x, 17, 6, 1, "#7d3a2d") + px(x, 20, 6, 1, "#7d3a2d");
        s +=
          px(x - 1, 14, 8, 1, "#8a8f96") +
          px(x, 11, 2, 3, "#c8693a") +
          px(x + 4, 11, 2, 3, "#c8693a");
        s += px(x, 11, 2, 1, "#5a2f1d") + px(x + 4, 11, 2, 1, "#5a2f1d");
      }
      s += px(75, 4, 1, 7, "#444") + px(72, 5, 7, 1, "#444") + px(73, 7, 5, 1, "#444");
      s += G(
        "cat",
        px(58, 22, 5, 2, "#1e1e22") +
          px(62, 20, 3, 3, "#1e1e22") +
          px(62, 19, 1, 1, "#1e1e22") +
          px(64, 19, 1, 1, "#1e1e22") +
          px(63, 21, 1, 1, "#ffe600") +
          px(57, 20, 1, 3, "#1e1e22"),
      );
      s += px(0, 40, 90, 15, "#b0614a");
      for (let y = 42; y < 55; y += 2) s += px(0, y, 90, 0.5, "#9a5240");
      for (let x = 6; x < 90; x += 16) {
        s += px(x, 44, 6, 9, "#f4efe1") + px(x + 1, 45, 4, 3, "#33404f");
        s += px(x + 1, 49, 4, 3, "#33404f") + px(x, 48, 6, 1, "#f4efe1");
      }
      s += G(
        "sooty",
        px(39, 49, 4, 3, "#1a1a1a") +
          px(39, 47, 3, 3, "#3a3a3a") +
          px(39, 48, 1, 1, "#fff") +
          px(41, 48, 1, 1, "#fff") +
          px(43, 45, 1, 4, "#3a3a3a") +
          px(43, 43, 2, 2, "#b3202a"),
        HIDDEN,
      );
      s += G(
        "soot",
        px(44, 9, 3, 2, "#333") +
          px(46, 7, 3, 2, "#444") +
          px(43, 6, 2, 2, "#555") +
          px(47, 5, 2, 1, "#333") +
          px(45, 4, 2, 2, "#4a4a4a"),
        `${HIDDEN} ${BASE}`,
      );
      return s + TEST_BALL;
    },
    play(t) {
      const arc: Pt[] = [
        [-6, -8, 3.2],
        [10, -6, 2.8],
        [24, -2, 2.2],
        [36, 4, 1.7],
        [43, 9, 1.3],
        [45, 11.5, 1],
      ];
      t("ball", path(0, 1000, arc));
      t("ball", hideAt(1000));
      t("soot", [
        [0, { opacity: 0, transform: "translate(0,0) scale(.3)" }],
        [1500, { opacity: 0, transform: "translate(0,0) scale(.3)" }],
        [1500, { opacity: 1, transform: "translate(0,0) scale(.5)" }],
        [1800, { opacity: 1, transform: "translate(0,-10px) scale(1.2)" }],
        [2200, { opacity: 0.8, transform: "translate(8px,-26px) scale(1.7)" }],
        [2600, { opacity: 0, transform: "translate(16px,-40px) scale(2.2)" }],
      ]);
      t("cat", [
        [0, tr(0, 0)],
        [1550, tr(0, 0)],
        [1700, tr(0, -5)],
        [1850, tr(1, -6)],
        [2050, tr(2, 0)],
      ]);
      t("sooty", showAt(2200));
    },
  },
};

/* ---------- 100 ---------- */
const NEON = ["#ff2bd6", "#22d3ee", "#ffe600", "#7cff6b", "#ffffff"];
const STARS = [
  [10, 2],
  [24, 1],
  [33, 4],
  [58, 2],
  [66, 5],
  [50, 3],
  [18, 5],
] as const;

const hundred: Record<LandingTier, Landing> = {
  // Into the LED boards, which strobe 4s, and the flame cannons fire.
  four: {
    svg() {
      let s = px(0, 0, 90, 10, "#07021a");
      for (const [x, y] of STARS) s += px(x, y, 1, 1, "#fff");
      for (const x of [3, 86]) {
        s += px(x, 0, 1, 10, "#2a3358") + px(x - 2, 0, 5, 2, "#fffbe0");
        s += px(x - 3, 2, 7, 3, "#fff6c0", 'opacity=".2"');
      }
      s += px(0, 8, 90, 15, "#1a0f38") + G("crowd", crowd(0, 9, 90, 14, NEON, 0.3, 17));
      s += px(0, 23, 90, 6, "#0d0620");
      for (let x = 0; x < 90; x += 10) s += px(x, 23, 10, 6, (x / 10) % 2 ? "#22d3ee" : "#ff2bd6");
      for (let x = 0; x < 90; x += 2) s += px(x, 23, 1, 6, "rgba(0,0,0,.18)");
      let flash = px(0, 23, 90, 6, "#ffe600");
      for (let x = 4; x < 90; x += 10) flash += pixelText("4", x, 23.5, "#1d0b45");
      s += G("flash", flash, HIDDEN);
      for (const x of [7, 79]) s += px(x, 19, 4, 4, "#333") + px(x, 19, 4, 1, "#555");
      const flame = (x: number, n: string) =>
        G(
          n,
          px(x, 15, 4, 4, "#ff3d00") +
            px(x + 1, 11, 2, 8, "#ff7a00") +
            px(x + 1, 9, 1, 3, "#ffd000") +
            px(x + 2, 12, 1, 5, "#ffd000") +
            px(x + 1, 16, 2, 3, "#fff3a0"),
          'style="transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0)"',
        );
      s += flame(7, "flame1") + flame(79, "flame2");
      s += px(0, 29, 90, 26, "#1b6b3a") + px(0, 34, 90, 3, "#1f7a42");
      s += px(0, 42, 90, 4, "#1f7a42") + px(0, 51, 90, 4, "#1f7a42");
      return s + px(0, 32, 90, 1, "#e8fbff") + WHITE_BALL;
    },
    play(t) {
      const run: Pt[] = [
        [10, 58, 2.4],
        [22, 46, 1.9],
        [32, 38, 1.5],
        [40, 33, 1.2],
        [44, 30, 1],
        [43, 31, 1],
      ];
      t("ball", path(0, 900, run));
      t("flash", blink(850, 7, 130));
      const fire: Key[] = [
        [0, { transform: "scaleY(0)" }],
        [900, { transform: "scaleY(0)" }],
        [1000, { transform: "scaleY(1)" }],
        [1150, { transform: "scaleY(.7)" }],
        [1300, { transform: "scaleY(1.15)" }],
        [1450, { transform: "scaleY(.8)" }],
        [1600, { transform: "scaleY(1.1)" }],
        [1800, { transform: "scaleY(.6)" }],
        [1900, { transform: "scaleY(0)" }],
      ];
      t("flame1", fire);
      t("flame2", fire);
      t("crowd", [
        [0, { filter: "brightness(1)" }],
        [900, { filter: "brightness(1)" }],
        [900, { filter: "brightness(1.8)" }],
        [1600, { filter: "brightness(1.8)" }],
        [1600, { filter: "brightness(1)" }],
      ]);
    },
  },
  // Caught on a foam hand in the neon stand: phone torches, confetti and a 6 on the big screen.
  six: {
    svg() {
      let s = px(0, 0, 90, 40, "#1a0f38");
      for (let y = 4; y < 40; y += 5) s += px(0, y, 90, 1, "#2a1a55");
      s += crowd(0, 1, 90, 38, NEON, 0.18, 29);
      s += px(31, 1, 28, 13, "#2a3358") + px(32, 2, 26, 11, "#0a0a12");
      s += G(
        "idle",
        px(36, 6, 2, 2, "#22d3ee") + px(40, 6, 2, 2, "#22d3ee") + px(44, 6, 2, 2, "#22d3ee"),
      );
      s += G("screen6", pixelText("6", 42, 2.5, "#ff2bd6", 2), HIDDEN);
      s += G("phones", scatter(26, 2, 15, 86, 22, ["#fffbe0", "#ffffff"], 5), HIDDEN);
      s += G(
        "fan",
        px(43, 24, 5, 4, "#1a0f38") +
          px(44, 24, 3, 3, "#c99a76") +
          px(44, 24, 3, 1, "#3a2418") +
          px(43, 27, 5, 7, "#22d3ee") +
          px(47, 22, 2, 6, "#ffe600") +
          px(46, 15, 6, 8, "#ffe600") +
          px(47, 11, 2, 4, "#ffe600") +
          px(51, 17, 2, 2, "#ffe600") +
          px(46, 15, 6, 1, "#ffd000") +
          G("fanBall", px(47, 9, 2, 2, "#ffffff"), HIDDEN),
      );
      s += G("confetti", scatter(60, 0, -40, 90, 40, NEON.slice(0, 4), 41), HIDDEN);
      s += px(0, 40, 90, 2, "#ff2bd6") + px(0, 42, 90, 1, "#22d3ee");
      return s + px(0, 43, 90, 12, "#1b6b3a") + px(0, 47, 90, 3, "#1f7a42") + WHITE_BALL;
    },
    play(t) {
      const fall: Pt[] = [
        [84, -6, 2.6],
        [72, 0, 2.2],
        [62, 5, 1.8],
        [54, 8, 1.4],
        [48, 10, 1.1],
      ];
      t("ball", path(0, 900, fall));
      t("ball", hideAt(900));
      t("fanBall", showAt(900));
      t("fan", [
        [0, tr(0, 0)],
        [700, tr(0, 0)],
        [850, tr(0, -1)],
        [950, tr(0, 1)],
        [1050, tr(0, 0)],
        [1200, tr(0, -2)],
        [1350, tr(0, 0)],
        [1500, tr(0, -2)],
        [1650, tr(0, 0)],
      ]);
      t("screen6", blink(1000, 6, 150));
      t("idle", hideAt(1000));
      t("phones", [
        [0, op(0)],
        [1100, op(0)],
        [1100, op(0.5)],
        [1300, op(1)],
        [1500, op(0.6)],
        [1700, op(1)],
        [1900, op(0.7)],
        [2100, op(1)],
      ]);
      t("confetti", [
        [0, { opacity: 0, transform: "translate(0,0)" }],
        [1000, { opacity: 0, transform: "translate(0,0)" }],
        [1000, { opacity: 1, transform: "translate(0,0)" }],
        [3000, { opacity: 1, transform: "translate(0,200px)" }],
      ]);
    },
  },
  // Out into the city: it knocks the lights out of a neon sign, then the fireworks go up.
  ootg: {
    svg() {
      let s =
        px(0, 0, 90, 12, "#07021a") + px(0, 12, 90, 10, "#140838") + px(0, 22, 90, 10, "#22104f");
      for (const [x, y] of STARS) s += px(x + 2, y + 1, 1, 1, "#fff");
      s += px(80, 3, 4, 4, "#fff6c0") + px(82, 3, 2, 3, "#07021a");
      s +=
        px(4, 6, 1, 22, "#2a3358") +
        px(2, 5, 5, 2, "#fffbe0") +
        px(1, 7, 7, 3, "#fff6c0", 'opacity=".2"');
      s += px(0, 22, 18, 22, "#1a0f38") + crowd(0, 23, 18, 6, NEON.slice(0, 3), 0.3, 8);
      const r = rng(77);
      const buildings = [
        [18, 16, 10, "#241446"],
        [28, 22, 8, "#2d1a55"],
        [36, 10, 12, "#1f1140"],
        [48, 18, 10, "#2a1850"],
        [58, 14, 12, "#211243"],
        [70, 20, 8, "#2d1a55"],
        [78, 12, 12, "#1f1140"],
      ] as const;
      for (const [x, y, w, c] of buildings) {
        s += px(x, y, w, 44 - y, c);
        for (let yy = y + 2; yy < 42; yy += 3) {
          for (let xx = x + 1; xx < x + w - 1; xx += 2) {
            if (r() < 0.45) s += px(xx, yy, 1, 1, r() < 0.7 ? "#ffe08a" : "#22d3ee");
          }
        }
      }
      s += px(52, 24, 34, 9, "#ff2bd6") + px(53, 25, 32, 7, "#1d0b45");
      s += G("sign", pixelText("NOODLES", 55, 26, "#ff2bd6"));
      s += G("signOff", px(58, 26, 8, 5, "#1d0b45"), HIDDEN);
      s += G(
        "sparks",
        px(60, 33, 1, 1, "#ffe600") +
          px(63, 34, 1, 1, "#fff3a0") +
          px(58, 35, 1, 1, "#ffe600") +
          px(65, 33, 1, 1, "#ffe600") +
          px(61, 36, 1, 1, "#fff3a0"),
        HIDDEN,
      );
      s += px(0, 44, 90, 11, "#1c1830") + px(0, 44, 90, 1, "#3d3660");
      for (let x = 2; x < 90; x += 10) s += px(x, 50, 4, 1, "#ffe08a");
      const firework = (cx: number, cy: number, c: string, n: string) => {
        let f = px(cx, cy, 1, 1, c);
        for (const dx of [-1, 0, 1]) {
          for (const dy of [-1, 0, 1]) {
            if (dx || dy)
              f += px(cx + dx * 3, cy + dy * 3, 1, 1, c) + px(cx + dx * 5, cy + dy * 5, 1, 1, c);
          }
        }
        return G(n, f, `${HIDDEN} ${CENTRE}`);
      };
      s += firework(22, 8, "#ff2bd6", "fw1") + firework(42, 5, "#22d3ee", "fw2");
      s += firework(32, 13, "#ffe600", "fw3") + firework(68, 6, "#7cff6b", "fw4");
      return s + WHITE_BALL;
    },
    play(t) {
      const flight: Pt[] = [
        [-4, 40, 2.6],
        [10, 14, 2.2],
        [26, 2, 1.8],
        [42, 6, 1.5],
        [54, 16, 1.3],
        [61, 27, 1.1],
      ];
      const rebound: Pt[] = [
        [61, 27, 1.1],
        [64, 36, 1.1],
        [66, 47, 1.2],
        [70, 44, 1.2],
        [74, 48, 1.2],
        [80, 48, 1.2],
      ];
      t("ball", [...path(0, 1000, flight), ...path(1000, 800, rebound).slice(1)]);
      t("sign", blink(1000, 4, 100, 1, 0.15, 1));
      t("signOff", showAt(1550));
      t("sparks", [
        [0, { opacity: 0, transform: "translate(0,0)" }],
        [1000, { opacity: 0, transform: "translate(0,0)" }],
        [1000, { opacity: 1, transform: "translate(0,0)" }],
        [1700, { opacity: 0, transform: "translate(0,40px)" }],
      ]);
      for (const [n, at] of [
        ["fw1", 1500],
        ["fw2", 1750],
        ["fw3", 2000],
        ["fw4", 2250],
      ] as const) {
        t(n, burst(at, "scale(.3)", "scale(1.2)"));
      }
    },
  },
};

/* ---------- One Day ---------- */
const FANS = ["#1e5eff", "#ffcc00", "#ffffff", "#ff7a3d", "#7dff9a"];
const sunset = (to: number) =>
  px(0, 0, 90, 3, "#3b5ba8") + px(0, 3, 90, 3, "#7d6fb8") + px(0, 6, 90, to - 6, "#e9876a");

const oneday: Record<LandingTier, Landing> = {
  // Over the rope at sunset: the ball kid gets up to take it and the stand does a Mexican wave.
  four: {
    svg() {
      let s =
        sunset(10) +
        px(70, 5, 6, 4, "#ffd27a") +
        px(0, 9, 90, 1, "#1d2436") +
        px(0, 10, 90, 15, "#3d4a63");
      for (let c = 0; c < 9; c++) s += G(`wave${c}`, crowd(c * 10, 10, 10, 15, FANS, 0.5, 40 + c));
      for (let x = 0; x < 90; x += 9) {
        s += px(x, 25, 9, 4, (x / 9) % 2 ? "#1e5eff" : "#ffcc00") + px(x, 27, 9, 1, "#ffffff");
      }
      s += px(0, 29, 90, 26, "#3a8f4a") + px(0, 31, 90, 2, "#44a056") + px(0, 38, 90, 4, "#44a056");
      s += px(0, 48, 90, 5, "#44a056") + px(0, 34, 90, 1, "#ffffff");
      s += G(
        "kid",
        px(66, 30, 5, 3, "#1e5eff") +
          px(66, 33, 5, 1, "#0b2a7a") +
          px(67, 27, 3, 3, "#c99a76") +
          px(66, 26, 5, 1, "#ffcc00") +
          px(67, 25, 3, 1, "#ffcc00") +
          G("kidDown", px(65, 30, 1, 2, "#c99a76") + px(71, 30, 1, 2, "#c99a76")) +
          G(
            "kidUp",
            px(65, 24, 1, 6, "#c99a76") +
              px(71, 24, 1, 6, "#c99a76") +
              px(66, 22, 5, 2, "#ffffff") +
              px(67, 22, 3, 1, "#e6e6ee"),
            HIDDEN,
          ),
      );
      return s + WHITE_BALL;
    },
    play(t) {
      const run: Pt[] = [
        [14, 58, 2.4],
        [28, 48, 2],
        [42, 40, 1.6],
        [54, 35, 1.3],
        [62, 32, 1.1],
        [64, 30.5, 1],
      ];
      t("ball", path(0, 1000, run));
      t("ball", hideAt(1300));
      t("kid", [
        [0, tr(0, 0)],
        [1000, tr(0, 0)],
        [1150, tr(-1, -1)],
        [1300, tr(-1, -3)],
      ]);
      t("kidUp", showAt(1300));
      t("kidDown", hideAt(1300));
      for (let c = 0; c < 9; c++) {
        const k: Key[] = [[0, tr(0, 0)]];
        for (const start of [900, 2000]) {
          const at = start + c * 110;
          k.push([at, tr(0, 0)], [at + 180, tr(0, -2)], [at + 360, tr(0, 0)]);
        }
        t(`wave${c}`, k);
      }
    },
  },
  // Into the fancy-dress stand: a banana catches it, the pineapple jumps and beach balls bounce.
  six: {
    svg() {
      let s = sunset(8) + px(0, 7, 90, 2, "#1d2436") + px(0, 9, 90, 36, "#3d4a63");
      for (let y = 14; y < 45; y += 6) s += px(0, y, 90, 1, "#2f3a50");
      s += crowd(0, 9, 90, 36, FANS, 0.25, 61);
      s +=
        px(29, 22, 9, 18, "#3d4a63") +
        px(49, 20, 11, 20, "#3d4a63") +
        px(67, 24, 10, 16, "#3d4a63");
      s += G(
        "banana",
        px(31, 24, 4, 16, "#ffd84a") +
          px(30, 27, 1, 12, "#ffd84a") +
          px(35, 22, 1, 4, "#ffd84a") +
          px(35, 21, 1, 1, "#6b4a1a") +
          px(31, 24, 4, 1, "#f0c030") +
          px(32, 27, 2, 3, "#c99a76") +
          px(32, 28, 1, 1, "#222") +
          px(33, 28, 1, 1, "#222") +
          G("bananaDown", px(29, 30, 1, 5, "#ffd84a") + px(36, 30, 1, 5, "#ffd84a")) +
          G("bananaUp", px(29, 20, 1, 8, "#ffd84a") + px(36, 20, 1, 8, "#ffd84a"), HIDDEN) +
          G("bananaBall", px(32, 17, 2, 2, "#ffffff"), HIDDEN),
      );
      let pine = px(51, 26, 7, 12, "#e0a82a");
      for (let y = 27; y < 38; y += 2) {
        for (let x = 52 + (y % 4 === 1 ? 1 : 0); x < 58; x += 2) pine += px(x, y, 1, 1, "#b07a12");
      }
      pine +=
        px(52, 21, 1, 5, "#3f9a3f") + px(54, 20, 1, 6, "#3f9a3f") + px(56, 21, 1, 5, "#3f9a3f");
      pine += px(53, 23, 3, 3, "#2f7a2f") + px(53, 29, 3, 2, "#c99a76");
      pine += px(53, 29, 1, 1, "#222") + px(55, 29, 1, 1, "#222");
      s += G("pineapple", pine);
      s +=
        px(71, 26, 3, 3, "#8a5a3a") +
        px(71, 27, 3, 1, "#222") +
        px(70, 29, 5, 9, "#1e5eff") +
        px(72, 31, 1, 1, "#ffcc00");
      s += G(
        "cape",
        px(69, 29, 1, 10, "#d6303a") +
          px(75, 29, 1, 10, "#d6303a") +
          px(68, 33, 1, 6, "#d6303a") +
          px(76, 33, 1, 6, "#d6303a"),
      );
      const beachBall = (x: number, y: number, n: string) =>
        G(
          n,
          px(x, y, 3, 3, "#ffffff") +
            px(x, y, 1, 3, "#ff3d6a") +
            px(x + 2, y, 1, 3, "#1e5eff") +
            px(x + 1, y, 1, 1, "#ffcc00"),
        );
      s += beachBall(12, 14, "beach1") + beachBall(44, 12, "beach2") + beachBall(82, 16, "beach3");
      s += px(0, 44, 90, 2, "#ffcc00") + px(0, 46, 90, 9, "#3a8f4a") + px(0, 49, 90, 3, "#44a056");
      return s + WHITE_BALL;
    },
    play(t) {
      const fall: Pt[] = [
        [86, -6, 2.6],
        [66, 0, 2.2],
        [50, 7, 1.8],
        [40, 13, 1.4],
        [33, 18, 1.1],
      ];
      t("ball", path(0, 900, fall));
      t("ball", hideAt(900));
      t("bananaUp", showAt(600));
      t("bananaDown", hideAt(600));
      t("bananaBall", showAt(900));
      t("banana", [
        [0, tr(0, 0)],
        [900, tr(0, 0)],
        [1000, tr(0, 1)],
        [1100, tr(0, 0)],
        [1300, tr(0, -2)],
        [1500, tr(0, 0)],
        [1700, tr(0, -2)],
        [1900, tr(0, 0)],
      ]);
      t("pineapple", bob(950, 4, 380, -3));
      t("cape", bob(950, 6, 240, 0, 1));
      t("beach1", bob(900, 3, 600, -7));
      t("beach2", bob(1100, 3, 600, -8));
      t("beach3", bob(1000, 3, 600, -6));
    },
  },
  // Into the car park: off a car roof, hazards flashing, and a seagull flies off with it.
  ootg: {
    svg() {
      let s = px(0, 0, 90, 4, "#3b5ba8") + px(0, 4, 90, 4, "#7d6fb8") + px(0, 8, 90, 6, "#e9876a");
      s += px(0, 14, 90, 14, "#f6c88e");
      s += px(62, 14, 8, 5, "#ffd27a") + px(63, 13, 6, 1, "#ffd27a") + px(0, 6, 34, 22, "#8b8f9c");
      for (let x = 0; x < 34; x += 6) s += px(x, 6, 1, 22, "#767a87");
      s += px(0, 6, 34, 1, "#5c606b") + px(30, 0, 1, 6, "#1d2436") + px(28, 0, 5, 1, "#fffbe0");
      s +=
        px(72, 16, 18, 12, "#3f6b45") + px(74, 14, 6, 2, "#3f6b45") + px(82, 13, 6, 3, "#355e3c");
      s += px(0, 28, 90, 27, "#4a4a55");
      for (let x = 4; x < 90; x += 16) s += px(x, 30, 1, 10, "#e8e8e8");
      s += px(0, 41, 90, 1, "#e8e8e8");
      const car = (x: number, y: number, c: string, n: string) =>
        G(
          n,
          px(x, y + 3, 14, 4, c) +
            px(x + 3, y, 8, 3, c) +
            px(x + 4, y + 1, 3, 2, "#bfe3f5") +
            px(x + 8, y + 1, 2, 2, "#bfe3f5") +
            px(x + 2, y + 7, 3, 2, "#222") +
            px(x + 9, y + 7, 3, 2, "#222") +
            px(x, y + 4, 1, 1, "#fff6c0") +
            px(x + 13, y + 4, 1, 1, "#ff3d3d"),
        );
      s +=
        car(6, 31, "#ffcc00", "car1") +
        car(36, 31, "#1e5eff", "car2") +
        car(66, 31, "#d6303a", "car3");
      s += G(
        "hazards",
        px(35, 34, 3, 3, "#ffb74a", 'opacity=".5"') +
          px(48, 34, 3, 3, "#ffb74a", 'opacity=".5"') +
          px(36, 35, 1, 1, "#ff9a1a") +
          px(49, 35, 1, 1, "#ff9a1a"),
        HIDDEN,
      );
      s += G(
        "gull",
        px(78, 43, 5, 3, "#ffffff") +
          px(82, 41, 2, 2, "#ffffff") +
          px(84, 42, 1, 1, "#ffcc00") +
          px(83, 41, 1, 1, "#222") +
          px(77, 44, 1, 1, "#9aa3ad") +
          px(79, 46, 1, 1, "#ffcc00") +
          px(81, 46, 1, 1, "#ffcc00") +
          G("gullWing", px(79, 43, 3, 1, "#9aa3ad")) +
          G("gullBall", px(84, 43, 2, 2, "#ffffff") + px(84, 44, 2, 1, "#c9c9d0"), HIDDEN),
      );
      return s + WHITE_BALL;
    },
    play(t) {
      const fall: Pt[] = [
        [-6, -6, 3],
        [10, -2, 2.6],
        [24, 6, 2.1],
        [34, 16, 1.7],
        [41, 25, 1.4],
        [43, 30, 1.3],
      ];
      const bounces: Pt[] = [
        [43, 30, 1.3],
        [49, 22, 1.3],
        [54, 26, 1.25],
        [58, 36, 1.2],
        [60, 44, 1.2],
        [64, 41, 1.2],
        [68, 44, 1.1],
        [71, 44, 1.1],
      ];
      t("ball", [...path(0, 950, fall), ...path(950, 1000, bounces).slice(1)]);
      t("ball", hideAt(2600));
      t("car2", [
        [0, tr(0, 0)],
        [950, tr(0, 0)],
        [950, tr(0, 1)],
        [1100, tr(0, 0)],
      ]);
      t("hazards", blink(1000, 12, 200));
      t("gull", [
        [0, tr(0, 0)],
        [2000, tr(0, 0)],
        [2600, tr(-11, 0)],
        [2800, tr(-11, 0)],
        [3100, tr(-6, -10)],
        [3500, tr(6, -26)],
        [3900, tr(20, -46)],
      ]);
      t("gullBall", showAt(2600));
      t("gullWing", bob(2800, 6, 180, -2));
    },
  },
};

export const LANDINGS: Record<ThemeKey, Record<LandingTier, Landing>> = {
  village,
  test,
  hundred,
  oneday,
};
