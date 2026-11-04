import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

// npm --prefix runs with docs-site as cwd; a relative docs-site/ prefix here
// would create the stray docs-site/docs-site tree. Anchor to this file instead.
const screenshotsDir = path.resolve(__dirname, '..', '..', '.screenshots');

const PAGES = [
  { key: 'home', path: '/' },
  { key: 'getting-started', path: '/docs' },
  { key: 'credits', path: '/docs/credits' },
  { key: 'mcp', path: '/docs/mcp' },
  { key: 'demo-proxy', path: '/docs/demo-proxy' },
  { key: 'sessions', path: '/docs/agent/sessions' },
] as const;

const THEMES = ['light', 'dark'] as const;

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '1440', width: 1440, height: 900 },
] as const;

async function prepare(page: Page, theme: (typeof THEMES)[number], viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.emulateMedia({ colorScheme: theme });
  // next-themes reads localStorage on the client; set it before the first paint
  // so the dark theme is active from the initial render.
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem('theme', value);
    } catch {
      // storage can be unavailable in some contexts; the media emulation above
      // still drives `prefers-color-scheme`.
    }
  }, theme);
}

for (const target of PAGES) {
  test.describe(target.key, () => {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        test(`${theme} @ ${viewport.name}px`, async ({ page }) => {
          await prepare(page, theme, viewport);
          const response = await page.goto(target.path, { waitUntil: 'domcontentloaded' });
          expect(response?.status(), `${target.path} should be served`).toBe(200);

          // Wait for the page shell (fumadocs renders the docs layout async).
          await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
          await page.waitForLoadState('load');
          // Let webfonts/CSS settle so screenshots are stable.
          await page.evaluate(async () => {
            await document.fonts.ready;
          });
          if (target.path === '/docs/demo-proxy') {
            await expect(page.locator('[data-mermaid] svg').first()).toBeVisible({ timeout: 45_000 });
            for (const block of await page.locator('.ss-mermaid-block').all()) {
              await expect(block.locator('[data-mermaid]')).toHaveCount(1);
            }
            const clippedLabels = await page.locator('[data-mermaid] foreignObject p').evaluateAll((labels) => labels.filter((label) => {
              const text = label.getBoundingClientRect();
              const box = label.closest('foreignObject')!.getBoundingClientRect();
              return text.top < box.top - 1 || text.bottom > box.bottom + 1;
            }).map((label) => label.textContent));
            expect(clippedLabels, 'diagram labels must fit their measured boxes').toEqual([]);
            if (viewport.width === 375) {
              const diagram = page.locator('[data-mermaid]').first();
              expect(await diagram.evaluate((element) => {
                element.scrollLeft = element.scrollWidth;
                return element.scrollLeft;
              }), 'mobile diagrams must scroll within their box').toBeGreaterThan(0);
              await diagram.evaluate((element) => { element.scrollLeft = 0; });
            }
          }

          // Overflow clipping can hide a broken grid without page scroll.
          // Require a usable content column as well as a bounded document.
          const articleWidth = await page.locator('#nd-page').evaluate((element) => element.getBoundingClientRect().width);
          expect(articleWidth, 'content column must remain readable').toBeGreaterThanOrEqual(viewport.width === 375 ? 340 : 600);

          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
          const blocking = results.violations.filter(
            (violation) => violation.impact === 'serious' || violation.impact === 'critical',
          );
          const details = blocking
            .map(
              (violation) =>
                `${violation.id} [${violation.impact}] ${violation.help} (${violation.nodes.length} node(s))\n` +
                violation.nodes
                  .slice(0, 5)
                  .map((node) => `    ${node.target.join(' ')}`)
                  .join('\n'),
            )
            .join('\n');
          expect(blocking, `axe serious/critical violations on ${target.path} (${theme}, ${viewport.name}px):\n${details}`).toEqual(
            [],
          );

          const bodyText = await page.locator('body').innerText();
          expect(bodyText.toLowerCase(), `${target.path} must not mention "vercel"`).not.toContain('vercel');

          const widths = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          }));
          expect(
            widths.scroll,
            `${target.path} must not scroll horizontally at ${viewport.name}px`,
          ).toBeLessThanOrEqual(widths.client + 1);

          await page.screenshot({
            path: path.join(screenshotsDir, `${target.key}-${theme}-${viewport.name}.png`),
            fullPage: true,
          });
        });
      }
    }
  });
}
