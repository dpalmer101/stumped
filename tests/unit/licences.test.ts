import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Keep in step with docs/CRITERIA.md, "Content and licensing".
const ALLOWED = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "MPL-2.0",
  "CC0-1.0",
  "Unlicense",
]);

/** True when an SPDX expression can be satisfied using allowed licences only. */
function allowed(expr: string): boolean {
  const clean = expr.replace(/[()]/g, "").trim();
  if (clean.includes(" OR ")) return clean.split(" OR ").some((part) => allowed(part));
  if (clean.includes(" AND ")) return clean.split(" AND ").every((part) => allowed(part));
  return ALLOWED.has(clean);
}

describe("dependency licences", () => {
  it("parses SPDX expressions", () => {
    expect(allowed("MIT OR Apache-2.0")).toBe(true);
    expect(allowed("(MIT AND GPL-3.0)")).toBe(false);
    expect(allowed("GPL-3.0 OR MIT")).toBe(true);
    expect(allowed("BUSL-1.1")).toBe(false);
  });

  it("every installed package has an allowed licence", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, { license?: string }>;
    };
    const bad = Object.entries(lock.packages)
      .filter(([path]) => path !== "")
      .filter(([, pkg]) => !pkg.license || !allowed(pkg.license))
      .map(([path, pkg]) => `${path}: ${pkg.license ?? "no licence"}`);
    expect(bad).toEqual([]);
  });
});
