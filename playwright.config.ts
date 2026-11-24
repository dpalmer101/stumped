import { defineConfig, devices } from "@playwright/test";

// Not 4173: that is where a stable preview for phones usually runs, and reusing it would test a stale build.
const PORT = 4300;
const ORIGIN = `http://localhost:${PORT}`;

// Headless browsers still play sound on a Mac, so every test starts with the game muted.
const muted = {
  cookies: [],
  origins: [
    {
      origin: ORIGIN,
      localStorage: [
        {
          name: "stumped",
          value: JSON.stringify({
            version: 1,
            theme: "hundred",
            muted: true,
            seenHelp: true,
            innings: null,
            history: {},
          }),
        },
      ],
    },
  ],
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `${ORIGIN}/stumped/`,
    trace: "on-first-retry",
    storageState: muted,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--mute-audio"] } },
    },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    // Test the production build, served under the same base path as GitHub Pages.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `${ORIGIN}/stumped/`,
    reuseExistingServer: false,
  },
});
