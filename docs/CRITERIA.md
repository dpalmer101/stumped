# Stumped — acceptance criteria

Check every change against this list before committing. If a change needs a rule to change,
update [REQUIREMENTS.md](REQUIREMENTS.md) and this file in the same commit.

Items marked 🤖 must be enforced by an automated test.

## Hosting

- [ ] Runs as static files on GitHub Pages under a sub-path (`/stumped/`); no server code, no API calls. 🤖 (build + e2e against `vite preview` with base path)
- [ ] No third-party scripts or fonts at runtime; works offline once loaded.
- [ ] The only external request is an anonymous count to GoatCounter on the live site: no cookies, no personal data, never on local copies or in tests, skipped under Do Not Track. 🤖
- [ ] Production bundle (JS + CSS, gzipped) ≤ 100 KB; question content is loaded one day at a time, so the bundle doesn't grow with the schedule. 🤖 (retry e2e test)

## Content and licensing

- [ ] Everything shipped is our own or generated: graphics are drawn in code (SVG/CSS), sounds are synthesised (Web Audio), copy is written for the game. No copyrighted or trademarked images, sounds, fonts, logos, names, branding or colour schemes.
- [ ] The only exception is question answers, which may name real things as facts (players, grounds including sponsored names, teams, tournaments).
- [ ] Every dependency (runtime and dev) is open source and free to use with no commercial restrictions. Allowed licences: MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Apache-2.0, MPL-2.0, CC0-1.0, Unlicense. Not allowed: GPL/AGPL/LGPL, SSPL, BUSL, Elastic, Commons Clause, CC-BY-NC, unlicensed or proprietary. 🤖
- [ ] Prefer no runtime dependencies; adding one needs a reason.
- [ ] All rights are reserved: the repo has no licence, and the README ends with "© 2026 Daniel Palmer. All rights reserved."
- [ ] The home screen footer reads "© 2026 Daniel Palmer. All rights reserved." 🤖

## Gameplay

- [ ] Exactly 6 balls (one over) per puzzle, in a fixed order. 🤖
- [ ] Same date → same puzzle for every player; puzzle changes at local midnight. 🤖
- [ ] Each ball lasts its delivery's time (Fast ball 15 s, Slower ball 25 s, any other 20 s), measured from a stored start timestamp. 🤖
- [ ] Every Face ball button names the coming delivery and its time, never how hard the question is; every on-screen time matches the real one. 🤖
- [ ] First correct answer ends the ball; wrong answers are misses and the ball continues. 🤖
- [ ] Repeat wrong guesses are not counted twice. 🤖
- [ ] Timeout = OUT, 0 runs, +1 wicket; zero guesses = "Timed out". 🤖
- [ ] An answer still typed when time runs out is played as a last guess (scores if right, a miss if wrong). 🤖
- [ ] Runs per tier: OOTG 12, Six 6, Four 4, Two 2, Single 1, Out 0. 🤖
- [ ] Innings total shown as runs/wickets after ball 6. 🤖
- [ ] All 6 balls are always played; an out never ends the innings. 🤖
- [ ] No answer other than the player's own is shown until all 6 balls are done. 🤖
- [ ] Dismissal is deterministic for (puzzle, ball). 🤖
- [ ] A finished puzzle can't be replayed on its day except from the archive; reopening or reloading shows the scorecard until the next day. 🤖
- [ ] The archive lists every day so far with the player's score; a day's first finished play counts in stats but not streaks, and replays never change it. 🤖
- [ ] The timer keeps running while the page is hidden or closed; on return the ball resumes with the time left, or is OUT if it ran out. 🤖
- [ ] A ball's question is not in the page until that ball is faced and its timer has started. 🤖
- [ ] A ball waiting to be faced shows a result-style card reading "Play!" and a "Face ball one" (etc.) button. 🤖
- [ ] Progress is saved when a ball is faced and after every guess. 🤖

## Answer matching

- [ ] Case, accents, punctuation, leading "the", `&`/`and` don't affect matching. 🤖
- [ ] Aliases match. Surnames match only when unique within the question. 🤖
- [ ] Short forms, acronyms and listed misspellings match; a generated form shared by two answers matches neither. 🤖
- [ ] Well-known nicknames for players, teams and grounds are accepted as aliases when they point to a single answer in the question. 🤖
- [ ] Every answer's accepted forms are reviewed with `content:spellings` (aliases and misspellings added where people would type something else).
- [ ] Typo tolerance per REQUIREMENTS §7; never matches two answers ambiguously, and never turns a different short word into a right answer ("silly mid-on" is not "silly mid-off"). 🤖
- [ ] No autocomplete or hints that leak answers.

## Question bank 🤖 (validator runs in the unit tests)

Follow [CONTENT.md](CONTENT.md): write → verify → rank → schedule.

- [ ] Every answer is verified against English Wikipedia by `content:verify` (stored `verified`), never by hand.
- [ ] Every tier comes from `content:rank` (page views plus question-specific metrics); manual overrides need a written reason.
- [ ] Every day passes the variety rules: unique categories, one question per answer type (players up to two), ≤ 2 general-knowledge, ≤ 3 of one format, at least one question beyond men's international cricket.
- [ ] From day 5, no two questions on a day share a country tag. 🤖
- [ ] From day 4, a day has at most one women's cricket question (`women` without `men`). 🤖
- [ ] In any 7 days in a row a category appears on at most 2 days; a question is re-used only after 30 days. 🤖

- [ ] Every question: ≥ 20 answers (≥ 16 for county questions), exactly 1 OOTG, ≥ 2 each of Six/Four/Two/Single.
- [ ] Every answer list is **complete**: any correct answer a player could give is accepted (otherwise a right answer counts as a miss). Prefer closed sets of 20–60 answers (at least 16 for county questions; easy questions up to about 110 from a complete list); bound time-sensitive sets by date.
- [ ] No duplicate answers or aliases within a question after normalisation.
- [ ] Nearly every question has a few answers a UK fan of county and international cricket since the mid-1990s would know, or answers guessable from geography; teams named after a place accept the place name.
- [ ] Every question has `id`, `prompt`, `category`, `answerType`, `tags` and English Wikipedia `sources`; time-sensitive prompts are bounded by date.
- [ ] Every question has the writer's difficulty `rating` (recency, breadth and conditions, each 0–2), so the content tools can score it 1–10. 🤖
- [ ] Every question has a `delivery` from its difficulty band (CONTENT.md, Deliveries); each delivery has one name in one band. Questions not on a started day have a delivery from their current band. 🤖
- [ ] A started day's deliveries don't change (not checked automatically: deliveries aren't in the lock fingerprint).
- [ ] Every scheduled day has 6 distinct, existing question ids.
- [ ] Days can be added after the schedule has looped back without changing any started over; the next over plays the first new day. 🤖
- [ ] Once pushed, a day that has started anywhere (UTC+14) keeps its questions, prompts, answer types, answers and tiers; only added aliases or misspellings and format changes are allowed, unless the owner records the exact change in `src/data/relocked-days.json`. 🤖 (lock test, and CI `content:check-pushed` against the live site)
- [ ] Schedule covers at least the next 7 days from launch.

## Timer, sound, animation

- [ ] Timer bar visible throughout a ball, no seconds shown; time left announced to screen readers at 10/5 s.
- [ ] With the on-screen keyboard up, the timer, question and answer box stay on screen. 🤖
- [ ] A live ball's screen doesn't scroll or jitter when dragged with the keyboard up. 🤖
- [ ] Pulse sound speeds up at 10 s and 5 s; no sound before the first user gesture.
- [ ] Mute toggle works and persists. 🤖
- [ ] Each outcome (Single, Two, Four, Six, OOTG, Miss, Out) has a distinct animation. 🤖 (outcome → animation mapping)
- [ ] Four, Six and OOTG cut to a landing scene for each theme (where the ball lands), each with its own art. 🤖
- [ ] From 9pm to 5am local time the scene is floodlit; ball one's scene starts dark and the floodlights come on after 1 s, never during a timed ball; landing scenes get the same night sky. 🤖
- [ ] `prefers-reduced-motion` disables motion-heavy animation; landing scenes show their last frame; floodlights are on with no switch-on. 🤖
- [ ] Animations never block input for longer than 2 s.

## Accessibility and UX

- [ ] All four format themes render every screen; switching theme never changes questions, state or score. 🤖
- [ ] Every theme meets WCAG AA contrast for text and tier labels.
- [ ] No real competition, team or brand names, logos or colour schemes in themes or UI copy.

- [ ] Fully playable by keyboard; focus returns to the answer box after each miss.
- [ ] Colour is never the only signal for a tier or for time running out (the timer bar thickens and stripes in its last 5 s); contrast meets WCAG AA. 🤖
- [ ] Touch targets are at least 44×44 px. 🤖
- [ ] Usable at 360 px wide without horizontal scroll.
- [ ] Lighthouse accessibility ≥ 90, performance ≥ 90 (mobile).

## Persistence and sharing

- [ ] Progress, stats, streak and mute stored in localStorage under one versioned key. 🤖
- [ ] A page left open picks up a new deploy by itself, reloading only on a screen outside a ball, and at most once per deploy. 🤖
- [ ] Corrupt or old-version storage is discarded safely, not crashing the app. 🤖
- [ ] Share text contains no answers. 🤖
- [ ] What's new shows each item once per browser, newest first and at most 5; a new player sees How to play and never What's new. 🤖
- [ ] Only gameplay changes and easily missed features get a What's new item (REQUIREMENTS §10a); visual changes and new questions don't.

## Engineering

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build` all pass.
- [ ] Game logic is pure TypeScript with no DOM access, and has unit tests.
- [ ] New behaviour comes with tests that would fail if it were reverted.
