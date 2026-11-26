import type { Answer, Question, Tier } from "../../src/engine/types";

const a = (name: string, tier: Tier, aliases?: string[]): Answer =>
  aliases ? { name, tier, aliases } : { name, tier };

export const groundsQuestion: Question = {
  id: "test-grounds",
  prompt: "Name a ground that has hosted a men's Test match.",
  category: "Grounds",
  answerType: "ground",
  tags: ["men", "test", "international"],
  sources: ["https://en.wikipedia.org/wiki/List_of_Test_cricket_grounds"],
  rating: { recency: 1, breadth: 0, conditions: 1 },
  answers: [
    a("Bourda", "ootg"),
    a("Galle International Stadium", "six", ["Galle"]),
    a("Sabina Park", "six"),
    a("Kensington Oval", "four"),
    a("Newlands", "four"),
    a("Trent Bridge", "two"),
    a("Edgbaston", "two"),
    a("Lord's", "single", ["Lords Cricket Ground"]),
    a("The Oval", "single", ["Kennington Oval"]),
    a("Melbourne Cricket Ground", "single", ["MCG"]),
    a("Sydney Cricket Ground", "single", ["SCG"]),
    a("Old Trafford", "two"),
    a("Headingley", "two"),
    a("Eden Gardens", "two"),
    a("Wankhede Stadium", "four", ["Wankhede"]),
    a("The Gabba", "two", ["Brisbane Cricket Ground"]),
    a("Adelaide Oval", "two"),
    a("Basin Reserve", "four"),
    a("Hagley Oval", "six"),
    a("Rawalpindi Cricket Stadium", "four", ["Pindi"]),
  ],
};

export const playersQuestion: Question = {
  id: "test-players",
  prompt: "Name a player.",
  category: "Players",
  answerType: "player",
  tags: ["men", "international"],
  sources: ["https://en.wikipedia.org/wiki/List_of_cricketers"],
  rating: { recency: 0, breadth: 0, conditions: 0 },
  answers: [
    a("Mark Waugh", "two"),
    a("Steve Waugh", "single"),
    a("MS Dhoni", "single"),
    a("Jos Buttler", "single"),
    a("Muttiah Muralitharan", "two", ["Murali"]),
  ],
};

const TYPES = ["ground", "player", "team", "country", "county", "position", "tournament"] as const;

/** A valid question with its own category and answer type, for building varied days. */
export function variedQuestion(id: string, i: number): Question {
  return {
    ...groundsQuestion,
    id,
    category: `Category ${id}`,
    answerType: TYPES[i % TYPES.length] ?? "other",
    tags: i % 6 === 0 ? ["women", "odi"] : ["men", "international"],
  };
}
