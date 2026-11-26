import type { ThemeKey } from "../storage";

export interface ScenePalette {
  screen: string;
  grass: string;
  stripe: string;
  pitch: string;
  kit: string;
  kit2: string;
  helmet: string;
  skin: string;
  ball: string;
}

export interface Theme {
  label: string;
  blurb: string;
  swatch: [string, string];
  scene: ScenePalette;
}

// No real competition, team or brand names, logos or colour schemes (see CRITERIA.md).
export const THEMES: Record<ThemeKey, Theme> = {
  hundred: {
    label: "100",
    blurb: "Under the lights",
    swatch: ["#1d0b45", "#ff2bd6"],
    scene: {
      screen: "#111",
      grass: "#1b6b3a",
      stripe: "#1f7a42",
      pitch: "#b39f6c",
      kit: "#22d3ee",
      kit2: "#ff2bd6",
      helmet: "#111",
      skin: "#c99a76",
      ball: "#ffffff",
    },
  },
  village: {
    label: "Village",
    blurb: "Sunday afternoon",
    swatch: ["#2f6b45", "#f6f1e4"],
    scene: {
      screen: "#ffffff",
      grass: "#6fb35e",
      stripe: "#79bd67",
      pitch: "#e2cf98",
      kit: "#ffffff",
      kit2: "#f3efe2",
      helmet: "#2f6b45",
      skin: "#e5b993",
      ball: "#c0262d",
    },
  },
  test: {
    label: "Test",
    blurb: "Don your whites",
    swatch: ["#13284f", "#f7f3e6"],
    scene: {
      screen: "#ffffff",
      grass: "#3f8a4f",
      stripe: "#4a9a5b",
      pitch: "#d1bb85",
      kit: "#f7f3e6",
      kit2: "#f7f3e6",
      helmet: "#13284f",
      skin: "#d8a982",
      ball: "#b3202a",
    },
  },
  oneday: {
    label: "One Day",
    blurb: "Colours on",
    swatch: ["#1b3a8f", "#f0b429"],
    scene: {
      screen: "#111",
      grass: "#3a8f4a",
      stripe: "#44a056",
      pitch: "#cdb47a",
      kit: "#2f5fd0",
      kit2: "#f0b429",
      helmet: "#0d2463",
      skin: "#c99a76",
      ball: "#ffffff",
    },
  },
};
