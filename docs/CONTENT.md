# Stumped: writing, verifying and scheduling questions

Every question goes through four steps: **write → verify → rank → schedule**. The tools for
steps 2–4 live in `tools/content.ts`. The unit tests refuse to pass if a question skipped a step,
so nothing unverified or unranked can ship.

```bash
npm run content:spellings  # step 1b: review every form each answer accepts
npm run content:verify     # step 2: check every answer against Wikipedia
npm run content:rank       # step 3: work out rarity and set tiers
npm run content:schedule   # step 4: allocate questions to days for variety
npm run content:report     # show each question's ranking, to review tiers
npm test                   # the bank rules, run offline from the stored results
```

## 1. Write

Questions live in `src/data/questions/*.json` as a flat pool. Older day-grouped files can be
converted with `npm run content:import -- <file>`. A question:

```jsonc
{
  "id": "eng-test-captains-1970-2024",
  "prompt": "Name a man who captained England in a men's Test between 1970 and 2024",
  "category": "England captains", // short label shown in play; unique within a day
  "answerType": "player", // player | country | county | team | tournament | position | ground | other
  "tags": ["men", "test", "england"], // see Variety below
  "sources": ["https://en.wikipedia.org/wiki/List_of_England_cricket_captains"],
  "metrics": [{ "label": "Tests as captain", "rarerWhen": "lower" }],
  "answers": [
    { "name": "Michael Vaughan", "aliases": ["Mike Vaughan"], "values": [51] },
    { "name": "Mark Butcher", "wiki": "Mark Butcher", "values": [1] }
  ]
}
```

Rules for the question:

- **A closed set.** Choose a question with a fixed, listable set of 20–60 correct answers and list
  **all** of them. A correct answer that's missing counts as a miss for the player.
- **Bounded in time.** Anything that can change gets a date bound in the prompt ("before 2025"), so
  the answer set never goes stale. Use `asOf` only if a bound is impossible.
- **Wikipedia-backed.** `sources` are English Wikipedia pages that list the answers, usually a
  "List of …" article or the relevant section. Every answer must be checkable from them.
- **Aliases** for the names players will really type: short names, old names, abbreviations,
  sponsor and non-sponsor names of grounds. Surname-only matching for players is automatic when the
  surname is unique within the question.
- **Real names are allowed in answers only.** Prompts, categories and the rest of the game stay
  free of brand names (see CRITERIA.md, Content and licensing).

### Spellings

Players type fast under a 20-second clock, so each answer needs the forms people really type.
The matcher handles some of this automatically:

- **Ignored:** case, accents, punctuation, spaces, a leading "the", and "&" vs "and".
- **Small typos:** one slip in 5–8 letters, two in 9 or more. Swapped letters count as one slip,
  and doubled or missing double letters are forgiven ("Flintof", "Traford").
- **Short forms:** generic words are dropped ("Lancashire" for "Lancashire County Cricket Club",
  "Wankhede" for "Wankhede Stadium").
- **Acronyms:** three or more letters ("MCG", "CSK"), or two for teams ("MI").
- **Surnames for players.**

A generated form is accepted only if no other answer in the question produces the same form.

Add the rest to each answer by hand:

- `aliases`: other correct names that should score the same as the full name:
  - **Nicknames** that fans use as a stand-in: players ("Freddie" Flintoff, "Punter", "Warney",
    "Jimmy" Anderson, "The Don"), teams ("Proteas", "Black Caps", "Windies", "Baggy Greens") and
    grounds ("the G" for the MCG, "the Home of Cricket" for Lord's).
  - Former, sponsor and non-sponsor names ("Narendra Modi Stadium" / "Motera").
  - Short names that aren't just the name minus generic words ("Sunrisers", "Murali", "Pindi").

  A nickname only goes in if it clearly means that one answer within this question; if two answers
  share it (two players called "Smudge"), leave it out. The bank tests reject collisions.
- `misspellings`: common wrong spellings that typo tolerance won't catch, e.g. "Muralidaran",
  "Saklain Mustak", "Brian Lara" spelt "Bryan Lara".

Run `npm run content:spellings -- <id>` to see every accepted form per answer. Answers marked
"name only" need a look. Aliases and misspellings may not collide with another answer; the bank
tests check this.

## 2. Verify (Wikipedia)

`npm run content:verify` checks each answer and records the result on it:

1. **The answer is on Wikipedia.** The tool looks up `wiki` if set, otherwise the answer's name,
   then `<name> (cricketer)` for players. Redirects are followed. A concept with no article of
   its own (a fielding position, a type of delivery) passes if it's named on a source page. A
   disambiguation page, or no article and no mention, is a failure: set `wiki` to the right title
   (the tool suggests some) or fix the answer.
2. **The answer appears in a source page.** The answer's article must be linked from one of the
   question's `sources`, or its name or an alias must appear in the source text.
3. **The result is stored** on the answer as `"verified": { "wiki": "<article>", "date": "YYYY-MM-DD" }`.

The tool prints every failure. Fix the data, which usually means the wrong article, a missing
alias, or an answer that isn't really correct, then run it again. **Never** mark an answer
verified by hand: if the tool can't confirm it from Wikipedia, the answer doesn't ship.

Completeness is checked by a person. The tool also lists articles linked from the source pages that
aren't answers. Most are noise, but go through the list for anything that should be an answer.

## 3. Rank (rarity)

Tiers aren't chosen by hand; they're computed from two signals and stored in the data.

**General obscurity: how well known the answer is in its own right.** Measured by the answer
article's Wikipedia page views over the last 12 months (`views`, fetched by `content:rank`).
Fewer views means rarer. A little-known country, player or ground scores high here whatever the
question.

**Question-specific obscurity: how marginally the answer fits this question.** Set by the
question's `metrics`, with a value per answer in `values`. Examples:

| Question                                 | Metric                        | Rarer when                |
| ---------------------------------------- | ----------------------------- | ------------------------- |
| Teams to have beaten Australia in a Test | Number of wins                | lower                     |
|                                          | Year of their most recent win | lower (longer ago)        |
| England men with 50+ Test caps           | Caps                          | lower (only just made it) |
| England Test captains                    | Tests as captain              | lower                     |
| Grounds to host a Test                   | Tests hosted                  | lower                     |

**Score.** Each signal becomes a percentile within the question (0 = most common, 1 = rarest),
averaged across metrics. The two are combined as

```
rarity = (1 − w) × general + w × specific
```

`w` is the question's `specificWeight`: 0.5 by default when the question has metrics, and 0 when it
doesn't. Raise it when the question-specific angle is what makes an answer impressive.

**Tiers** come from ranking by score, rarest first: the top answer is **Out of the ground**, then
about 18% **Six**, 25% **Four**, 27% **Two**, and the rest **Single** (at least 2 in each tier).

**Overrides.** If a computed tier is clearly wrong, for example a very famous answer whose article
happens to get few views, set `"override": { "tier": "single", "reason": "…" }`. The reason is
required and is reviewed like code. Keep overrides rare.

When at least a third of the answers share one article (fielding positions all live on "Fielding
(cricket)"), page views can't separate them. `content:rank` then sets `"popularity": "mentions"`
and measures how well known each answer is by how often the source pages mention it (`mentions`).
Metrics and overrides still apply on top.

## 4. Schedule (variety)

`src/data/schedule.json` holds the launch date and each day's 6 question ids (one over) in ball order.
`npm run content:schedule` appends new days, and `npm test` checks the whole schedule.

Variety matters most within a day, then within a week. After a week, similar questions are fine
(new angles get harder to find), and after a month a question can be used again.

**Within a day** (strongest):

- **Different categories:** no two questions share a `category`.
- **Different answer types:** at most one question per `answerType`, except players (up to two).
- **Not too much general knowledge:** at most 2 questions tagged `general` (laws, kit, shots,
  positions).
- **Mixed formats:** at most 3 questions share a format tag (`test`, `odi`, `t20`).
- **Beyond men's internationals:** at least one question about women's, domestic, franchise or
  general cricket.
- **Balanced difficulty:** a question's difficulty is how little-known its well-known answers are.
  Days are dealt hardest-first onto the day with the lowest difficulty so far, and each day runs
  from easiest to hardest, so ball one is the most approachable.

**Within a week:** in any 7 days in a row, a category appears on at most 2 days.

**Re-use:** a question can be scheduled again once 30 days have passed since it last played.

`npm run content:schedule -- --days=N` adds N days; add `--ranked-only` to use only questions that
have finished verify and rank (handy while ranking is still running).

Past days are never changed once they've been played (they are someone's scorecard). Only append.

The build turns each scheduled day into its own file (`days/N.json`) that the page fetches, so
changes to questions or the schedule reach players on the next build and deploy.

## Tags

Use these so the scheduler can mix days: `men`, `women`, `test`, `odi`, `t20`, `franchise`,
`domestic`, `international`, `general` (laws, equipment, positions, shots), plus one region tag when
the question is about one country (`england`, `india`, `australia`, …).
