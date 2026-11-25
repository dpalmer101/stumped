import { describe, expect, it } from "vitest";
import {
  cellText,
  dedupe,
  fromLists,
  fromTables,
  links,
  toAnswers,
  wikitables,
} from "../../tools/draft";

const a = (title: string, text = title) =>
  `<a href="/wiki/${title.replace(/ /g, "_")}" title="${title}">${text}</a>`;
const flag = `<span class="flagicon"><span typeof="mw:File"><a href="/wiki/England_cricket_team" title="England"><img src="x.png"></a></span></span>`;

describe("links", () => {
  it("skips flags, footnotes, files and other namespaces, and keeps red links by name", () => {
    const html = `${flag} ${a("Alastair Cook (cricketer)", "Alastair Cook")}<sup>${a("Note")}</sup>
      ${a("File:Bat.jpg", "bat")} <a href="/w/index.php?title=Joe_Bloggs&amp;redlink=1" class="new">Joe Bloggs</a>`;
    expect(links(html)).toEqual([
      { title: "Alastair Cook (cricketer)", text: "Alastair Cook" },
      { text: "Joe Bloggs" },
    ]);
  });
});

describe("cellText", () => {
  it("decodes named and numeric entities before dropping footnote marks", () => {
    expect(cellText("Sir&#160;Garfield Sobers&#x27;s &amp; co*<sup>[2]</sup>")).toBe(
      "Sir Garfield Sobers's & co",
    );
  });
});

describe("wikitables", () => {
  const table = `<table class="wikitable sortable"><tbody>
    <tr><th>Rank</th><th>Player</th><th>Caps</th></tr>
    <tr><td rowspan="2">1</td><th scope="row">${flag} ${a("Alastair Cook")}†</th><td>161</td></tr>
    <tr><th scope="row">${a("James Anderson (cricketer)", "James Anderson")}<sup>[1]</sup></th><td>1,88</td></tr>
    <tr><td colspan="2">${a("Stuart Broad")}</td><td>167</td></tr>
  </tbody></table>`;

  it("lays out rowspans and colspans so columns line up", () => {
    const [t] = wikitables(
      `<p>intro</p>${table}<table class="infobox"><tr><td>x</td></tr></table>`,
    );
    expect(t?.headers).toEqual(["Rank", "Player", "Caps"]);
    expect(t?.rows.map((r) => r.length)).toEqual([3, 3, 3]);
    expect(t?.rows[1]?.[0]?.html).toBe("1");
  });

  it("takes the name column and an optional value column", () => {
    expect(fromTables(table, { value: /caps/i })).toEqual([
      { name: "Alastair Cook", wiki: "Alastair Cook", value: 161 },
      { name: "James Anderson", wiki: "James Anderson (cricketer)", value: 188 },
      { name: "Stuart Broad", wiki: "Stuart Broad", value: 167 },
    ]);
  });

  it("combines stacked header rows per column", () => {
    const stacked = `<table class="wikitable">
      <tr><th rowspan="2">Player</th><th colspan="2">Runs</th></tr><tr><th>Tests</th><th>ODIs</th></tr>
      <tr><td>${a("Joe Root")}</td><td>13,000</td><td>7,000</td></tr></table>`;
    expect(wikitables(stacked)[0]?.headers).toEqual(["Player", "Runs Tests", "Runs ODIs"]);
    expect(fromTables(stacked, { value: /tests/i })).toEqual([
      { name: "Joe Root", wiki: "Joe Root", value: 13000 },
    ]);
  });

  it("treats a first row without links as the header when no <th> row exists", () => {
    const tdHeader = `<table class="wikitable"><tr><td><b>Player</b></td><td><b>Caps</b></td></tr>
      <tr><td>${a("Joe Root")}</td><td>150</td></tr></table>`;
    expect(wikitables(tdHeader)[0]?.headers).toEqual(["Player", "Caps"]);
    expect(fromTables(tdHeader).map((c) => c.name)).toEqual(["Joe Root"]);
  });

  it("ignores tables nested in a cell", () => {
    const nested = `<table class="wikitable"><tr><th>Team</th></tr>
      <tr><td>${a("Surrey County Cricket Club", "Surrey")}<table><tr><td>${a("Oval")}</td></tr></table></td></tr>
      <tr><td>${a("Kent County Cricket Club", "Kent")}</td></tr></table>`;
    expect(fromTables(nested).map((c) => c.name)).toEqual(["Surrey", "Kent"]);
  });

  it("can pick a column and restrict to some tables", () => {
    const two = `${table}<table class="wikitable"><tr><th>Ground</th></tr><tr><td>${a("Lord's")}</td></tr></table>`;
    expect(fromTables(two, { tables: [2] }).map((c) => c.name)).toEqual(["Lord's"]);
    expect(fromTables(two, { column: /rank/i, tables: [1] }).map((c) => c.name)).toEqual([
      "1",
      "1",
      "Stuart Broad",
    ]);
  });
});

describe("fromLists", () => {
  it("takes the first link of each item and stops at See also", () => {
    const html = `<ul><li>${a("Gillette Cup")} (1963–80), then ${a("NatWest Trophy")}
      <ul><li>${a("Nested")}</li></ul></li><li>${a("Pro40")}</li></ul>
      <div class="mw-heading"><h2 id="See_also">See also</h2></div><ul><li>${a("Other")}</li></ul>`;
    expect(fromLists(html).map((c) => c.name)).toEqual(["Gillette Cup", "Nested", "Pro40"]);
  });
});

describe("answers", () => {
  it("keeps the first of each article and sets wiki only when it differs", () => {
    const answers = toAnswers(
      dedupe([
        { name: "Jimmy Anderson", wiki: "James Anderson (cricketer)" },
        { name: "James Anderson", wiki: "James Anderson (cricketer)" },
        { name: "Joe Root", wiki: "Joe Root", value: 150 },
      ]),
    );
    expect(answers).toEqual([
      { name: "Jimmy Anderson", wiki: "James Anderson (cricketer)" },
      { name: "Joe Root", values: [150] },
    ]);
  });
});
