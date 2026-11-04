import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * The search dialog is a client component: keyboard shortcuts only work after
 * hydration. Pressing the shortcut again is safe (it is idempotent), so retry
 * until the dialog is actually open instead of sleeping on a fixed timer.
 */
async function openSearchWithKeyboard(page: Page, key: string): Promise<Locator> {
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
  const dialog = page.getByRole('dialog');

  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (await dialog.isVisible()) break;
    await page.keyboard.press(key);
    const opened = await dialog
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) break;
  }

  await expect(dialog, `search dialog did not open with ${key}`).toBeVisible({ timeout: 10_000 });
  return dialog;
}

/** Search results render asynchronously from the static index in /api/search. */
function searchResults(dialog: Locator) {
  return dialog.locator('[role="option"], [role="listbox"] a, a[data-search-item]');
}

async function expectSearchToFindCreditRules(page: Page, key: string) {
  const dialog = await openSearchWithKeyboard(page, key);

  const input = dialog.locator('input').first();
  await expect(input).toBeVisible();
  await input.fill('credit rules');

  const results = searchResults(dialog);
  await expect(results.first(), 'search index returned no results for "credit rules"').toBeVisible({
    timeout: 20_000,
  });
  await expect(results.filter({ hasText: /credit rules/i }).first()).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

test.describe('search', () => {
  for (const target of ['/', '/docs/mcp'] as const) {
    test(`Ctrl+K opens search and finds "credit rules" on ${target}`, async ({ page }) => {
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await expectSearchToFindCreditRules(page, 'Control+k');
    });

    test(`Cmd+K opens search and finds "credit rules" on ${target}`, async ({ page }) => {
      test.skip(process.platform !== 'darwin', 'Cmd+K is the macOS shortcut for the same handler');
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await expectSearchToFindCreditRules(page, 'Meta+k');
    });
  }
});

test.describe('content features', () => {
  test('home shares the docs navigation and copies each visible terminal tab exactly', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (value: string) => { sessionStorage.setItem('copied-command', value); } },
      });
    });
    await page.goto('/');
    await expect(page.locator('.ss-header')).toBeVisible();
    await expect(page.locator('#nd-sidebar')).toBeVisible();
    await expect(page.locator('#nd-toc')).toHaveCount(0);
    for (const label of ['Run locally', 'Claude Code', 'Ask a question']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      const panel = page.getByRole('tabpanel');
      await expect(panel).toBeVisible();
      const visibleCommand = await panel.locator('code').innerText();
      await page.getByRole('button', { name: `Copy the ${label} command`, exact: true }).click();
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('copied-command'))).toBe(visibleCommand);
    }
    await page.getByRole('tab', { name: 'Ask a question', exact: true }).press('Home');
    await expect(page.getByRole('tab', { name: 'Run locally', exact: true })).toBeFocused();
    await page.getByRole('tab', { name: 'Run locally', exact: true }).press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Claude Code', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('Getting started has connected steps and package-manager terminal tabs', async ({ page }) => {
    await page.goto('/docs');
    const step = page.locator('.fd-step').first();
    const circle = await step.evaluate((element) => {
      const style = getComputedStyle(element, '::before');
      return { width: style.width, height: style.height, border: style.borderTopWidth };
    });
    expect(circle).toEqual({ width: '24px', height: '24px', border: '1px' });
    const tabs = page.locator('.ss-code-tabs').first();
    await expect(tabs.getByRole('tab')).toHaveText(['pnpm', 'yarn', 'npm', 'bun']);
    for (const manager of ['pnpm', 'yarn', 'npm', 'bun']) {
      await tabs.getByRole('tab', { name: manager, exact: true }).click();
      const panel = tabs.getByRole('tabpanel');
      await expect(panel.locator('figcaption')).toHaveText('Terminal');
      await expect(panel.locator('.ss-terminal-icon')).toHaveText('>_');
      await expect(panel.locator('pre')).toContainText(`${manager} run build`);
    }
  });

  test('375px sidebar navigation, mobile TOC and terminal overflow work', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const panel = page.getByRole('tabpanel');
    expect(await panel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await panel.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      return element.scrollLeft;
    })).toBeGreaterThan(0);
    await page.locator('.ss-header').getByRole('button', { name: 'Open Sidebar' }).click();
    const drawer = page.locator('#nd-sidebar-mobile');
    await expect(drawer).toBeVisible();
    await drawer.evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: path.resolve(__dirname, '..', '..', '.screenshots', 'mobile-sidebar.png') });
    await drawer.getByRole('link', { name: 'Getting started', exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/?$/);
    await expect(drawer).toBeHidden();
    const toc = page.locator('.ss-mobile-toc');
    await toc.locator('summary').click();
    await expect(toc.getByRole('navigation')).toBeVisible();
    await toc.evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: path.resolve(__dirname, '..', '..', '.screenshots', 'mobile-toc.png') });
    await toc.getByRole('link', { name: 'Next steps', exact: true }).click();
    await expect(page).toHaveURL(/#next-steps$/);
    const position = await page.locator('#next-steps').evaluate((element) => element.getBoundingClientRect().top);
    expect(position).toBeGreaterThanOrEqual(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto('/docs/credits');
    const tableWrapper = page.locator('#nd-page table').first().locator('..');
    expect(await tableWrapper.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  });

  test('generated descriptions are not repeated in the article', async ({ page }) => {
    await page.goto('/docs/mcp');
    const description = await page.locator('#nd-page > p').first().innerText();
    expect(description.length).toBeGreaterThan(0);
    expect(await page.locator('#nd-page .prose').innerText()).not.toContain(description);
  });

  test('desktop logo, search and content keep the same left edges across layouts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const layouts = [];
    for (const url of ['/', '/docs', '/docs/mcp']) {
      await page.goto(url);
      const edges = await page.evaluate(() => {
        const x = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().x;
        return { logo: x('.ss-brand img'), search: x('#nd-sidebar .ss-search-trigger'),
          sidebar: x('#nd-sidebar'), title: x('#nd-page h1') };
      });
      expect(edges.logo).toBe(edges.search);
      layouts.push(edges);
    }
    expect(layouts[1]).toEqual(layouts[0]);
    expect(layouts[2]).toEqual(layouts[0]);
  });

  test('terminal scrolls to the complete last command and prompt expands from its preview', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const panel = page.getByRole('tabpanel');
    const metrics = await panel.evaluate(el => {
      el.scrollLeft = el.scrollWidth;
      const command = el.querySelector('pre')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { scroll: el.scrollLeft, end: command.right, right: box.right,
      };
    });
    expect(metrics.scroll).toBeGreaterThan(0);
    expect(metrics.end).toBeLessThanOrEqual(metrics.right + 1);
    const scrollbar = page.getByRole('scrollbar', { name: 'Run locally terminal horizontal scroll' });
    await expect(scrollbar).toBeVisible();
    expect((await scrollbar.boundingBox())!.height).toBe(6);
    await expect(scrollbar).toHaveAttribute('aria-valuenow', '100');
    await scrollbar.press('Home');
    await expect.poll(() => panel.evaluate(el => el.scrollLeft)).toBe(0);
    await scrollbar.press('End');
    await expect(scrollbar).toHaveAttribute('aria-valuenow', '100');
    const trackBox = (await scrollbar.boundingBox())!;
    const thumbBox = (await scrollbar.locator('.ss-terminal-thumb').boundingBox())!;
    await page.mouse.move(thumbBox.x + thumbBox.width / 2, trackBox.y + 3);
    await page.mouse.down();
    await page.mouse.move(trackBox.x, trackBox.y + 3, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => panel.evaluate(el => el.scrollLeft)).toBe(0);
    const prompt = page.locator('.ss-agent-prompt');
    const previewHeight = await prompt.locator('.ss-agent-preview').evaluate(el => el.clientHeight);
    await prompt.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(prompt.getByRole('button', { name: 'Show less', exact: true })).toHaveAttribute('aria-expanded', 'true');
    expect(await prompt.locator('.ss-agent-preview').evaluate(el => el.clientHeight)).toBeGreaterThan(previewHeight);
    await prompt.getByRole('button', { name: 'Show less', exact: true }).click();
    await expect(prompt.getByRole('button', { name: 'Show more', exact: true })).toHaveAttribute('aria-expanded', 'false');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`table and included code styling in ${theme}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await page.goto('/docs/credits');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/);
      const table = page.locator('#nd-page table').first();
      const style = await table.locator('th').first().evaluate((cell) => {
        const s = getComputedStyle(cell);
        const wrapper = getComputedStyle(cell.closest('table')!.parentElement!);
        return { fontSize: s.fontSize, lineHeight: s.lineHeight, padding: s.padding,
          verticalAlign: s.verticalAlign, background: s.backgroundColor,
          radius: wrapper.borderRadius, overflow: wrapper.overflowX };
      });
      expect(style).toEqual({ fontSize: '14px', lineHeight: '21px', padding: '8px 12px',
        verticalAlign: 'top', background: theme === 'dark' ? 'rgb(17, 17, 17)' : 'rgb(250, 250, 250)',
        radius: '8px', overflow: 'auto' });
      const code = page.locator('#nd-page table code').first();
      expect(await code.evaluate(el => {
        const s = getComputedStyle(el);
        return { whiteSpace: s.whiteSpace, background: s.backgroundColor, border: s.borderWidth,
          margin: s.margin, padding: s.padding, fontSize: s.fontSize };
      })).toEqual({ whiteSpace: 'normal', background: 'rgba(0, 0, 0, 0)', border: '0px', margin: '0px', padding: '0px', fontSize: '12.5px' });
      await page.evaluate(() => window.scrollTo(0, 600));
      expect(await page.locator('.ss-header').evaluate(el => {
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, border: s.borderBottomWidth, top: el.getBoundingClientRect().top };
      })).toEqual({ background: theme === 'dark' ? 'rgb(10, 10, 10)' : 'rgb(255, 255, 255)', border: '1px', top: 0 });
      await expect(page.locator('figcaption').filter({ hasText: 'src/engine/geoapify.ts' })).toBeVisible();
      await expect(page.locator('figcaption').filter({ hasText: 'web/worker/budget.ts' })).toBeAttached();
    });
  }

  test('mermaid diagram renders on /docs/demo-proxy', async ({ page }) => {
    await page.goto('/docs/demo-proxy', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

    // The Mermaid component is lazy and renders client-side, so allow time.
    const diagram = page
      .locator('.mermaid svg, [data-mermaid] svg, svg[id^="mermaid"], svg[aria-roledescription="flowchart"]')
      .first();
    await expect(diagram, 'no Mermaid SVG was rendered').toBeVisible({ timeout: 45_000 });

    const box = await diagram.boundingBox();
    expect(box, 'mermaid svg has no layout box').not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(120);
    expect(box?.height ?? 0).toBeGreaterThan(60);
  });

  test('code blocks expose a copy button on /docs/mcp', async ({ page }) => {
    await page.goto('/docs/mcp', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 20_000 });

    const copyButtons = page.locator('figure.shiki button');
    await expect(copyButtons.first(), 'no copy button next to a code block').toBeAttached({ timeout: 15_000 });
    expect(await copyButtons.count()).toBeGreaterThan(0);
  });
});
