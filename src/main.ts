import "./styles.css";
import { STORAGE_KEY } from "./storage";
import { App } from "./ui/app";

// iOS Safari ignores touch-action for pinch and the viewport's user-scalable=no, but lets a page
// cancel its gesture events.
for (const type of ["gesturestart", "gesturechange"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Testing aid: ?reset clears saved progress on local copies only, so the live site can't be replayed.
const url = new URL(window.location.href);
if (url.searchParams.has("reset") && !window.location.hostname.endsWith("github.io")) {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing saved to clear.
  }
  url.searchParams.delete("reset");
  window.history.replaceState(null, "", url);
}

// Left by the update reload (App.reloadIfSafe) to dodge caches; it means nothing to a visitor,
// and the reload isn't a new visit.
const updated = url.searchParams.has("v");
if (updated) {
  url.searchParams.delete("v");
  window.history.replaceState(null, "", url);
}

const root = document.querySelector<HTMLElement>("#app");
if (root) new App(root, { countVisit: !updated });
