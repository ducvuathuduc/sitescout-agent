import { expect, test } from '@playwright/test';

test('recorded sessions show each host, server set and README outcome', async ({ page }) => {
  await page.goto('/docs/agent/sessions');
  const table = page.locator('#nd-page table');
  await expect(table.locator('th')).toHaveText(['Session', 'Date', 'Host', 'Model', 'Outcome', 'Transcript']);
  for (const id of ['04a', '04b']) {
    const row = table.locator('tbody tr').filter({ has: page.getByText(id, { exact: true }) });
    await expect(row.locator('td').nth(2)).toHaveText('Codex CLI 0.166.0 + Geoapify MCP');
    await expect(row.locator('td').nth(4)).toContainText(id === '04a' ? 'the model never called SiteScout' : 'every number cited');
  }
  await expect(table).toContainText('agent/host.mjs (open-weight)');
  await page.getByRole('link', { name: '04b Codex CLI walk-through' }).click();
  await expect(page).toHaveURL(/\/docs\/mcp\/?#recorded-two-server-session-04b-codex-cli$/);
  await expect(page.locator('#recorded-two-server-session-04b-codex-cli')).toBeVisible();
});

test('sessions table fits the content column at 1440px with single-line dates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/docs/agent/sessions');
  await page.evaluate(() => document.fonts.ready);
  const table = page.locator('#nd-page table');
  const wrapper = table.locator('..');
  expect(await wrapper.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const bounds = await wrapper.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(768);
  for (const row of await table.locator('tbody tr').all()) {
    const date = row.locator('td').nth(1);
    await expect(date).toHaveText(/^\d{4}\u2011\d{2}\u2011\d{2}$/);
    expect(await date.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    })).toBe(1);
    const link = row.locator('td').nth(5).getByRole('link', { name: 'View', exact: true });
    await expect(link).toBeVisible();
    const fileName = await link.getAttribute('title');
    expect(fileName).toMatch(/\.jsonl$/);
    await expect(link).toHaveAttribute('href', `https://github.com/ducvuathuduc/sitescout-agent/blob/main/agent/transcripts/${encodeURIComponent(fileName!)}`);
    const linkBounds = await link.boundingBox();
    expect(linkBounds!.x + linkBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  }
});

test('MCP walk-through renders its five rows and JSON, and every in-page anchor resolves', async ({ page }) => {
  await page.goto('/docs/mcp');
  const heading = page.locator('#recorded-two-server-session-04b-codex-cli');
  await expect(heading).toContainText('Recorded two-server session (04b, Codex CLI)');
  const table = heading.locator('xpath=following::table[1]');
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.locator('tbody tr').last()).toContainText('get_evidence');
  const json = await heading.locator('xpath=following::pre[1]').innerText();
  expect(JSON.parse(json)).toMatchObject({
    ref: 14, api: 'places', method: 'GET', status: 200,
    summary: { count: 5, categories: 'catering.cafe' }, credits: 1,
  });
  const anchors = await page.locator('a[href*="#"]').evaluateAll((links) => links.flatMap((link) => {
    const url = new URL(link.getAttribute('href')!, location.href);
    if (url.origin !== location.origin || url.pathname.replace(/\/$/, '') !== location.pathname.replace(/\/$/, '') || !url.hash) return [];
    const id = decodeURIComponent(url.hash.slice(1));
    return [{ href: link.getAttribute('href'), resolves: Boolean(document.getElementById(id)) }];
  }));
  expect(anchors.length).toBeGreaterThan(0);
  expect(anchors.filter((anchor) => !anchor.resolves)).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  for (const mobile of [false, true]) {
    test(`sidebar item and label styles in ${theme}, ${mobile ? 'mobile drawer' : 'desktop'}`, async ({ page }) => {
      await page.setViewportSize({ width: mobile ? 375 : 1440, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await page.goto('/docs/mcp');
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      if (mobile) await page.getByRole('button', { name: 'Open Sidebar', exact: true }).click();
      const sidebar = page.locator(mobile ? '#nd-sidebar-mobile' : '#nd-sidebar');
      await expect(sidebar).toBeVisible();
      const item = sidebar.getByRole('link', { name: 'Getting started', exact: true });
      const active = sidebar.getByRole('link', { name: 'MCP usage', exact: true });
      const textColor = theme === 'light' ? 'rgb(23, 23, 23)' : 'rgb(237, 237, 237)';
      await expect(item).toHaveCSS('color', textColor);
      await expect(item).toHaveCSS('font-size', '14px');
      await expect(item).toHaveCSS('font-weight', '400');
      await item.hover();
      await expect(item).toHaveCSS('background-color', theme === 'light' ? 'rgb(242, 242, 242)' : 'rgb(31, 31, 31)');
      await expect(active).toHaveCSS('color', textColor);
      await expect(active).toHaveCSS('font-weight', '500');
      await expect(active).toHaveCSS('background-color', theme === 'light' ? 'rgb(235, 235, 235)' : 'rgb(46, 46, 46)');
      await active.hover();
      await expect(active).toHaveCSS('background-color', theme === 'light' ? 'rgb(235, 235, 235)' : 'rgb(46, 46, 46)');
      const label = sidebar.locator('.ss-sidebar-label').first();
      await expect(label).toHaveCSS('font-size', '12px');
      await expect(label).toHaveCSS('color', theme === 'light' ? 'rgb(102, 102, 102)' : 'rgb(161, 161, 161)');
      const clientLinks = sidebar.locator('a[href*="/docs/clients/"]');
      await expect(clientLinks).toHaveText(['Claude Code', 'Cursor', 'Codex', 'Kiro', 'Claude Desktop', 'Two servers side by side', 'Record a session']);
    });
  }
}
