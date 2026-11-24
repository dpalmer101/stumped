import "./styles.css";
import { App } from "./ui/app";

// iOS Safari ignores touch-action for pinch and the viewport's user-scalable=no, but lets a page
// cancel its gesture events.
for (const type of ["gesturestart", "gesturechange"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

const root = document.querySelector<HTMLElement>("#app");
if (root) new App(root);
