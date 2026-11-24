import { describe, expect, it } from "vitest";
import { createMatcher, editDistance, generatedForms, normalise } from "../../src/engine/match";
import type { Answer, Question } from "../../src/engine/types";
import { groundsQuestion, playersQuestion } from "./fixtures";

describe("normalise", () => {
  it.each([
    ["Lord's", "lords"],
    ["  LORDS  ", "lords"],
    ["The Oval", "oval"],
    ["M.S. Dhoni", "msdhoni"],
    ["M S Dhoni", "msdhoni"],
    ["Trinidad & Tobago", "trinidadandtobago"],
    ["Zaheer Abbás", "zaheerabbas"],
    ["the", "the"],
    ["Søren Ørsted", "sorenorsted"],
    ["Łukasz Wiśniewski", "lukaszwisniewski"],
    ["Straße & Ærø", "strasseandaero"],
    ["D’Oliveira", "doliveira"],
    ["Border–Gavaskar Trophy", "bordergavaskartrophy"],
    ["  Jos   Buttler!!  ", "josbuttler"],
    ["Muttiah Muralitharan (SL)", "muttiahmuralitharansl"],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(normalise(input)).toBe(expected);
  });
});

describe("editDistance", () => {
  it("counts a transposition as one edit", () => {
    expect(editDistance("lrods", "lords")).toBe(1);
  });
  it("counts insertions and substitutions", () => {
    expect(editDistance("oldtrafod", "oldtrafford")).toBe(2);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("createMatcher", () => {
  const grounds = createMatcher(groundsQuestion);
  const players = createMatcher(playersQuestion);

  it("matches names and aliases regardless of case and punctuation", () => {
    expect(grounds("lords")?.name).toBe("Lord's");
    expect(grounds("mcg")?.name).toBe("Melbourne Cricket Ground");
    expect(grounds("THE GABBA")?.name).toBe("The Gabba");
    expect(grounds("gabba")?.name).toBe("The Gabba");
  });

  it("rejects wrong answers and blanks", () => {
    expect(grounds("Wembley")).toBeNull();
    expect(grounds("   ")).toBeNull();
  });

  it("tolerates small typos on longer names", () => {
    expect(grounds("Old Trafod")?.name).toBe("Old Trafford");
    expect(grounds("Edgbastin")?.name).toBe("Edgbaston");
    expect(grounds("Kensingtn Ovl")?.name).toBe("Kensington Oval");
  });

  it("needs an exact match for short names", () => {
    expect(grounds("Lrds")).toBeNull();
    expect(grounds("SGC")).toBeNull();
  });

  it("doesn't treat a different short word as a typo", () => {
    const offSide = createMatcher({
      ...playersQuestion,
      answerType: "position",
      answers: [
        { name: "Silly mid-off", tier: "four" as const },
        { name: "Long off", tier: "two" as const },
        { name: "Cover point", tier: "four" as const },
      ],
    });
    // Leg-side positions are wrong answers, however close the spelling.
    expect(offSide("silly mid-on")).toBeNull();
    expect(offSide("Long on")).toBeNull();
    expect(offSide("Cover leg")).toBeNull();
    // Real typos still count.
    expect(offSide("silly mid-of")?.name).toBe("Silly mid-off");
    expect(offSide("Sily mid off")?.name).toBe("Silly mid-off");
    expect(offSide("Covr point")?.name).toBe("Cover point");
  });

  it("refuses a typo that is close to two different answers", () => {
    const q = {
      ...playersQuestion,
      answers: [
        { name: "Abcdefgh", tier: "single" as const },
        { name: "Abcdefgk", tier: "single" as const },
      ],
    };
    expect(createMatcher(q)("Abcdefgx")).toBeNull();
  });

  it("accepts a unique surname for players", () => {
    expect(players("Dhoni")?.name).toBe("MS Dhoni");
    expect(players("buttler")?.name).toBe("Jos Buttler");
    expect(players("Murali")?.name).toBe("Muttiah Muralitharan");
  });

  it("rejects a surname shared by two answers", () => {
    expect(players("Waugh")).toBeNull();
    expect(players("Mark Waugh")?.name).toBe("Mark Waugh");
  });

  it("does not accept surnames for non-player questions", () => {
    expect(grounds("Gardens")).toBeNull();
  });
});

describe("generated forms and misspellings", () => {
  const q = (answerType: Question["answerType"], names: (string | Answer)[]): Question => ({
    ...groundsQuestion,
    answerType,
    answers: names.map((n) => (typeof n === "string" ? { name: n, tier: "single" as const } : n)),
  });

  it("accepts short forms without generic words", () => {
    const m = createMatcher(
      q("county", ["Lancashire County Cricket Club", "Kent County Cricket Club"]),
    );
    expect(m("Lancashire")?.name).toBe("Lancashire County Cricket Club");
    expect(m("kent")?.name).toBe("Kent County Cricket Club");
  });

  it("accepts acronyms, two letters only for teams", () => {
    const teams = createMatcher(q("team", ["Chennai Super Kings", "Mumbai Indians"]));
    expect(teams("CSK")?.name).toBe("Chennai Super Kings");
    expect(teams("MI")?.name).toBe("Mumbai Indians");
    const grounds = createMatcher(q("ground", ["Melbourne Cricket Ground", "Eden Gardens"]));
    expect(grounds("mcg")?.name).toBe("Melbourne Cricket Ground");
    expect(grounds("eg")).toBeNull();
  });

  it("drops a generated form that two answers share", () => {
    const m = createMatcher(q("team", ["Kent Spitfires", "Kerala Strikers"]));
    expect(m("KS")).toBeNull();
    const forms = generatedForms(q("county", ["Kent County Cricket Club", "Kent Cricket Ground"]));
    expect(forms.has("kent")).toBe(false);
  });

  it("never lets a generated form override another answer's real name", () => {
    const m = createMatcher(q("team", ["Sunrisers Hyderabad", "SH"]));
    expect(m("sh")?.name).toBe("SH");
  });

  it("forgives doubled and missing double letters", () => {
    const m = createMatcher(q("player", ["James Anderson", "Andrew Flintoff"]));
    expect(m("Jiimmy Anndersson")).toBeNull();
    expect(m("Jamess Anndersson")?.name).toBe("James Anderson");
    expect(m("Andrew Flintof")?.name).toBe("Andrew Flintoff");
  });

  it("accepts listed misspellings that typo tolerance would miss", () => {
    const m = createMatcher(
      q("player", [
        { name: "Saqlain Mushtaq", tier: "single", misspellings: ["Saklain Mustak"] },
        "Wasim Akram",
      ]),
    );
    expect(m("saklain mustak")?.name).toBe("Saqlain Mushtaq");
  });
});

describe("nicknames", () => {
  it("accept a nickname alias as the full answer", () => {
    const m = createMatcher({
      ...groundsQuestion,
      answerType: "team",
      answers: [
        { name: "South Africa", tier: "single", aliases: ["Proteas"] },
        { name: "New Zealand", tier: "single", aliases: ["Black Caps", "Kiwis"] },
      ],
    });
    expect(m("the proteas")?.name).toBe("South Africa");
    expect(m("blackcaps")?.name).toBe("New Zealand");
  });
});
