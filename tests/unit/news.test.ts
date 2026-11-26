import { describe, expect, it } from "vitest";
import { MAX_NEWS, NEWS, type NewsItem, newsIds, unseenNews } from "../../src/engine/news";

const item = (n: number): NewsItem => ({
  id: `n${n}`,
  title: `Item ${n}`,
  body: "",
});
const many = Array.from({ length: 8 }, (_, i) => item(i + 1));

describe("what's new", () => {
  it("shows everything unseen, newest first", () => {
    expect(unseenNews([], many.slice(0, 3)).map((n) => n.id)).toEqual(["n3", "n2", "n1"]);
  });

  it("never shows an item again once seen", () => {
    expect(unseenNews(["n1", "n3"], many.slice(0, 3)).map((n) => n.id)).toEqual(["n2"]);
    expect(unseenNews(newsIds(many), many)).toEqual([]);
  });

  it("shows only the latest five after a long break", () => {
    expect(MAX_NEWS).toBe(5);
    expect(unseenNews([], many).map((n) => n.id)).toEqual(["n8", "n7", "n6", "n5", "n4"]);
  });

  it("ignores ids that are no longer in the list", () => {
    expect(unseenNews(["gone"], many.slice(0, 1)).map((n) => n.id)).toEqual(["n1"]);
  });

  it("has unique ids", () => {
    expect(new Set(newsIds()).size).toBe(NEWS.length);
  });

  it("announces the deliveries", () => {
    expect(newsIds()).toContain("deliveries");
  });
});
