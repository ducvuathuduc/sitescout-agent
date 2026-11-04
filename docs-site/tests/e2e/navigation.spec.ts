import { expect, test } from '@playwright/test';

for (const target of ['/', '/docs', '/docs/mcp', '/docs/demo-proxy']) {
  test(`static RSC navigation has no failed responses or console errors from ${target}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const failures: string[] = [];
    const rscResponses: string[] = [];
    const origin = new URL(baseURL!).origin;
    page.on('response', response => {
      if (new URL(response.url()).origin === origin && response.url().includes('/__next.')) rscResponses.push(response.url());
      if (new URL(response.url()).origin === origin && response.status() >= 400) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('console', message => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    await page.goto(target);
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(3000);
    for (const [label, url] of [['MCP usage', '/docs/mcp'], ['Demo proxy', '/docs/demo-proxy']]) {
      const nextLabel = new URL(page.url()).pathname.replace(/\/$/, '') === url ? 'Getting started' : label;
      const nextUrl = nextLabel === 'Getting started' ? '/docs' : url;
      await page.locator('#nd-sidebar').getByRole('link', { name: nextLabel, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${nextUrl}/?$`));
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForTimeout(3000);
    }
    expect(failures, failures.join('\n')).toEqual([]);
    expect(rscResponses.length, 'exercise exported RSC prefetch and navigation requests').toBeGreaterThan(0);
  });
}
