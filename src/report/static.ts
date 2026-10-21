/**
 * Static map-image export for README/tutorial heroes.
 *
 * HONEST CONTRACT:
 *  - If `playwright` is resolvable, render the visual report HTML headlessly
 *    (Chromium, viewport 1200×630) and write the PNG.
 *  - Otherwise, print the documented manual procedure and exit non-zero.
 *  - This module NEVER fabricates an image.
 *
 * Usage: node dist/report/static.js <report.html> <out.png>
 */
import { readFileSync } from "node:fs";

const MANUAL_PROCEDURE = [
  "Static export needs a headless browser. Manual procedure:",
  "  1. Open the visual report HTML in Chrome/Edge.",
  "  2. DevTools → Device toolbar → set viewport to 1200 × 630.",
  "  3. Scroll the map hero into view; wait for tiles to load.",
  "  4. DevTools → ⋮ → Capture screenshot (or OS screenshot of the viewport).",
  "  5. Save as <playbook>/<question-id>/report-hero.png (1200×630).",
  "Or: npm i -D playwright && npx playwright install chromium, then re-run.",
].join("\n");

async function main(): Promise<void> {
  const [htmlPath, outPng] = process.argv.slice(2);
  if (!htmlPath || !outPng) {
    console.error("usage: static.js <report.html> <out.png>");
    process.exit(2);
  }
  readFileSync(htmlPath, "utf-8"); // fail fast if missing

  // Optional peer: resolved only at runtime. A non-literal specifier keeps
  // TypeScript from requiring playwright's type declarations.
  const specifier: string = "playwright";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let playwright: any;
  try {
    playwright = await import(specifier);
  } catch {
    console.error("playwright is not installed.\n\n" + MANUAL_PROCEDURE);
    process.exit(3);
  }

  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto("file://" + htmlPath);
    await page.setViewportSize({ width: 1200, height: 630 });
    await new Promise((r) => setTimeout(r, 2500)); // let tiles/fonts settle
    await page.screenshot({ path: outPng });
    console.log(`wrote ${outPng}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`static export failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
