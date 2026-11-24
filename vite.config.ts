import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site from /<repo>/.
  base: "/stumped/",
  // `--mode https` serves over https with a self-signed certificate: phones only allow the share
  // sheet and clipboard on secure pages, so this is how to try them over local wifi.
  plugins: mode === "https" ? [basicSsl()] : [],
  // Listen on all interfaces so the game can be tried from a phone on the same wifi.
  server: {
    host: true,
    // The content tools rewrite question files after every question; don't reload the page each
    // time. Restart the dev server to pick up new question data.
    watch: { ignored: ["**/src/data/questions/**", "**/content-reports/**"] },
  },
  preview: { host: true },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
}));
