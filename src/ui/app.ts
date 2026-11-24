import { claimEvent, countEvent, countVisit, eventKey, type PlayEvent } from "../analytics";
import { loadDay, schedule } from "../data";
import { type Ball, guess, MAX_GUESS, startBall, tick, timeLeft } from "../engine/ball";
import { TIMED_OUT } from "../engine/dismissal";
import {
  canRevealAnswers,
  currentBallIndex,
  type Innings,
  isComplete,
  loadToday,
  replaceBall,
  total,
} from "../engine/innings";
import { createMatcher, type Matcher } from "../engine/match";
import { puzzleNumber, questionIdsFor, scheduleHasWrapped } from "../engine/puzzle";
import { shareText } from "../engine/share";
import {
  type BallMark,
  computeStats,
  formatCountdown,
  msUntilNextPuzzle,
  recordInnings,
  type Stats,
} from "../engine/stats";
import {
  BALL_MS,
  BALLS_PER_INNINGS,
  type PlayableQuestion,
  RUNS,
  TIER_LABEL,
  TIERS,
  type Tier,
} from "../engine/types";
import { browserStore, load, readRaw, type Saved, STORAGE_KEY, save, THEME_KEYS } from "../storage";
import { Sound } from "./audio";
import { pickQuote } from "./quotes";
import { Pitch, sceneSvg } from "./scene";
import { THEMES } from "./themes";

type View = "home" | "play" | "scorecard" | "answers";

const CALL: Record<Tier, string> = {
  ootg: "Out of the ground!",
  six: "Six!",
  four: "Four!",
  two: "Two",
  single: "Single",
};
const colour = (m: BallMark | "miss") => `var(--t-${m})`;
const FLAVOUR: Record<string, string> = {
  Bowled: "Through the gate before you found an answer.",
  LBW: "Trapped in front. Plumb.",
  "Caught behind": "A thin edge through to the keeper.",
  "Caught at slip": "Edged, and taken at slip.",
  "Caught in the deep": "Went for it, and found the fielder on the rope.",
  "Caught & bowled": "Straight back to the bowler.",
  Stumped: "Down the track and beaten. The keeper did the rest.",
  "Run out": "Sent back, and short of the crease.",
  "Hit wicket": "Trod on your own stumps.",
  [TIMED_OUT]: "Never made it to the crease: no guesses in time.",
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const mark = (b: Ball): BallMark | null =>
  !b.result ? null : b.result.kind === "out" ? "out" : b.result.tier;
/** Scorecard stats: headline numbers as tiles, then every ball ever faced by outcome. */
function statsHtml(s: Stats): string {
  const tiles = [
    ["Played", s.played],
    ["Average", s.average.toFixed(1)],
    ["Best", s.best],
    ["Streak", s.currentStreak],
    ["Best streak", s.bestStreak],
    ["Ducks", s.ducks],
  ]
    .map(
      ([label, value]) =>
        `<div class="tile"><b class="tile-value">${value}</b><span class="tile-label">${label}</span></div>`,
    )
    .join("");
  const marks: BallMark[] = [...TIERS, "out"];
  const tally = marks
    .map(
      (m) =>
        `<li><span class="tier" data-t="${m}">${m === "out" ? "Out" : TIER_LABEL[m]}</span><b class="tally-count">${s.marks[m]}</b></li>`,
    )
    .join("");
  return `<section class="stats" aria-labelledby="stats-title">
      <h2 class="cat" id="stats-title">Your stats</h2>
      <div class="tiles">${tiles}</div>
      <h3 class="sub">Every ball you've faced</h3>
      <ul class="tally">${tally}</ul>
    </section>`;
}

const statline = (s: Stats) =>
  `Played ${s.played} · Average ${s.average.toFixed(1)} · Best ${s.best} · Streak ${s.currentStreak}`;

// Removing and re-adding a class only restarts its CSS animation after a reflow in between.
function replay(el: Element | null, cls: string) {
  el?.classList.remove(cls);
  void (el as HTMLElement | null)?.offsetWidth;
  el?.classList.add(cls);
}

function fragment(html: string): Node {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild ?? document.createTextNode("");
}

const HOW_TO_PLAY = `<div class="sheet-backdrop">
  <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="htp-title">
    <h2 id="htp-title">How to play</h2>
    <p>Each ball is a cricket question with lots of right answers. You have <b>20 seconds</b>.</p>
    <p><b>Your first right answer ends the ball, so think rare:</b></p>
    <ul class="ladder">${(["single", "two", "four", "six", "ootg"] as const)
      .map(
        (t) => `<li><span class="tier" data-t="${t}">${TIER_LABEL[t]}</span><b>${RUNS[t]}</b></li>`,
      )
      .join("")}</ul>
    <p>Wrong guesses are misses: they cost time, not runs. Run out of time and you're <b>out</b>.</p>
    <p>One over a day, the same for everyone.</p>
    <p class="privacy">We count visits and overs played, anonymously: no cookies, no personal data.</p>
    <button class="btn wide" data-act="help-close">Got it</button>
  </section>
</div>`;

const BALL_NAMES = ["One", "Two", "Three", "Four", "Five", "Six"];
/** Balls are named, not numbered ("Ball Three"), like a commentator would. */
const ballName = (index: number) => BALL_NAMES[index] ?? String(index + 1);

/** Clipboard API where allowed (secure pages), else the older copy command, which also works on http. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** iOS browsers put Share in different places; name the one the player is using. */
export function iosInstallSteps(userAgent: string): string {
  const then = "then <b>Add to Home Screen</b>.";
  if (/CriOS/.test(userAgent))
    return `Tap the <b>Share</b> button in Chrome's address bar, ${then}`;
  if (/FxiOS/.test(userAgent)) return `Open Firefox's menu (☰), tap <b>Share</b>, ${then}`;
  if (/EdgiOS/.test(userAgent)) return `Open Edge's menu (…), tap <b>Share</b>, ${then}`;
  // In-app browsers (Google app, DuckDuckGo, Facebook, Instagram) also claim to be Safari.
  if (
    /Safari/.test(userAgent) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|Ddg|FBAN|FBAV|Instagram)/.test(userAgent)
  ) {
    return `Tap the <b>Share</b> button in Safari, ${then}`;
  }
  return `Open your browser's <b>Share</b> menu, ${then}`;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export class App {
  private readonly store = browserStore();
  private saved: Saved;
  private innings!: Innings;
  private view: View = "home";
  /** Index of a finished ball whose result panel is on screen. */
  private showing: number | null = null;
  private answersIndex = 0;
  private busy = false;
  private pitch: Pitch | null = null;
  private raf = 0;
  private lastBeat = 0;
  private announced = new Set<number>();
  private countdown = 0;
  private newDayReady = false;
  private calloutTimer = 0;
  private renderedView: View | null = null;
  /** Chrome/Android's install prompt, held until the player taps "Add to home screen". */
  private installPrompt: InstallPromptEvent | null = null;
  private showInstallHelp = false;
  private helpOpen = false;
  /** Whether the home screen was last drawn in its "before launch" state. */
  private launchShown = false;
  /** Storage as last read or written by this tab. */
  private lastRaw: string | null = null;
  private readonly sound: Sound;
  private readonly matchers = new Map<string, Matcher>();
  /** Questions for the day in play, fetched from its day file. */
  private questions = new Map<string, PlayableQuestion>();
  private loadedPuzzle = 0;
  /** A new one each page load, not each redraw. */
  private readonly quote = pickQuote();

  constructor(private readonly root: HTMLElement) {
    this.saved = load(this.store);
    this.lastRaw = readRaw(this.store);
    this.sound = new Sound(this.saved.muted);
    root.addEventListener("click", (e) => this.onClick(e));
    root.addEventListener("submit", (e) => this.onSubmit(e));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.root.querySelector(".sheet")) this.closeHelp();
    });
    // Another tab saved: adopt its state so two tabs can't restart or replay a ball.
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY && this.loadedPuzzle && !this.busy && this.sync()) this.render();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.checkDay();
    });
    window.setInterval(() => this.checkDay(), 30_000);
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.installPrompt = e as InstallPromptEvent;
      if (this.loadedPuzzle && this.view === "home") this.render();
    });
    window.addEventListener("appinstalled", () => {
      this.installPrompt = null;
      if (this.loadedPuzzle && this.view === "home") this.render();
    });
    countVisit();
    void this.boot();
  }

  /** Send an anonymous play count once per puzzle, remembering it in the save. */
  private countOnce(name: PlayEvent) {
    const claim = claimEvent(
      eventKey(name, this.innings.puzzle),
      this.saved.counted,
      load(this.store).counted,
    );
    this.saved.counted = claim.counted;
    if (!claim.send) return;
    this.persist();
    countEvent(name, this.innings.puzzle);
  }

  private async boot() {
    this.root.innerHTML = `<main class="home"><p class="loading" role="status">Loading today's over…</p></main>`;
    try {
      await this.ensureDay(this.todayPuzzle());
      this.startDay();
      this.render();
    } catch {
      this.showLoadError();
    }
  }

  private async ensureDay(puzzle: number) {
    if (this.loadedPuzzle === puzzle) return;
    const questions = await loadDay(puzzle);
    this.questions = new Map(questions.map((q) => [q.id, q]));
    this.loadedPuzzle = puzzle;
  }

  private todayPuzzle(): number {
    return Math.max(1, puzzleNumber(new Date(), schedule.launchDate));
  }

  private beforeLaunch(): boolean {
    return puzzleNumber(new Date(), schedule.launchDate) < 1;
  }

  /**
   * Re-read storage before acting. Returns true if another tab changed today's innings, in which
   * case the caller should re-render instead of acting on stale state.
   */
  private sync(): boolean {
    // Compare the raw string, so blocked or full storage (which never changes) can't wipe the
    // in-memory state by looking like another tab's save.
    const raw = readRaw(this.store);
    if (raw === this.lastRaw) return false;
    this.lastRaw = raw;
    const fresh = load(this.store);
    const changed = JSON.stringify(fresh.innings) !== JSON.stringify(this.saved.innings);
    this.saved = fresh;
    this.sound.muted = fresh.muted;
    // Only adopt saves for the day whose questions are loaded; a new day goes through checkDay().
    if (changed && fresh.innings?.puzzle === this.loadedPuzzle) {
      const puzzle = this.loadedPuzzle;
      this.innings = loadToday(fresh.innings, puzzle, questionIdsFor(puzzle, schedule), Date.now());
      this.showing = null;
      if (this.view === "play" && isComplete(this.innings)) this.view = "scorecard";
    }
    return changed;
  }

  /** Midnight passed with the page open: move on, but never pull a finished scorecard away. */
  private async checkDay() {
    if (this.view === "home" && this.loadedPuzzle && this.launchShown !== this.beforeLaunch()) {
      this.render();
    }
    if (!this.loadedPuzzle || this.todayPuzzle() === this.innings.puzzle || this.busy) return;
    if (this.view === "home") {
      if (!this.unfinishedOver()) await this.moveToToday();
    } else if (this.view === "scorecard" || this.view === "answers") {
      this.newDayReady = true;
      this.render();
    }
    // Mid-innings players finish yesterday's over; the check runs again afterwards.
  }

  private closeHelp() {
    const reopened = this.helpOpen;
    this.helpOpen = false;
    if (!this.saved.seenHelp) {
      this.saved.seenHelp = true;
      this.persist();
    }
    this.render();
    // Back to where the player was: the button that opened it, or the main call to action.
    this.root
      .querySelector<HTMLButtonElement>(`[data-act="${reopened ? "help" : "walk"}"]`)
      ?.focus();
  }

  private faceNext() {
    const ball = this.innings.balls[currentBallIndex(this.innings)];
    if (!ball) {
      this.view = "scorecard";
      return this.render();
    }
    if (ball.startedAt === undefined) {
      if (ball.index === 0) this.countOnce("started");
      this.setBall(startBall(ball, Date.now()));
    }
    this.view = "play";
    return this.render();
  }

  /** A started, unfinished over stays playable after midnight, even from the home screen. */
  private unfinishedOver(): boolean {
    return !isComplete(this.innings) && this.innings.balls.some((b) => b.startedAt !== undefined);
  }

  /** Background checks stay quiet when offline; a tap gets the "couldn't load" screen and a retry. */
  private async moveToToday(fromUser = false) {
    try {
      await this.ensureDay(this.todayPuzzle());
      this.startDay();
      this.render();
    } catch {
      if (fromUser) this.showLoadError();
    }
  }

  private showLoadError() {
    this.root.innerHTML = `<main class="home"><p class="loading" role="alert">Couldn't load today's over. Check your connection.</p>
      <button class="btn wide" data-act="retry">Try again</button></main>`;
  }

  /** Needs the day's questions loaded (ensureDay) first. */
  private startDay() {
    this.newDayReady = false;
    const puzzle = this.loadedPuzzle;
    if (scheduleHasWrapped(puzzle, schedule)) {
      console.warn(
        `Stumped: puzzle #${puzzle} is past the end of the schedule; repeating earlier days.`,
      );
    }
    const before = this.saved.innings;
    this.innings = loadToday(before, puzzle, questionIdsFor(puzzle, schedule), Date.now());
    this.showing = null;
    this.view = "home";

    if (before?.puzzle === puzzle) {
      // A ball that ran out of time while the player was away: show them what happened.
      const timedOut = this.innings.balls.findIndex((b, i) => b.result && !before.balls[i]?.result);
      if (timedOut >= 0) {
        this.showing = timedOut;
        this.view = "play";
      } else if (isComplete(this.innings)) {
        this.view = "scorecard";
      } else if (this.liveBall()) {
        this.view = "play";
      }
    }
    this.persist();
    // The last ball may have run out while the player was away.
    if (isComplete(this.innings)) this.countOnce("finished");
  }

  private persist() {
    // A tab still finishing yesterday's over must not overwrite today's innings from another tab.
    const stored = load(this.store);
    const newer = !!stored.innings && stored.innings.puzzle > this.innings.puzzle;
    this.saved.history = { ...stored.history, ...recordInnings(this.saved.history, this.innings) };
    this.saved.counted = [...new Set([...stored.counted, ...this.saved.counted])].slice(-60);
    this.saved.innings = newer ? stored.innings : this.innings;
    save(this.store, this.saved);
    this.lastRaw = readRaw(this.store);
  }

  private question(ball: Ball): PlayableQuestion {
    const q = this.questions.get(ball.questionId);
    if (!q) throw new Error(`Unknown question ${ball.questionId}`);
    return q;
  }

  private matcher(q: PlayableQuestion): Matcher {
    let m = this.matchers.get(q.id);
    if (!m) {
      m = createMatcher(q);
      this.matchers.set(q.id, m);
    }
    return m;
  }

  private liveBall(): Ball | null {
    const b = this.innings.balls[currentBallIndex(this.innings)];
    return b && b.startedAt !== undefined && !b.result ? b : null;
  }

  private setBall(ball: Ball) {
    this.innings = replaceBall(this.innings, ball);
    this.persist();
  }

  private render() {
    this.stopLoop();
    window.clearInterval(this.countdown);
    document.body.className = `theme-${this.saved.theme}`;
    if (this.view === "answers" && !canRevealAnswers(this.innings)) this.view = "scorecard";
    // A new screen starts at the top; re-rendering the same screen keeps the player's place.
    if (this.view !== this.renderedView) window.scrollTo(0, 0);
    this.renderedView = this.view;
    if (this.view === "home") {
      this.root.innerHTML = this.homeHtml();
      // The sheet is modal: keep keyboard focus inside it and the page behind out of reach.
      const sheet = this.root.querySelector(".sheet");
      if (sheet) {
        this.root.querySelector("main")?.setAttribute("inert", "");
        sheet.querySelector<HTMLButtonElement>('[data-act="help-close"]')?.focus();
      }
    } else if (this.view === "play") this.renderPlay();
    else if (this.view === "scorecard") this.renderScorecard();
    else this.root.innerHTML = this.answersHtml();
  }

  private scoreHtml() {
    const { runs, wickets } = total(this.innings);
    return `<div class="score" role="img" aria-label="Score ${runs} for ${wickets}">${runs}<span>/${wickets}</span></div>`;
  }

  private topBar(withScore: boolean, withChip = true) {
    const label = THEMES[this.saved.theme].label;
    // No format switching mid-ball: it would spend the player's clock.
    const chip = withChip
      ? `<button class="chip" data-act="cycle" aria-label="Format: ${label}. Change format">${label}</button>`
      : `<span class="grow"></span>`;
    return `<header class="top"><button class="logo" data-act="home" aria-label="Stumped: home">Stumped</button>
      ${chip}
      ${withScore ? this.scoreHtml() : ""}<button class="icon" data-act="mute" aria-pressed="${this.saved.muted}" aria-label="${this.saved.muted ? "Unmute" : "Mute"}">${this.saved.muted ? "🔇" : "🔊"}</button></header>`;
  }

  private pips(now: number) {
    const items = this.innings.balls.map((b, i) => {
      const m = mark(b);
      const label = m
        ? `Ball ${ballName(i)}: ${m === "out" ? "out" : TIER_LABEL[m]}`
        : `Ball ${ballName(i)}`;
      if (m) {
        return `<i role="img" data-t="${m}" aria-label="${label}">${m === "out" ? "W" : RUNS[m]}</i>`;
      }
      return `<i role="img"${i === now ? ' class="now" aria-current="step"' : ""} aria-label="${label}"></i>`;
    });
    return `<div class="pips">${items.join("")}</div>`;
  }

  private homeHtml() {
    const date = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    const started = this.innings.balls.some((b) => b.startedAt !== undefined);
    this.launchShown = this.beforeLaunch();
    const cta = this.beforeLaunch()
      ? `First over on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date(`${schedule.launchDate}T00:00:00`))}`
      : isComplete(this.innings)
        ? "View scorecard"
        : started
          ? "Resume innings"
          : "Walk out to bat";
    const stats = computeStats(this.saved.history, this.innings.puzzle);
    const stat = stats.played ? `<div class="statline">${statline(stats)}</div>` : "";
    const formats = THEME_KEYS.map((k) => {
      const t = THEMES[k];
      return `<button data-theme="${k}" aria-pressed="${k === this.saved.theme}" style="background:${t.swatch[0]};box-shadow:inset 0 -6px ${t.swatch[1]}">${t.label}<small>${t.blurb}</small></button>`;
    }).join("");
    return `<main class="home"><h1 class="big">Stumped</h1><div class="date">#${this.innings.puzzle} · ${date}</div>
      <ul><li>1 over, 6 questions</li><li>Right answers get you runs</li><li>The rarer the answers, the bigger the shot</li></ul>
      <div class="cat" id="formats-label">Choose your format</div>
      <div class="formats" role="group" aria-labelledby="formats-label">${formats}</div>
      <figure class="quote"><blockquote>“${this.quote[0]}”</blockquote><figcaption>${this.quote[1]}</figcaption></figure>
      <div class="grow"></div><button class="btn wide" data-act="walk"${this.beforeLaunch() ? " disabled" : ""}>${cta}</button>
      <button class="btn ghost help-link" data-act="help">How to play</button>${stat}${this.installHtml()}</main>
      ${this.helpOpen || !this.saved.seenHelp ? HOW_TO_PLAY : ""}`;
  }

  private renderPlay() {
    const idx = this.showing ?? currentBallIndex(this.innings);
    const ball = this.innings.balls[idx];
    if (!ball) {
      this.view = "scorecard";
      return this.render();
    }
    const live = this.showing === null && ball.startedAt !== undefined && !ball.result;
    this.root.innerHTML = `${this.topBar(true, !live)}${this.pips(this.showing === null ? idx : -1)}
      <div class="scene">${sceneSvg(this.saved.theme)}
        <div class="track" id="track" aria-hidden="true"><div class="bar" id="bar"></div></div>
        <div class="callout" id="callout" aria-hidden="true"></div></div>
      <section class="panel" id="panel" aria-live="polite"></section>
      <div class="sr-only" id="announce" aria-live="assertive"></div>`;
    const svg = this.root.querySelector<SVGSVGElement>(".scene svg");
    this.pitch = svg ? new Pitch(svg) : null;
    this.renderPanel(idx, ball);
  }

  private renderPanel(idx: number, ball: Ball) {
    const panel = this.root.querySelector<HTMLElement>("#panel");
    if (!panel) return;
    const last = idx === BALLS_PER_INNINGS - 1;

    if (this.showing !== null && ball.result) {
      const r = ball.result;
      const misses = ball.misses.length
        ? plural(ball.misses.length, "miss", "misses")
        : "No misses";
      this.setBar(r.kind === "hit" ? timeLeft(ball, (ball.startedAt ?? 0) + r.ms) : 0);
      if (r.kind === "hit") {
        this.callout(CALL[r.tier], r.tier, false);
        panel.innerHTML = `<div class="res"><div class="call${r.tier === "ootg" ? " long" : ""}" style="color:${colour(r.tier)}">${CALL[r.tier]}</div>
          <p class="what"><b>${esc(r.answer)}</b></p><p class="meta">+${plural(r.runs, "run", "runs")} · ${misses}</p></div>`;
      } else {
        this.callout(r.dismissal, "out", false);
        panel.innerHTML = `<div class="res"><div class="call" style="color:${colour("out")}">Out!</div>
          <p class="what"><b>${esc(r.dismissal)}</b>: ${esc(FLAVOUR[r.dismissal] ?? "")}</p><p class="meta">${misses}</p></div>`;
      }
      // Straight into the next ball: one tap, and its question still only appears once faced.
      return last
        ? this.wideButton(panel, "next", "See scorecard")
        : this.wideButton(panel, "face-next", `Face ball ${ballName(idx + 1)}`);
    }

    if (ball.startedAt === undefined) {
      // The question isn't put on the page until the ball is faced and its timer is running.
      this.setBar(BALL_MS);
      panel.innerHTML = `<div class="ready"><div class="cat">Ball ${ballName(idx)} of ${ballName(BALLS_PER_INNINGS - 1)}</div>
        <p>You'll have 20 seconds once the ball is bowled.</p></div>`;
      return this.wideButton(panel, "face", "Face ball");
    }

    const q = this.question(ball);
    panel.innerHTML = `<div class="q"><div class="cat">Ball ${ballName(idx)} · ${esc(q.category)}</div><h2 id="prompt">${esc(q.prompt)}</h2></div>
      <form class="ans" id="ansForm" autocomplete="off"><input id="guess" name="guess" aria-labelledby="prompt" placeholder="Type an answer…"
        autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="${MAX_GUESS}"><button class="btn" type="submit">Play</button></form>
      <div class="misses" id="misses" aria-label="Misses">${ball.misses.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
      <div class="hint" id="hint"></div>`;
    this.pitch?.bowl(Date.now() - (ball.startedAt ?? Date.now()));
    this.root.querySelector<HTMLInputElement>("#guess")?.focus();
    this.startLoop(ball);
  }

  private wideButton(panel: HTMLElement, act: string, label: string) {
    panel.insertAdjacentHTML(
      "afterend",
      `<div class="grow"></div><button class="btn wide" data-act="${act}">${label}</button>`,
    );
    this.root.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)?.focus();
  }

  private callout(text: string, m: BallMark | "miss", animate = true) {
    const el = this.root.querySelector<HTMLElement>("#callout");
    if (!el) return;
    el.textContent = text;
    el.style.setProperty("--c", colour(m));
    el.classList.toggle("long", text.length > 12);
    window.clearTimeout(this.calloutTimer);
    if (animate) replay(el, "show");
    else el.classList.add("show");
    // A miss is only a moment; it shouldn't sit over the pitch while the player types again.
    if (m === "miss")
      this.calloutTimer = window.setTimeout(() => el.classList.remove("show"), 1000);
  }

  private announce(text: string) {
    const el = this.root.querySelector<HTMLElement>("#announce");
    if (el) el.textContent = text;
  }

  private setBar(msLeft: number) {
    const bar = this.root.querySelector<HTMLElement>("#bar");
    // Quantised to 40 steps to match the 8-bit look.
    if (bar) bar.style.width = `${(Math.ceil((msLeft / BALL_MS) * 40) / 40) * 100}%`;
    const track = this.root.querySelector("#track");
    track?.classList.toggle("low", msLeft > 0 && msLeft <= 10_000);
    // Last 5 seconds: thicker and striped, so it reads without colour or sound.
    track?.classList.toggle("final", msLeft > 0 && msLeft <= 5000);
  }

  private renderScorecard() {
    const { runs, wickets } = total(this.innings);
    const boundaries = this.innings.balls.filter((b) =>
      ["four", "six", "ootg"].includes(mark(b) ?? ""),
    ).length;
    const rows = this.innings.balls
      .map((b, i) => {
        const q = this.question(b);
        const m = mark(b) ?? "out";
        const what =
          b.result?.kind === "hit"
            ? esc(b.result.answer)
            : `<i>${esc(b.result?.kind === "out" ? b.result.dismissal : "")}</i>`;
        const label = m === "out" ? "Out" : TIER_LABEL[m];
        return `<tr><td class="n">${i + 1}</td><td>${what}<div class="qq">${esc(q.category)}</div><div class="tt"><span class="tier" data-t="${m}">${label}</span></div></td>
          <td class="r">${b.result?.runs ?? 0}</td></tr>`;
      })
      .join("");
    const stats = computeStats(this.saved.history, this.innings.puzzle);
    this.root.innerHTML = `${this.topBar(false)}<main class="card">${this.newDayBanner()}
      <div class="total"><div class="lbl">Innings total</div><div class="big" id="total">${runs}/${wickets}</div>
        <div class="lbl">1 over · ${plural(boundaries, "boundary", "boundaries")}</div></div>
      ${this.pips(-1)}<table aria-label="Scorecard">${rows}</table>
      <div class="share" id="shareText">${esc(this.shareText())}</div>
      <div class="two"><button class="btn" data-act="share">Share</button><button class="btn ghost" data-act="answers">See all answers</button></div>
      <div class="toast" id="toast" role="status"></div>
      <div class="next">Next innings in <span id="countdown">${formatCountdown(msUntilNextPuzzle(new Date()))}</span></div>
      ${statsHtml(stats)}
      </main>`;
    this.countdown = window.setInterval(() => {
      const ms = msUntilNextPuzzle(new Date());
      const el = this.root.querySelector("#countdown");
      if (el) el.textContent = formatCountdown(ms);
      if (this.todayPuzzle() !== this.innings.puzzle && !this.newDayReady) this.checkDay();
    }, 1000);
  }

  /** Android/Chrome gets the real install prompt; iPhone gets instructions, as Safari has no prompt. */
  private installMode(): "prompt" | "ios" | null {
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return null;
    if (this.installPrompt) return "prompt";
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    return ios && window.matchMedia("(pointer: coarse)").matches ? "ios" : null;
  }

  private installHtml() {
    const mode = this.installMode();
    if (!mode) return "";
    const help =
      mode === "ios" && this.showInstallHelp
        ? `<p class="install-help" role="status">${iosInstallSteps(navigator.userAgent)}</p>`
        : "";
    return `<button class="btn ghost install" data-act="install" aria-expanded="${mode === "ios" ? this.showInstallHelp : "false"}">Add to home screen</button>${help}`;
  }

  private async install() {
    if (this.installPrompt) {
      const prompt = this.installPrompt;
      this.installPrompt = null;
      await prompt.prompt();
      await prompt.userChoice.catch(() => undefined);
    } else {
      this.showInstallHelp = !this.showInstallHelp;
    }
    this.render();
  }

  private newDayBanner() {
    return this.newDayReady
      ? `<div class="newday" role="status"><span>Today's over is ready</span><button class="btn" data-act="newday">Play</button></div>`
      : "";
  }

  private shareText() {
    const { currentStreak } = computeStats(this.saved.history, this.innings.puzzle);
    return shareText(
      this.innings,
      new URL(import.meta.env.BASE_URL, window.location.origin).href,
      currentStreak,
    );
  }

  private answersHtml() {
    const ball = this.innings.balls[this.answersIndex] as Ball;
    const q = this.question(ball);
    const mine = ball.result?.kind === "hit" ? ball.result.answer : null;
    const groups = TIERS.map((t) => {
      const list = q.answers
        .filter((a) => a.tier === t)
        .map((a) =>
          a.name === mine
            ? `<span class="mine">✓ ${esc(a.name)}</span>`
            : `<span>${esc(a.name)}</span>`,
        )
        .join("");
      return `<div class="group"><div class="gh"><span class="tier" data-t="${t}">${TIER_LABEL[t]}</span><span>${plural(RUNS[t], "run", "runs")}</span></div>
        <div class="alist">${list}</div></div>`;
    }).join("");
    return `${this.topBar(true)}<main class="card">${this.newDayBanner()}
      <div class="pager"><button class="btn ghost" data-act="prev" aria-label="Previous ball" ${this.answersIndex === 0 ? "disabled" : ""}>‹</button>
        <span>Ball ${ballName(this.answersIndex)} of ${ballName(BALLS_PER_INNINGS - 1)}</span>
        <button class="btn ghost" data-act="nextq" aria-label="Next ball" ${this.answersIndex === BALLS_PER_INNINGS - 1 ? "disabled" : ""}>›</button></div>
      <div class="cat">${esc(q.category)}</div><h2 class="aq">${esc(q.prompt)}</h2>${groups}
      <button class="btn wide answers-back" data-act="back">Back to scorecard</button></main>`;
  }

  private startLoop(ball: Ball) {
    this.stopLoop();
    this.lastBeat = Date.now();
    this.announced.clear();
    const frame = () => {
      const now = Date.now();
      const current = this.innings.balls[ball.index];
      if (!current || current.result) return;
      const left = timeLeft(current, now);
      this.setBar(left);
      for (const secs of [10, 5]) {
        if (left <= secs * 1000 && left > 0 && !this.announced.has(secs)) {
          this.announced.add(secs);
          this.announce(`${secs} seconds left`);
        }
      }
      const interval = left <= 5000 ? 250 : left <= 10_000 ? 500 : 1000;
      if (left > 0 && now - this.lastBeat >= interval) {
        this.lastBeat = now;
        this.sound.pulse(left);
        replay(this.root.querySelector("#track"), "pulse");
      }
      const ticked = tick(current, now);
      if (ticked.result) {
        this.setBall(ticked);
        void this.resolve(ticked);
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private async resolve(ball: Ball) {
    if (!ball.result || this.busy) return;
    this.busy = true;
    this.stopLoop();
    this.root
      .querySelectorAll<HTMLInputElement | HTMLButtonElement>("#ansForm input, #ansForm button")
      .forEach((el) => {
        el.disabled = true;
      });
    const r = ball.result;
    if (r.kind === "hit") {
      this.sound.hit(r.runs);
      this.callout(CALL[r.tier], r.tier);
      this.announce(`${CALL[r.tier]} ${r.answer}, ${plural(r.runs, "run", "runs")}`);
      await this.pitch?.hit(r.tier);
    } else {
      this.setBar(0);
      this.sound.out();
      this.callout(r.dismissal, "out");
      this.announce(`Out, ${r.dismissal}`);
      await this.pitch?.out(r.dismissal);
    }
    this.busy = false;
    if (isComplete(this.innings)) this.countOnce("finished");
    // Storage events are ignored while animating; catch up on anything another tab did meanwhile.
    if (this.sync()) return this.render();
    if (this.view !== "play") return;
    this.showing = ball.index;
    // Score and pips are swapped in place so the pitch animation isn't reset.
    this.root.querySelector(".top")?.replaceWith(fragment(this.topBar(true)));
    this.root.querySelector(".pips")?.replaceWith(fragment(this.pips(-1)));
    const shown = this.innings.balls[ball.index];
    if (shown) this.renderPanel(ball.index, shown);
  }

  private onSubmit(e: Event) {
    const form = e.target as HTMLFormElement;
    if (form.id !== "ansForm") return;
    e.preventDefault();
    const input = form.querySelector<HTMLInputElement>("#guess");
    if (this.busy) return;
    if (this.sync()) return this.render();
    const ball = this.liveBall();
    if (!input || !ball) return;
    const text = input.value;
    const { ball: next, outcome } = guess(
      ball,
      text,
      this.matcher(this.question(ball)),
      Date.now(),
    );
    const hint = this.root.querySelector("#hint");
    if (outcome === "empty" || outcome === "closed") return;
    this.setBall(next);
    if (outcome === "repeat") {
      if (hint) hint.textContent = "Already tried that one";
      replay(form, "shake");
      input.select();
      return;
    }
    if (outcome === "miss") {
      input.value = "";
      if (hint) hint.textContent = "";
      this.root
        .querySelector("#misses")
        ?.insertAdjacentHTML("beforeend", `<span>${esc(next.misses.at(-1) ?? "")}</span>`);
      this.sound.miss();
      this.callout("Miss", "miss");
      this.announce(`Miss: ${text.trim()}`);
      this.pitch?.miss();
      input.focus();
      return;
    }
    void this.resolve(next);
  }

  private onClick(e: Event) {
    const target = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!target) return;
    // Re-read storage first. Ball actions on stale state stop and redraw; navigation carries on.
    const act = target.dataset.act ?? "";
    if (
      !this.busy &&
      act !== "mute" &&
      this.sync() &&
      ["face", "face-next", "next"].includes(act)
    ) {
      return this.render();
    }
    const theme = target.dataset.theme;
    if (theme && (THEME_KEYS as readonly string[]).includes(theme)) {
      this.saved.theme = theme as Saved["theme"];
      this.persist();
      return this.render();
    }
    switch (act) {
      case "install":
        return void this.install();
      case "newday":
        return void this.moveToToday(true);
      case "retry":
        return void this.boot();
      case "walk":
        if (this.beforeLaunch()) return;
        if (this.todayPuzzle() !== this.innings.puzzle && !this.unfinishedOver()) {
          return void this.moveToToday(true);
        }
        this.sound.unlock();
        this.view = isComplete(this.innings) ? "scorecard" : "play";
        return this.render();
      case "face":
        this.sound.unlock();
        return this.faceNext();
      case "face-next":
        this.showing = null;
        this.sound.unlock();
        return this.faceNext();
      case "help":
        this.helpOpen = true;
        return this.render();
      case "help-close":
        return this.closeHelp();
      case "next":
        this.showing = null;
        this.view = isComplete(this.innings) ? "scorecard" : "play";
        return this.render();
      case "cycle": {
        if (this.busy) return;
        const i = THEME_KEYS.indexOf(this.saved.theme);
        this.saved.theme = THEME_KEYS[(i + 1) % THEME_KEYS.length] ?? "hundred";
        this.persist();
        return this.render();
      }
      case "mute": {
        const fresh = load(this.store);
        fresh.muted = !this.saved.muted;
        save(this.store, fresh);
        this.lastRaw = readRaw(this.store);
        this.saved.muted = fresh.muted;
        this.sound.muted = fresh.muted;
        target.setAttribute("aria-pressed", String(this.saved.muted));
        target.setAttribute("aria-label", this.saved.muted ? "Unmute" : "Mute");
        target.textContent = this.saved.muted ? "🔇" : "🔊";
        return;
      }
      case "share":
        return void this.share();
      case "answers":
        this.answersIndex = 0;
        this.view = "answers";
        return this.render();
      case "prev":
      case "nextq":
        this.answersIndex = Math.min(
          BALLS_PER_INNINGS - 1,
          Math.max(0, this.answersIndex + (act === "prev" ? -1 : 1)),
        );
        return this.render();
      case "home":
        if (this.busy) return;
        this.showing = null;
        this.view = "home";
        return this.render();
      case "back":
        this.view = "scorecard";
        return this.render();
    }
  }

  private async share() {
    const text = this.shareText();
    const toast = this.root.querySelector("#toast");
    const say = (msg: string) => {
      if (toast) toast.textContent = msg;
    };
    // The share sheet only exists on secure (https) pages, so plain-http copies fall through.
    const data = { title: "Stumped", text };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
      }
    }
    say(
      (await copyText(text))
        ? "Copied: paste it anywhere to share"
        : "Copy the text above to share",
    );
  }
}
