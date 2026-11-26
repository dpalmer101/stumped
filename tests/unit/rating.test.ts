import { describe, expect, it } from "vitest";
import { rate } from "../../src/engine/rating";
import type { Question, Rating } from "../../src/engine/types";
import { groundsQuestion, playersQuestion } from "./fixtures";

const easy: Rating = { recency: 0, breadth: 0, conditions: 0 };
const hard: Rating = { recency: 2, breadth: 2, conditions: 2 };

/** `n` answers whose best-known have the given page views. */
function withAnswers(q: Question, n: number, views: number): Question {
  const answers = Array.from({ length: n }, (_, i) => ({
    ...(q.answers[0] as Question["answers"][number]),
    name: `Answer ${i}`,
    views,
  }));
  return { ...q, answers };
}

describe("rate", () => {
  const famous = withAnswers({ ...groundsQuestion, rating: easy }, 40, 1_000_000);
  const obscure = {
    ...withAnswers({ ...playersQuestion, rating: hard }, 20, 10),
    tags: ["women", "domestic"] as Question["tags"],
  };
  const middling = withAnswers({ ...playersQuestion, id: "mid", rating: easy }, 25, 1000);
  const bank = [famous, obscure, middling];

  it("scores an easy question 1 and a hard one 10", () => {
    expect(rate(famous, bank)).toEqual({
      score: 1,
      factors: { ...easy, answers: 0, fame: 0, guessable: 0, niche: 0 },
      women: 0,
    });
    expect(rate(obscure, bank)).toEqual({
      score: 10,
      factors: { ...hard, answers: 2, fame: 2, guessable: 2, niche: 1 },
      women: 2,
    });
  });

  it("treats places as guessable, players as not, and the rest in between", () => {
    const factor = (answerType: Question["answerType"]) =>
      rate({ ...famous, answerType }, bank)?.factors.guessable;
    expect([factor("ground"), factor("county"), factor("tournament"), factor("player")]).toEqual([
      0, 0, 1, 2,
    ]);
  });

  it("counts fewer answers as harder", () => {
    const answers = (n: number) => rate(withAnswers(famous, n, 1_000_000), bank)?.factors.answers;
    expect([33, 32, 21, 20].map(answers)).toEqual([0, 1, 1, 2]);
  });

  it("counts only franchises among teams as unguessable, since other sides are named after places", () => {
    const team = (tags: Question["tags"]) =>
      rate({ ...famous, answerType: "team", tags }, bank)?.factors.guessable;
    expect([team(["men", "domestic"]), team(["men", "franchise"])]).toEqual([0, 1]);
  });

  it("counts domestic questions as niche", () => {
    const niche = (tags: Question["tags"]) => rate({ ...famous, tags }, bank)?.factors.niche;
    expect([niche(["men", "international"]), niche(["men", "domestic"])]).toEqual([0, 1]);
  });

  it("makes women's-only questions 1 harder than the men's, and player questions 2", () => {
    const score = (answerType: Question["answerType"], tags: Question["tags"]) =>
      rate({ ...famous, answerType, tags }, bank)?.score ?? 0;
    const men = (t: Question["answerType"]) => score(t, ["men", "odi"]);
    expect([
      score("team", ["women", "odi"]) - men("team"),
      score("ground", ["women", "odi"]) - men("ground"),
      score("player", ["women", "odi"]) - men("player"),
      score("player", ["men", "women", "odi"]) - men("player"),
    ]).toEqual([1, 1, 2, 0]);
  });

  it("caps the score at 10", () => {
    expect(rate({ ...obscure, tags: ["women", "domestic", "odi"] }, bank)?.score).toBe(10);
  });

  it("puts questions as famous as each other in the easier third", () => {
    const twin = { ...famous, id: "twin" };
    expect(rate(famous, [famous, twin, obscure])?.factors.fame).toBe(0);
  });

  it("compares fame only against questions measured the same way", () => {
    const mentions = { ...obscure, popularity: "mentions" as const };
    // Alone on its scale, it sits in the middle rather than looking obscure next to page views.
    expect(rate(mentions, [famous, middling, mentions])?.factors.fame).toBe(1);
  });

  it("isn't scored until the writer has judged the rating", () => {
    expect(rate({ ...famous, rating: undefined }, bank)).toBeNull();
  });
});
