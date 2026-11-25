/**
 * Anonymous play counts via GoatCounter, sent as a plain request: no third-party script, no
 * cookies, no personal data, no answers or scores. Only the live site counts, and browsers asking
 * not to be tracked are left alone.
 */

/** GoatCounter site code (the part before .goatcounter.com). Empty turns counting off. */
export const GOATCOUNTER_SITE = "stumped";
/** Only the real site counts; a fork published elsewhere on GitHub Pages must not add to it. */
export const LIVE_HOST = "dpalmer101.github.io";

export interface CountContext {
  site: string;
  hostname: string;
  doNotTrack: string | null | undefined;
}

export function countingEnabled(ctx: CountContext): boolean {
  return !!ctx.site && ctx.hostname === LIVE_HOST && ctx.doNotTrack !== "1";
}

/** GoatCounter's documented /count endpoint; `rnd` stops browsers serving a cached response. */
export function countUrl(site: string, path: string, title: string, event: boolean): string {
  const params = new URLSearchParams({
    p: path,
    t: title,
    rnd: Math.random().toString(36).slice(2),
  });
  if (event) params.set("e", "true");
  return `https://${site}.goatcounter.com/count?${params}`;
}

function context(): CountContext {
  return {
    site: GOATCOUNTER_SITE,
    hostname: window.location.hostname,
    doNotTrack: navigator.doNotTrack,
  };
}

function send(path: string, title: string, event: boolean) {
  if (!countingEnabled(context())) return;
  try {
    // Fire-and-forget, nothing read back, never blocks the game. keepalive lets it finish even
    // if the page reloads straight after (the update reload, App.reloadIfSafe).
    void fetch(countUrl(GOATCOUNTER_SITE, path, title, event), {
      mode: "no-cors",
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    // Counting is never allowed to break play.
  }
}

export function countVisit() {
  send(window.location.pathname, document.title, false);
}

export type PlayEvent = "started" | "finished";

/** The game records which of these it has sent, so a reload doesn't count twice. */
export const eventKey = (name: PlayEvent, puzzle: number) => `${name}-${puzzle}`;

/**
 * Whether to send an event, and the updated list. Checks what this tab remembers and what's
 * stored (another tab may have sent it already), and keeps the list short.
 */
export function claimEvent(
  key: string,
  inMemory: string[],
  stored: string[],
): { send: boolean; counted: string[] } {
  const known = [...new Set([...stored, ...inMemory])];
  if (known.includes(key)) return { send: false, counted: known.slice(-60) };
  return { send: true, counted: [...known, key].slice(-60) };
}

export function countEvent(name: PlayEvent, puzzle: number) {
  send(
    `${name}-over-${puzzle}`,
    `${name === "started" ? "Started" : "Finished"} over #${puzzle}`,
    true,
  );
}
