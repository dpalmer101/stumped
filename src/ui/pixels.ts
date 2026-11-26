// 8-bit scenes: a 90×55 grid of 4px "pixels" in a 360×220 viewBox.
export const P = 4;

export const px = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
  `<rect x="${x * P}" y="${y * P}" width="${w * P}" height="${h * P}" fill="${fill}" ${extra}/>`;

// Seeded so crowds look the same on every visit.
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function crowd(
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

export function scatter(
  n: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  colours: string[],
  seed: number,
) {
  const r = rng(seed);
  let s = "";
  for (let i = 0; i < n; i++) {
    const c = colours[Math.floor(r() * colours.length)] ?? "#fff";
    s += px(x0 + Math.floor(r() * w), y0 + Math.floor(r() * h), 1, 1, c);
  }
  return s;
}

/** A 12×12 pixel cricket ball on its way down, speed lines trailing in `trail`. */
export function bowledBall(trail: string) {
  let s = "";
  for (const [x, y, w] of [
    [0, 3, 4],
    [1, 6, 5],
    [0, 9, 4],
  ] as const) {
    s += px(x, y, w, 1, trail);
  }
  const left = 7;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if ((x - 5.5) ** 2 + (y - 5.5) ** 2 > 36) continue;
      // The seam runs corner to corner, stitched on both sides.
      const d = x + y;
      const fill =
        d === 11
          ? "#f3e6cf"
          : (d === 10 || d === 12) && y % 2 === 0
            ? "#e0c9a6"
            : (y === 3 && (x === 3 || x === 4)) || (x === 3 && y === 4)
              ? "#e45a5f"
              : d > 15
                ? "#8a121a"
                : "#c21f29";
      s += px(left + x, y, 1, 1, fill);
    }
  }
  return `<svg class="pixel-ball" viewBox="0 0 ${19 * P} ${12 * P}" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
}

const GLYPHS: Record<string, string[]> = {
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  L: ["100", "100", "100", "100", "111"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  S: ["011", "100", "010", "001", "110"],
  "4": ["101", "101", "111", "001", "001"],
  "6": ["011", "100", "110", "101", "010"],
};

/** 3×5 pixel lettering, for the few signs and screens in the scenes. */
export function pixelText(str: string, x: number, y: number, fill: string, scale = 1) {
  let s = "";
  let cx = x;
  for (const ch of str) {
    (GLYPHS[ch] ?? []).forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit === "1") s += px(cx + rx * scale, y + ry * scale, scale, scale, fill);
      });
    });
    cx += 4 * scale;
  }
  return s;
}
