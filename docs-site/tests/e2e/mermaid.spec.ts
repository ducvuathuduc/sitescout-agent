import { expect, test } from '@playwright/test';
import path from 'node:path';

const pages = [
  { slug: 'demo-proxy', count: 1, multiline: [0, 'Browser', 'Leaflet'] },
  { slug: 'mcp', count: 1, multiline: [0, 'MCP host', 'Claude'] },
  { slug: 'tutorial', count: 2, multiline: [1, 'Cloudflare Worker', 'key ='] },
  { slug: 'how-it-works', count: 1 },
] as const;

for (const width of [1440, 375]) {
  for (const theme of ['light', 'dark'] as const) {
    for (const target of pages) {
      test(`Mermaid /docs/${target.slug}: ${width}px ${theme}`, async ({ page, baseURL }) => {
        // Exercise only the local static export, including lazy Mermaid assets.
        expect(new URL(baseURL!).hostname).toBe('127.0.0.1');
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        await page.goto(`/docs/${target.slug}`);
        await expect(page.locator('html')).toHaveClass(new RegExp(theme));
        const containers = page.locator('[data-mermaid]');
        await expect(containers).toHaveCount(target.count);
        await expect(page.locator('[data-mermaid][data-state="ready"]')).toHaveCount(target.count, {
          timeout: 45_000,
        });

        for (let index = 0; index < target.count; index++) {
          const container = containers.nth(index);
          const diagram = container.locator(':scope > svg');
          await expect(diagram).toBeAttached();
          const metrics = await diagram.evaluate(element => {
            const svg = element as SVGSVGElement;
            const box = svg.getBoundingClientRect();
            const content = svg.querySelector('g')!.getBoundingClientRect();
            const wrapper = svg.parentElement!;
            const wrapperStyle = getComputedStyle(wrapper);
            const background = wrapperStyle.backgroundColor;

            function luminance(color: string) {
              const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => {
                const value = channel / 255;
                return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
              });
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            }
            function contrast(foreground: string, backdrop: string) {
              const a = luminance(foreground);
              const b = luminance(backdrop);
              return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            }

            return {
              nodes: svg.querySelectorAll('.node').length,
              width: box.width,
              height: box.height,
              contentWidth: content.width,
              contentHeight: content.height,
              naturalWidth: svg.viewBox.baseVal.width,
              viewportWidth: wrapper.clientWidth - parseFloat(wrapperStyle.paddingLeft)
                - parseFloat(wrapperStyle.paddingRight),
              overflow: wrapperStyle.overflowX,
              wrapperHeight: wrapper.getBoundingClientRect().height,
              labels: [...svg.querySelectorAll<SVGTextElement>('text')].map(label => {
                const style = getComputedStyle(label);
                const matrix = label.getScreenCTM()!;
                const node = label.closest('.node');
                const shape = node?.querySelector('.label-container');
                const fill = shape ? getComputedStyle(shape).fill : background;
                const fontSize = parseFloat(style.fontSize);
                return {
                  fontSize,
                  // Computed font-size stays 14px even when a viewBox shrinks
                  // the actual glyphs to a few pixels. Check the screen scale too.
                  screenFontSize: fontSize * Math.hypot(matrix.c, matrix.d),
                  contrast: contrast(style.fill, fill),
                };
              }),
              edges: [...svg.querySelectorAll('.flowchart-link')].map(edge =>
                contrast(getComputedStyle(edge).stroke, background)),
            };
          });

          expect(metrics.nodes).toBeGreaterThan(0);
          expect(metrics.labels.length).toBeGreaterThan(0);
          for (const label of metrics.labels) {
            expect(label.fontSize).toBeGreaterThanOrEqual(12);
            expect(label.fontSize).toBeLessThanOrEqual(16);
            expect(label.screenFontSize).toBeGreaterThanOrEqual(12);
            expect(label.screenFontSize).toBeLessThanOrEqual(16);
            expect(label.contrast).toBeGreaterThanOrEqual(4.5);
          }
          expect(metrics.edges.length).toBeGreaterThan(0);
          for (const contrast of metrics.edges) expect(contrast).toBeGreaterThanOrEqual(3);
          expect(metrics.height).toBeGreaterThanOrEqual(120);
          expect(metrics.height).toBeLessThanOrEqual(900);
          // Catch clipping and a tiny drawing surrounded by an oversized SVG.
          expect(metrics.width).toBeGreaterThanOrEqual(metrics.contentWidth * 0.9);
          expect(metrics.contentWidth).toBeGreaterThanOrEqual(metrics.width * 0.9);
          expect(Math.abs(metrics.width - metrics.naturalWidth)).toBeLessThan(1);
          expect(metrics.height - metrics.contentHeight).toBeLessThanOrEqual(80);
          expect(metrics.wrapperHeight - metrics.height).toBeLessThanOrEqual(60);
          expect(metrics.overflow).toBe('auto');
          if (metrics.width > metrics.viewportWidth) {
            expect(await container.evaluate(el => {
              el.scrollLeft = el.scrollWidth;
              return el.scrollLeft;
            })).toBeGreaterThan(0);
            await container.evaluate(el => { el.scrollLeft = 0; });
          } else {
            const centered = await diagram.evaluate(el => {
              const box = el.getBoundingClientRect();
              const parent = el.parentElement!.getBoundingClientRect();
              return Math.abs((box.left + box.right) - (parent.left + parent.right));
            });
            expect(centered).toBeLessThanOrEqual(2);
          }

          if (width === 1440) {
            // Expose the whole scrollable SVG for the artifact only; assertions
            // above exercise its unmodified 1440px layout and scroll container.
            await diagram.screenshot({
              path: path.resolve(__dirname, '../../.screenshots',
                `mermaid-${target.slug}-${index + 1}-${theme}.png`),
              style: `
                .ss-mermaid { overflow: visible !important; border-color: transparent !important; }
                .ss-mermaid > svg { position: relative; z-index: 100; background: var(--ss-bg); }
                body, #nd-notebook-layout { overflow: visible !important; }
                .ss-header, #nd-toc { visibility: hidden !important; }
              `,
            });
          }
        }

        if ('multiline' in target) {
          const [index, firstLine, nextLine] = target.multiline;
          const node = containers.nth(index).locator('.node').filter({ hasText: firstLine }).first();
          const lines = await node.locator('text > tspan').evaluateAll(rows =>
            rows.map(row => ({ text: row.textContent!, top: row.getBoundingClientRect().top })),
          );
          const first = lines.find(line => line.text.includes(firstLine));
          const next = lines.find(line => line.text.includes(nextLine));
          expect(first).toBeDefined();
          expect(next).toBeDefined();
          expect(next!.top).toBeGreaterThan(first!.top + 12);
        }

        if (width === 375) {
          expect(await page.evaluate(() =>
            document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          )).toBe(true);
        }
      });
    }
  }
}
