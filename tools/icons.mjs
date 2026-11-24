// Renders the home-screen icons from code (no image assets): an 8-bit ball and stumps.
// Run: node tools/icons.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const P = 32; // a 16×16 pixel grid at 512px
const px = (x, y, w, h, fill) =>
  `<rect x="${x * P}" y="${y * P}" width="${w * P}" height="${h * P}" fill="${fill}"/>`;
const wood = "#f1e6c8";
const ball = "#d8262f";

// Content sits inside the central 80% so it survives "maskable" cropping on Android.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">
  ${px(0, 0, 16, 16, "#0b0420")}
  ${px(0, 11, 16, 5, "#1b6b3a")}
  ${px(3, 4, 2, 9, wood)}${px(7, 4, 2, 9, wood)}${px(11, 4, 2, 9, wood)}
  ${px(3, 3, 4, 1, wood)}${px(9, 3, 4, 1, wood)}
  ${px(10, 6, 3, 3, ball)}${px(9, 7, 5, 1, ball)}${px(11, 5, 1, 5, ball)}
  ${px(11, 6, 1, 3, "#f4efe1")}
</svg>`;

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch({ args: ["--mute-audio"] });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="image-rendering:pixelated;display:block">`,
  );
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
  await page.close();
}
await browser.close();
console.log("icons written to public/icons");
