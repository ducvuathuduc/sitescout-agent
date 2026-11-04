import { expect, test } from '@playwright/test';
import navConfig from '../../nav.config.json';

test('every page has static metadata, clean heading labels and source links', async ({ page, request }) => {
  const pages = [{ slug: undefined }, ...navConfig.groups.flatMap((group) => group.items)];
  for (const item of pages) {
    const url = item.slug === undefined ? '/' : item.slug ? `/docs/${item.slug}` : '/docs';
    const response = await request.get(url);
    expect(response.ok(), url).toBe(true);
    const html = await response.text();
    const details = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      const meta = (name: string) => doc.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.getAttribute('content');
      return {
        title: doc.title,
        description: meta('description'),
        ogTitle: meta('og:title'),
        ogDescription: meta('og:description'),
        ogImage: meta('og:image'),
        headings: [...doc.querySelectorAll('h1, #nd-toc a, .ss-mobile-toc a')].map((node) => node.textContent?.trim()),
        edit: doc.querySelector('.ss-page-source a')?.getAttribute('href'),
        text: doc.body.textContent,
      };
    }, html);
    expect(details.title, url).toMatch(/^.+ · SiteScout Docs$/);
    expect(details.description, url).toBeTruthy();
    expect(details.ogTitle, url).toBe(details.title);
    expect(details.ogDescription, url).toBe(details.description);
    expect(details.ogImage, url).toBeUndefined();
    expect(details.text, url).not.toMatch(/Built with Fumadocs|Welcome to Fumadocs|Lorem ipsum/i);
    for (const heading of details.headings) expect(heading, url).not.toMatch(/^\p{Extended_Pictographic}/u);
    if (item.slug !== undefined) {
      expect(details.edit, url).toMatch(/^https:\/\/github.com\/ducvuathuduc\/sitescout-agent\/edit\/main\/(docs\/|agent\/|bench\/|docs-site\/content-src\/)/);
    }
  }
});

test('previous and next cards follow the visible sidebar order', async ({ page, request }) => {
  await page.goto('/docs');
  const pages = await page.locator('#nd-sidebar a.relative[href^="/docs"]:visible').evaluateAll((links) =>
    links.map((link) => ({ url: link.getAttribute('href')!.replace(/\/$/, ''), title: link.textContent?.trim() })),
  );
  expect(pages.length).toBe(navConfig.groups.flatMap((group) => group.items).length);
  for (const [index, current] of pages.entries()) {
    const html = await (await request.get(current.url)).text();
    const cards = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      return [...doc.querySelectorAll('.ss-page-navigation a')].map((link) => ({
        label: link.querySelector('span')?.textContent,
        title: link.querySelector('strong')?.textContent,
        url: link.getAttribute('href')?.replace(/\/$/, ''),
      }));
    }, html);
    const expected = [
      pages[index - 1] && { label: 'Previous', ...pages[index - 1] },
      pages[index + 1] && { label: 'Next', ...pages[index + 1] },
    ].filter(Boolean);
    expect(cards, current.url).toEqual(expected);
  }
});

test('hero actions and the shared footer have the requested content', async ({ page }) => {
  await page.goto('/');
  for (const label of ['Get started', 'Open the live demo', 'MCP usage']) {
    await expect(page.locator('.ss-home-hero').getByRole('link', { name: label, exact: true })).toHaveCSS('height', '40px');
  }
  await expect(page.locator('.ss-program-credit')).toHaveText('Built for the Geoapify Open Geospatial Program');
  for (const url of ['/', '/docs/mcp']) {
    await page.goto(url);
    const footer = page.locator('.ss-site-footer');
    await expect(footer).toHaveCSS('border-top-width', '1px');
    await expect(footer.getByRole('link', { name: 'SiteScout MIT License' })).toHaveAttribute('href', /\/LICENSE$/);
    await expect(footer.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/ducvuathuduc/sitescout-agent');
    await expect(footer.getByRole('link', { name: 'Live demo' })).toHaveAttribute('href', 'https://sitescout.huynhthanh.workers.dev');
    await expect(footer.getByRole('link', { name: 'Geoapify', exact: true })).toHaveAttribute('href', 'https://www.geoapify.com');
    await expect(footer.getByRole('link', { name: 'Powered by Geoapify' })).toHaveAttribute('href', 'https://www.geoapify.com');
  }
});
