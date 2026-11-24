/**
 * Writes one file per scheduled day into public/days/ with just what the game needs to play it.
 * Runs before dev and build (see package.json); the output is generated, so it isn't committed.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type DayFile, dayFileName } from "../src/data/index";
import type { PlayableQuestion, Question, Schedule } from "../src/engine/types";

const pool = new Map(
  readdirSync("src/data/questions")
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(`src/data/questions/${f}`, "utf8")) as Question[])
    .map((q) => [q.id, q]),
);
const schedule = JSON.parse(readFileSync("src/data/schedule.json", "utf8")) as Schedule;

const playable = (q: Question): PlayableQuestion => ({
  id: q.id,
  prompt: q.prompt,
  category: q.category,
  answerType: q.answerType,
  answers: q.answers.map(({ name, tier, aliases, misspellings }) => ({
    name,
    tier,
    ...(aliases?.length ? { aliases } : {}),
    ...(misspellings?.length ? { misspellings } : {}),
  })),
});

rmSync("public/days", { recursive: true, force: true });
mkdirSync("public/days", { recursive: true });
schedule.days.forEach((ids, i) => {
  const questions = ids.map((id) => {
    const q = pool.get(id);
    if (!q) throw new Error(`Day ${i + 1} uses unknown question ${id}`);
    return playable(q);
  });
  const file: DayFile = { questions };
  writeFileSync(`public/${dayFileName(i)}`, JSON.stringify(file));
});
console.log(`Wrote ${schedule.days.length} day file(s) to public/days`);
