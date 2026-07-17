// Generates Chrome Web Store assets:
//   store/screenshots/*.png  (1280x800, real pages with the extension loaded)
//   store/promo/*.jpg        (promo tiles rendered from store/promo-tiles.html)
//
// Usage: npm run assets
// First run opens a headed Chrome — log into LinkedIn once; the profile is
// kept in .playwright-profile/ (gitignored) so later runs are automatic.

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shotsDir = path.join(root, "store", "screenshots");
const promoDir = path.join(root, "store", "promo");
mkdirSync(shotsDir, { recursive: true });
mkdirSync(promoDir, { recursive: true });

const browser = await chromium.launchPersistentContext(
  path.join(root, ".playwright-profile"),
  {
    headless: false,
    channel: "chrome", // use installed Chrome — no playwright browser download
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      "--hide-crash-restore-bubble",
    ],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  }
);

const page = await browser.newPage();

function setMode(off) {
  return page.evaluate((v) => localStorage.setItem("lifg:off", v), off ? "1" : "0");
}

// --- 1: games hub (hero + tiles + leaderboards); log in if needed ---
await page.goto("https://www.linkedin.com/games/");
try {
  await page.waitForSelector("a.ps-game-entrypoint-card", { timeout: 15000 });
} catch {
  console.log(">> Not logged in. Log into LinkedIn in the opened window…");
  await page.waitForSelector("a.ps-game-entrypoint-card", {
    timeout: 5 * 60 * 1000,
  });
}
await setMode(false);
await page.goto("https://www.linkedin.com/games/");
await page.waitForSelector("a.ps-game-entrypoint-card", { timeout: 30000 });
await page.waitForSelector(".lifg-lb", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(shotsDir, "1-hub.png") });
console.log("✓ 1-hub.png");

// --- 2: a plain-faced game page ---
await page.goto("https://www.linkedin.com/games/queens/");
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(shotsDir, "2-game.png") });
console.log("✓ 2-game.png");

// --- 3: LinkedIn-shown mode with the game bar over the feed ---
await setMode(true);
await page.goto("https://www.linkedin.com/feed/");
await page.waitForSelector("#lifg-bar", { timeout: 30000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(shotsDir, "3-linkedin-mode.png") });
console.log("✓ 3-linkedin-mode.png");
await setMode(false);

// --- promo tiles (element screenshots of the local HTML, exact sizes) ---
await page.goto("file://" + path.join(root, "store", "promo-tiles.html"));
await page.waitForTimeout(800); // let the embedded screenshot load
for (const [sel, file] of [
  ["#small-tile", "small-promo-tile.jpg"],
  ["#marquee-tile", "marquee-promo-tile.jpg"],
]) {
  await page
    .locator(sel)
    .screenshot({ path: path.join(promoDir, file), type: "jpeg", quality: 92 });
  console.log("✓ " + file);
}

await browser.close();
console.log("\nAssets ready: store/screenshots/ + store/promo/");
