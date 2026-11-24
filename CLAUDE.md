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
