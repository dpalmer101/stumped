import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI", () => {
  it("runs e2e in the Playwright image matching the installed Playwright", () => {
    // A mismatched image has the wrong browser builds, and every e2e test fails to launch.
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, { version: string }>;
    };
    const installed = lock.packages["node_modules/@playwright/test"]?.version;
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const tag = ci.match(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/)?.[1];
    expect(installed).toBeDefined();
    expect(tag).toBe(installed);
  });
});
