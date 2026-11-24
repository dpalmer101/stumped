# Stumped — product requirements

A free daily cricket knowledge game. One over a day: six balls, one question per ball. Name a correct
answer within 20 seconds; the rarer the answer, the bigger the shot. Runs out the time and you're out.

## 1. Audience and platform

- Cricket fans of any level. English-language UI.
- Static web app on GitHub Pages: no backend, no accounts. Only anonymous counts (GoatCounter):
  visits, overs started and overs finished. No cookies, no personal data, no answers or scores;
  nothing counted on local copies or when the browser asks not to be tracked.
- Mobile-first; works on current Chrome, Safari (iOS and macOS), Firefox, Edge.

## 2. The daily innings

- One puzzle per day, the same for everyone. The day rolls over at the player's **local midnight**.
- Puzzle number = days since launch date + 1 (shown as "Stumped #12").
- A puzzle is **one over: 6 balls**, played in order. Each ball is one question.
- A player can play each puzzle **once**. After ball 6, reopening or reloading the page shows that
  day's scorecard until the next puzzle unlocks at local midnight; there is no "play again".
- Limitation: with no backend, clearing site data or using another browser/device allows a replay.
  We accept this; there are no leaderboards to protect.

## 3. A ball

1. The ball waits in a "Ready" state with the **question hidden**. When the player taps **Face ball**
   the question appears, the bowler runs in and the timer starts at the same moment (the tap also
   lets the browser play sound). The question is never shown before its timer is running.
2. A 20-second timer starts. The player types answers into a single text box and presses Enter.
3. **Correct answer** → the ball ends. The batter plays a shot matching the answer's tier (§4).
4. **Wrong answer** → a "miss" (play and miss / beaten outside off). The guess is listed as a miss,
   the timer keeps running, the player tries again. Unlimited guesses.
5. **Repeat guess** (same normalised text as an earlier miss) → gently flagged, not counted again.
6. **Timer reaches 0** without a correct answer → **OUT**. The ball scores 0 and adds a wicket.
7. After the ball: a result panel shows the shot, runs, the answer given and its tier (or the
   dismissal). No other answers are revealed until the innings is over. One tap on **Face ball Two** (etc.)
   bowls the next ball (its question appears only then); after ball 6 it's **See scorecard**.

## 4. Answer tiers and runs

Every question has a curated list of accepted answers, each in exactly one tier.

| Tier              | Runs       | Meaning                                 | Per question |
| ----------------- | ---------- | --------------------------------------- | ------------ |
| Out of the ground | 12         | The rarest, most obscure correct answer | exactly 1    |
| Six               | 6          | Rare                                    | ≥ 2          |
| Four              | 4          | Uncommon                                | ≥ 2          |
| Two               | 2          | Fairly obvious                          | ≥ 2          |
| Single            | 1          | The obvious answers                     | ≥ 2          |
| Miss              | 0          | Wrong guess (does not end the ball)     | —            |
| Out               | 0 + wicket | No correct answer in 20s                | —            |

- ≥ 20 accepted answers per question in total.
- Tier is about how few people would think of it, not how good the player was.
- The tier is never shown before the player answers.

## 5. Dismissals

When a player is out, show a dismissal from a fixed set, chosen deterministically from the
puzzle number and ball number (so two players out on the same ball see the same one):
Bowled, LBW, Caught behind, Caught at slip, Caught in the deep, Caught & bowled, Stumped,
Run out, Hit wicket.

- Special case: **no guesses at all** in 20s → **Timed out**.
- Each dismissal has its own short animation (stumps flying, finger raised, catch, etc.).

## 6. Innings total

- Shown as **runs/wickets**, e.g. `27/2`, plus balls faced (always 6, one over).
- The scorecard lists each ball: question, answer given (or dismissal), tier, runs, misses.
- Only after ball 6 is the full answer list for every question revealed, grouped by tier.

## 7. Answer matching

- Case-, accent- and punctuation-insensitive; ignores leading "the", treats `&` as `and`,
  collapses whitespace.
- Each answer has a display name and optional aliases (e.g. "MCG", "Melbourne Cricket Ground").
- **Players**: surname alone is accepted if it is unique among that question's answers;
  otherwise the player needs a fuller name (e.g. "M Waugh" vs "S Waugh").
- **Typos**: a guess within edit distance 1 (names 5–8 chars) or 2 (9+ chars) of exactly one
  answer or alias is accepted. Ambiguous or short guesses must match exactly.
- No autocomplete or suggestions (they would give answers away).

## 8. Timer and sound

- Timer: a subtle thin bar across the top of the pitch scene that drains during the ball and
  turns red in the last 10s. No seconds are shown; screen readers get announcements at 10s and 5s.
- The timer is driven by stored timestamps, not by the page running. It **keeps ticking if the player
  leaves**: switching tabs or apps, locking the phone, reloading or closing the page. On return the
  remaining time is whatever is left; if it ran out while they were away, that ball is out (with
  "Timed out" if they had made no guesses). This stops players pausing to look answers up.
- A pulse sound (Web Audio, generated, no audio files) ticks once per second, faster
  every 0.5s in the last 10s and every 0.25s in the last 5s, with rising pitch.
- Mute toggle, remembered between visits. The bar's visual pulse continues when muted.
- Shot sounds: bat crack on any hit, crowd swell on Four and above, big roar on Out of the ground,
  "howzat" sting on Out.

## 9. Animation

- Head-on pitch scene (looking down the wicket at the batter, who faces the screen; no keeper): bowler runs in and delivers as the timer starts; ball is held "in flight"
  while the player thinks; then resolves on answer.
- Per outcome:
  - **Single** – defensive push into the off side, batters run one.
  - **Two** – clip off the pads into the gap, batters run two.
  - **Four** – drive along the ground to the rope.
  - **Six** – lofted shot, lands over the rope in the crowd.
  - **Out of the ground** – huge hit, ball leaves the stadium, crowd flash/fireworks.
  - **Miss** – ball beats the bat and carries on past the stumps; play continues.
  - **Out** – dismissal-specific animation.
- `prefers-reduced-motion`: replace motion with a short fade + text result.

## 10. Persistence and stats (localStorage)

- Today's progress (including a ball in progress and its start time) is saved the moment the ball is
  faced, and after every guess, so it survives a reload or closed tab. See §8 for what happens to
  the timer while away.
- Stats: innings played, average, highest score, current and best streak (days played in a row),
  count of each tier hit, ducks (0 runs total).

## 11. Sharing

- **Share** opens the device's share sheet wherever the browser offers one (phones and most desktops,
  on https pages), and otherwise copies the spoiler-free summary to the clipboard:

  ```
  Stumped #12 🏏 27/2
  🏟️ 4️⃣ ☝️ 1️⃣ 6️⃣ ☝️
  Out of the ground! · 🔥 3-day streak
  https://<user>.github.io/stumped
  ```

  Emoji per ball: 🏟️ out of the ground, 6️⃣ 4️⃣ 2️⃣ 1️⃣ runs, ☝️ out. The third line is a one-line
  verdict (e.g. "Duck 🦆", "2× out of the ground!", "Not out!") plus the streak from two days on.

## 12. Content (question bank)

- Answer types: countries, counties, teams, players, tournaments, positions, grounds, etc.
- Launch with **7 days × 6 questions** (42). Adding days must only mean adding data files.
- Prefer stable facts (e.g. "Test-playing nations", "English first-class counties").
  Time-sensitive lists ("players with 10,000 Test runs") must state an `asOf` date in the question.
- Each question records a `source` for fact-checking.
- If the schedule runs out, puzzles wrap around to day 1 (and log a console warning) rather than break.
- Answers live in the client bundle; light obfuscation (not security) to avoid casual spoilers in
  devtools is a nice-to-have, not v1.

## 13. Out of scope for v1

Accounts, leaderboards, archive/practice mode, multiple languages, adverts, and any analytics beyond
the anonymous counts in §1.

## 14. Decisions log

- 2026-11-24: Out of the ground = 12 runs.
- 2026-11-24: Being out never ends the innings; all balls are always faced.
- 2026-11-24: Possible answers are revealed only after the last ball, never between balls.
- 2026-11-24: Day rolls over at the player's local midnight.
- 2026-11-24: Wrong guesses cost only time; unlimited guesses.
- 2026-11-24: Head-on camera, no wicket keeper. Outcome calls use a modern heavy italic sans.
- 2026-11-24: Timer is a thin draining bar along the top, with no seconds shown.
- 2026-11-24: Each ball lasts 20 seconds (was 30).
- 2026-11-24: Player-facing copy never states how many answers a question has.
- 2026-11-24: Home screen description is exactly: "1 over, 6 questions" (originally "7 balls, 7 questions") / "Right answers get you runs" / "The rarer the answers, the bigger the shot".
- 2026-11-24: Everyone gets the same questions, in the same order, on the same date, so scores can be compared. The puzzle number in the share text says which day a score is from.
- 2026-11-24: Pitch scene and its animations are 8-bit pixel art: chunky pixels, flat colours, square ball, stepped (frame-by-frame) motion.
- 2026-11-24: Four player-selectable **format themes**, one shared layout: 100 (neon, night), Village (warm, rounded), Test (whites, classic serif), One Day (coloured clothing, blue/yellow). Chosen on the home screen or by tapping the format chip during play; remembered on the device. Each theme has its own venue backdrop, kit colours, ball (red for Test/Village, white for white-ball formats) and sightscreen. Theme never changes questions or scoring.
- 2026-11-24: The neon theme is labelled "100", not "The Hundred", to avoid trademark issues. No theme uses a real competition, team or brand name, logo or colour scheme.
- 2026-11-24: One play per puzzle per day; the timer keeps running while the player is away from the page; questions stay hidden until the ball is faced.
- 2026-11-24: No copyrighted or trademarked content: all images, sounds and names are generated or our own. Only question answers may use real (possibly copyrighted or sponsored) names. All dependencies must be open source and free to use with no commercial restrictions (see CRITERIA.md, Content and licensing).
- 2026-11-24: Nicknames (players, teams, grounds) count as correct stand-ins for the full name, via aliases, when they identify one answer in the question.
- 2026-11-24: A day is **one over: 6 balls, 6 questions** (was 7). Home screen first line reads "1 over, 6 questions".
- 2026-11-24: Each day's questions are a separate file fetched by the page, keeping the app small as the schedule grows. Not meant to hide future questions (casual game).
- 2026-11-24: From the UX review: a one-time "How to play" sheet (reopenable from home) explains that the first right answer ends the ball and shows the 1/2/4/6/12 ladder; the timer bar thickens and stripes in its last 5 s; the format chip is hidden while a ball is live; one tap goes from a result to the next ball; share text adds a verdict and streak.
- 2026-11-24: Balls are named, not numbered, in the game ("Ball Three of Six", "Face ball Four").
- 2026-11-24: Content variety: strongest within a day, then within a week; similar questions are fine after a week, and questions can be re-used after 30 days (see CONTENT.md).
- 2026-11-24: Anonymous play counts via GoatCounter, sent as a plain request (no third-party script, no cookies, no personal data), live site only, Do Not Track respected. Replaces "no tracking".
