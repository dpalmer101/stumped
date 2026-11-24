# Stumped — technology choices

| Concern              | Choice                                                                                                                       | Why                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Language             | TypeScript (strict)                                                                                                          | Typed question schema and game state catch content and logic bugs early.                                                     |
| Build / dev server   | Vite                                                                                                                         | Fast, zero-config static output; `base: '/stumped/'` for GitHub Pages.                                                       |
| UI                   | Vanilla TS + small render functions, no framework                                                                            | Seven screens and one scene; a framework adds weight without paying for itself. Revisit (Preact) if state wiring gets messy. |
| Graphics / animation | Inline SVG + Web Animations API (CSS for simple transitions)                                                                 | Crisp at any size, animatable without a game engine, respects reduced motion easily.                                         |
| Audio                | Web Audio API, synthesised tones                                                                                             | No audio assets to load or license; precise pulse timing.                                                                    |
| Storage              | `localStorage`, one versioned JSON key                                                                                       | Only per-device state is needed.                                                                                             |
| Question data        | Pool in `src/data/questions/*.json`; `schedule.json` bundled; one generated file per day (`days/N.json`) fetched by the page | Bundle stays small and doesn't grow as days are added; validated by tests.                                                   |
| Unit tests           | Vitest                                                                                                                       | Same config as Vite, fast, TS-native.                                                                                        |
| E2E tests            | Playwright (Chromium + WebKit, mobile viewport)                                                                              | Drives the real built app; clock control for timer tests.                                                                    |
| Lint / format        | Biome                                                                                                                        | One fast tool for both.                                                                                                      |
| CI / deploy          | GitHub Actions → GitHub Pages (`actions/deploy-pages`)                                                                       | Free, no extra hosting.                                                                                                      |
| Node                 | 24 LTS (`.nvmrc`)                                                                                                            | Matches local toolchain.                                                                                                     |

Day files: `npm run days` (`tools/build-days.ts`) writes `public/days/N.json` with just what the game needs
for each scheduled day. It runs automatically before `dev` and `build`; the files are generated, not committed.

Content tooling: `tools/content.ts`, run with `tsx` (MIT), calls the public Wikipedia and Wikimedia
pageview APIs with a generic user agent. See [CONTENT.md](CONTENT.md).

## Structure (planned)

```
src/
  engine/      pure logic: puzzle selection, matching, ball state, scoring, share text
  data/        questions/*.json, schedule.json, schema.ts
  ui/          screens, pitch scene (SVG), animations, audio
  storage.ts   localStorage wrapper
  main.ts
tests/
  unit/        Vitest, mirrors src/engine and src/data
  e2e/         Playwright
docs/          requirements, criteria, content process, tech choices
```

## Scripts (planned)

`dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:e2e` — CI runs all of them, with the end-to-end tests split into one parallel job per browser.
