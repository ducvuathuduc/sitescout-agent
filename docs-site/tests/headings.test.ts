import { describe, expect, it } from 'vitest';
import { cleanMarkdownHeadings, stripLeadingEmoji } from '../lib/content/headings.mjs';
import { withFrontmatter } from '../lib/content/frontmatter.mjs';
import { extractHeadings } from '../lib/content/slug.mjs';

describe('synced heading display and GitHub anchors', () => {
  it('cleans the H1 for page titles and keeps emoji in ordinary prose', () => {
    const page = withFrontmatter('# 🧭 SiteScout\n\nAn introduction.\n\n## 📊 Benchmark\n\nKeep 📊 here.');
    expect(page.title).toBe('SiteScout');
    expect(cleanMarkdownHeadings(page.body)).toBe('## Benchmark [#-benchmark]\n\nKeep 📊 here.');
  });

  it('retains original IDs and duplicate suffixes, including cleaned collisions', () => {
    const source = '## 📊 Benchmark\n## Benchmark\n## 📊 Benchmark\n### 👩🏽‍💻 **Setup**\n### 🇻🇳 Vietnam';
    const cleaned = cleanMarkdownHeadings(source);
    const ids = [...cleaned.matchAll(/\[#([^\]]+)\]/g)].map((match) => match[1]);
    expect(ids).toEqual(extractHeadings(source).map((heading: { id: string }) => heading.id));
    expect(cleaned).not.toMatch(/📊|👩|🇻🇳/u);
    expect(cleaned).toContain('## Benchmark [#benchmark]');
    expect(cleaned).toContain('## Benchmark [#-benchmark-1]');
  });

  it('leaves fenced examples, ordinary prefixes and inline emoji unchanged', () => {
    const source = '```md\n## 📊 Example\n```\n~~~md\n## 🧭 Example\n~~~';
    expect(cleanMarkdownHeadings(source)).toBe(source);
    expect(stripLeadingEmoji('Benchmark 📊')).toBe('Benchmark 📊');
    expect(stripLeadingEmoji('1. Setup')).toBe('1. Setup');
    expect(stripLeadingEmoji('1️⃣ 🧭 Setup')).toBe('Setup');
  });
});
