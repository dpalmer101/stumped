# Stumped

Daily cricket knowledge game, static site on GitHub Pages.

- Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- **Acceptance criteria — check every change against [docs/CRITERIA.md](docs/CRITERIA.md) before committing.**
- Tech choices: [docs/TECH.md](docs/TECH.md)
- Question content process: [docs/CONTENT.md](docs/CONTENT.md)

Rules:

- Game logic in `src/engine/` stays pure (no DOM) and unit tested.
- Question bank changes follow docs/CONTENT.md (verify against Wikipedia, rank, schedule) and must pass the bank tests.
- Never change the questions of a day that's been pushed and has started (past days and today): only adding aliases or misspellings and format changes are allowed. See docs/CONTENT.md, Locked days.
- No copyrighted content: graphics, sounds and copy are generated or our own; only question answers may use real names. Dependencies must have an allowed open-source licence (CRITERIA.md, Content and licensing).
- If a change alters a rule, update REQUIREMENTS.md and CRITERIA.md in the same commit.
- If a change alters how the game is played, or adds a feature players could miss, add a What's
  new item to `src/engine/news.ts` in the same commit: really short, playful and clear. Not for
  visual changes or new questions: see REQUIREMENTS.md §10a.
- Keep the pictures current: any change to how the game looks (styles, scenes, landings, layout,
  on-screen copy) regenerates them in the same commit, after `npm run build`:
  - `npm run gallery` for [docs/GALLERY.md](docs/GALLERY.md). Name the formats that changed to
    capture only those (`hundred`, `village`, `test`, `oneday`), and add `--stills` unless an
    animation or scene changed: the screenshots come out identical when nothing changed, but the
    GIFs are recorded in real time and differ on every run. Needs ffmpeg.
  - `npm run screenshots` if the README picture would change.
  - Look at the new images before committing, and commit only those that changed.
