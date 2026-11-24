import { describe, expect, it } from "vitest";
import { iosInstallSteps } from "../../src/ui/app";

const ios =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";

describe("iPhone install steps", () => {
  it.each([
    ["Safari", `${ios} Version/18.0 Mobile/15E148 Safari/604.1`, "in Safari"],
    ["Chrome", `${ios} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1`, "Chrome's address bar"],
    ["Firefox", `${ios} FxiOS/133.0 Mobile/15E148 Safari/605.1.15`, "Firefox's menu"],
    ["Edge", `${ios} EdgiOS/131.0.2903.68 Mobile/15E148 Safari/605.1.15`, "Edge's menu"],
    ["Opera", `${ios} OPiOS/5.1.0 Mobile/15E148 Safari/9537.53`, "your browser's"],
    ["the Google app", `${ios} GSA/350.0.711373442 Mobile/15E148 Safari/604.1`, "your browser's"],
    ["DuckDuckGo", `${ios} Version/18.0 Mobile/15E148 Ddg/18.0 Safari/604.1`, "your browser's"],
    ["Instagram", `${ios} Mobile/15E148 Instagram 350.0.0.0 Safari/604.1`, "your browser's"],
  ])("name the right place in %s", (_name, ua, expected) => {
    expect(iosInstallSteps(ua)).toContain(expected);
    expect(iosInstallSteps(ua)).toContain("Add to Home Screen");
  });

  it("never mentions Safari in another browser", () => {
    expect(iosInstallSteps(`${ios} CriOS/131.0 Mobile/15E148 Safari/604.1`)).not.toContain(
      "Safari",
    );
  });
});
