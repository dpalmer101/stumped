import basicSsl from "@vitejs/plugin-basic-ssl";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Ties the page to its deploy, so an open page can tell a newer one has gone out (App.checkForUpdate).
const BUILD_ID = process.env.GITHUB_SHA ?? String(Date.now());
const versionFile: Plugin = {
  name: "version-file",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: JSON.stringify({ build: BUILD_ID }),
    });
  },
};

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site from /<repo>/.
  base: "/stumped/",
  // `--mode https` serves over https with a self-signed certificate: phones only allow the share
  // sheet and clipboard on secure pages, so this is how to try them over local wifi.
  plugins: [versionFile, ...(mode === "https" ? [basicSsl()] : [])],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
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
