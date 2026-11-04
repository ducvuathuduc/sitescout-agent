import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { extractHeadings, slugHeadings } from '../lib/content/slug.mjs';
import { extractDescription, splitDescription, withFrontmatter } from '../lib/content/frontmatter.mjs';
import {
  GITHUB_REPO_URL,
  buildAssetPlan,
  collectImageReferences,
  copyAssets,
  rewriteMarkdownLinks,
} from '../lib/content/links.mjs';
import { buildMetaFiles } from '../lib/content/meta.mjs';
import { buildSessionsPage, parseOutcomeTable } from '../lib/content/sessions.mjs';
import { runSync } from '../lib/content/sync.mjs';
import { CONTENT_SRC_PAGES, SYNC_SOURCES } from '../lib/content/sources.mjs';

const fixtureDir = new URL('../.cache/', import.meta.url);
fs.mkdirSync(fixtureDir, { recursive: true });
const root = fs.mkdtempSync(fileURLToPath(new URL('sitescout-sync-', fixtureDir)));

function write(relativePath: string, content: string) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
}

write('docs/a.md', '# A\n');
write('docs/b.md', '# B\n\n## Intro\n');
write('docs/img/pic.png', 'not really a png');
write('docs/x/pic.png', 'second pic');
write('docs/y/pic.png', 'third pic');
write('docs/file.pdf', 'not really a pdf');
write('src/code.ts', 'export {};\n');
write('examples/keep.txt', 'x');
write('agent/README.md', '# Agent\n\n## Setup\n');

const sources = [
  { from: 'docs/a.md', slug: 'a' },
  { from: 'docs/b.md', slug: 'b' },
  { from: 'agent/README.md', slug: 'agent', fragmentAliases: { 'old-setup': 'setup' } },
];

const navConfig = JSON.parse(
  fs.readFileSync(new URL('../nav.config.json', import.meta.url), 'utf8'),
);

function rewrite(markdown: string, sourceRel = 'docs/a.md') {
  const sourcePath = path.join(root, sourceRel);
  const assets = buildAssetPlan(collectImageReferences(markdown, { repoRoot: root, sourcePath }), {
    repoRoot: root,
  });
  return rewriteMarkdownLinks(markdown, {
    repoRoot: root,
    sourcePath,
    sourceRelPath: sourceRel,
    sources,
    assets,
  });
}

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('GitHub-compatible heading slugs', () => {
  it('keeps Vietnamese diacritics and adds duplicate suffixes', () => {
    const markdown = [
      '## Thảo Điền',
      '',
      '## Thảo Điền',
      '',
      '## Thảo Điền',
      '',
      '## 9. Put it online safely: the demo proxy (5 min)',
    ].join('\n');

    expect(slugHeadings(markdown)).toEqual([
      'thảo-điền',
      'thảo-điền-1',
      'thảo-điền-2',
      '9-put-it-online-safely-the-demo-proxy-5-min',
    ]);
  });

  it('drops the source H1 like the generated pages do', () => {
    expect(slugHeadings('# Title\n\n## Credit rules', { dropFirstH1: true })).toEqual([
      'credit-rules',
    ]);
  });

  it('ignores headings inside fenced code', () => {
    const markdown = ['# Title', '', '```md', '## Not a heading', '```', '', '## Real'].join('\n');
    expect(extractHeadings(markdown, { dropFirstH1: true }).map((heading) => heading.id)).toEqual([
      'real',
    ]);
  });
});

describe('frontmatter', () => {
  it('removes a multiline formatted lead on Windows without removing later prose', () => {
    const page = withFrontmatter([
      '# A page', '',
      'Use **SiteScout** with [your editor](/docs/clients/cursor)',
      'to run `scout` locally.', '',
      '## Continue', '', 'Use **SiteScout** again.',
    ].join('\r\n'));

    expect(page.description).toBe('Use SiteScout with your editor to run scout locally.');
    expect(page.body).toBe('## Continue\n\nUse **SiteScout** again.');
    expect(page.content.match(/to run scout locally\./g)).toHaveLength(1);
  });

  it('uses the first H1 as title and the first plain paragraph as description', () => {
    const markdown = [
      '# Tutorial: build an agent',
      '',
      '**Time:** ~40 minutes · **Level:** TypeScript and a terminal.',
      '',
      '## Next',
      '',
      'Body.',
    ].join('\n');

    const page = withFrontmatter(markdown, { sourcePath: 'docs/tutorial.md' });

    expect(page.title).toBe('Tutorial: build an agent');
    expect(page.description).toBe('Time: ~40 minutes · Level: TypeScript and a terminal.');
    expect(page.content).toContain('title: "Tutorial: build an agent"');
  });

  it('removes the lead paragraph from the body so the description is not printed twice', () => {
    const markdown = [
      '# MCP usage',
      '',
      'The first paragraph becomes the page description.',
      '',
      'The second paragraph stays.',
    ].join('\n');

    const page = withFrontmatter(markdown, { sourcePath: 'docs/mcp.md' });

    expect(page.description).toBe('The first paragraph becomes the page description.');
    expect(page.body).not.toContain('The first paragraph becomes the page description.');
    expect(page.body.trim()).toBe('The second paragraph stays.');
    // The rendered page only shows the lead once: in the frontmatter.
    expect(page.content.match(/The first paragraph becomes the page description\./g)).toHaveLength(1);
  });

  it('keeps headings, lists and code that follow the removed lead', () => {
    const markdown = [
      '# Page',
      '',
      'Lead paragraph.',
      '',
      '## Section',
      '',
      '- item',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');

    const page = withFrontmatter(markdown, { sourcePath: 'docs/page.md' });

    expect(page.description).toBe('Lead paragraph.');
    expect(page.body.startsWith('## Section')).toBe(true);
    expect(page.body).toContain('- item');
    expect(page.body).toContain('const x = 1;');
  });

  it('handles a body that is only the lead paragraph', () => {
    const page = withFrontmatter('# Only\n\nJust a lead.\n', { sourcePath: 'docs/only.md' });

    expect(page.description).toBe('Just a lead.');
    expect(page.body.trim()).toBe('');
  });

  it('returns the body unchanged when there is no paragraph to use', () => {
    const body = '## Section\n\n- item\n';
    expect(splitDescription(body)).toEqual({ description: '', body });
  });

  it('skips code fences and lists when looking for the first paragraph', () => {
    const markdown = ['# X', '', '```bash', 'npm ci', '```', '', '- list item', '', 'A real paragraph.'].join(
      '\n',
    );
    expect(extractDescription(markdown)).toBe('A real paragraph.');
  });

  it('truncates at a word boundary with an ellipsis only when cut', () => {
    const long = 'word '.repeat(50).trim();
    const description = extractDescription(`# X\n\n${long}`);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('…')).toBe(true);
    expect(description).not.toContain('  ');
  });
});

describe('link rewriting', () => {
  it('rewrites synced docs, repo files, folders, images and PDFs', () => {
    const markdown = [
      '# A',
      '',
      '[b](./b.md#intro) [repo](../src/code.ts) [folder](../examples/)',
      '![pic](img/pic.png) [pdf](file.pdf) [agent](../agent/README.md)',
    ].join('\n');

    const out = rewrite(markdown);

    expect(out).toContain('[b](/docs/b#intro)');
    expect(out).toContain(`[repo](${GITHUB_REPO_URL}/blob/main/src/code.ts)`);
    expect(out).toContain(`[folder](${GITHUB_REPO_URL}/tree/main/examples)`);
    expect(out).toContain('![pic](/docs-assets/pic.png)');
    expect(out).toContain(`[pdf](${GITHUB_REPO_URL}/blob/main/docs/file.pdf)`);
    expect(out).toContain('[agent](/docs/agent)');
  });

  it('rewrites links whose text contains inline code', () => {
    const out = rewrite('# A\n\n[`examples/`](../examples/)\n');
    expect(out).toContain(`[\`examples/\`](${GITHUB_REPO_URL}/tree/main/examples)`);
  });

  it('rewrites HTML href and src in prose', () => {
    const out = rewrite('# A\n\n<a href="../src/code.ts">x</a> <img src="img/pic.png">\n');
    expect(out).toContain(`href="${GITHUB_REPO_URL}/blob/main/src/code.ts"`);
    expect(out).toContain('src="/docs-assets/pic.png"');
  });

  it('leaves fenced code, indented code and inline code untouched', () => {
    const markdown = [
      '# A',
      '',
      '```md',
      '[fenced](./b.md) ![fenced](img/pic.png)',
      '```',
      '',
      '    [indented](./b.md)',
      '',
      'Inline `[inline](./b.md)` stays.',
      '',
      '[real](./b.md)',
    ].join('\n');

    const out = rewrite(markdown);

    expect(out).toContain('[fenced](./b.md) ![fenced](img/pic.png)');
    expect(out).toContain('[indented](./b.md)');
    expect(out).toContain('Inline `[inline](./b.md)` stays.');
    expect(out).toContain('[real](/docs/b)');
  });

  it('leaves absolute, protocol-relative and site-absolute links alone', () => {
    const markdown = [
      '# A',
      '',
      '[a](https://example.com/x?y=1#z) [b](//cdn.example.com/x.png)',
      '[c](/docs/mcp#credit-rules) [d](/docs-assets/pic.png) [e](mailto:hi@example.com)',
    ].join('\n');

    expect(rewrite(markdown)).toBe(markdown);
  });

  it('fails with file:line:target for a missing target', () => {
    expect(() => rewrite('# A\n\n[x](./missing.md)\n')).toThrow(
      /docs\/a\.md:3:\.\/missing\.md/,
    );
  });

  it('fails with file:line:target for a missing heading fragment', () => {
    expect(() => rewrite('# A\n\n[x](./b.md#nope)\n')).toThrow(
      /docs\/a\.md:3:\.\/b\.md#nope/,
    );
  });

  it('accepts an existing heading fragment', () => {
    expect(rewrite('# A\n\n[x](./b.md#intro)\n')).toContain('[x](/docs/b#intro)');
  });

  it('maps explicitly renamed source fragments and still validates the destination', () => {
    expect(rewrite('# A\n\n[setup](../agent/README.md#old-setup)\n')).toContain('[setup](/docs/agent#setup)');
    expect(() => rewrite('# A\n\n[missing](../agent/README.md#unknown-heading)\n')).toThrow(/unknown-heading/);
  });

  it('copies referenced docs images and hashes colliding basenames', () => {
    const markdown = [
      '# A',
      '',
      '![one](x/pic.png) ![two](y/pic.png)',
    ].join('\n');

    const plan = buildAssetPlan(
      collectImageReferences(markdown, { repoRoot: root, sourcePath: path.join(root, 'docs/a.md') }),
      { repoRoot: root },
    );

    const names = [...plan.values()];
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
    expect(names.every((name) => name.endsWith('-pic.png'))).toBe(true);

    const publicDir = path.join(root, 'public', 'docs-assets');
    copyAssets(plan, publicDir);
    for (const name of names) expect(fs.existsSync(path.join(publicDir, name))).toBe(true);
  });

  it('is idempotent on already-rewritten links (fast-check)', () => {
    const targets = [
      './b.md',
      './b.md#intro',
      '../src/code.ts',
      '../examples/',
      'img/pic.png',
      'file.pdf',
      '../agent/README.md',
    ];

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...targets), { maxLength: 8 }),
        (chosen) => {
          const markdown = `# A\n\n${chosen.map((target) => `[x](${target})`).join(' ')}\n`;
          const once = rewrite(markdown);
          const twice = rewrite(once);
          expect(twice).toBe(once);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('meta.json', () => {
  it('lists the nav groups as flat separators and pages', () => {
    const files = buildMetaFiles(navConfig);
    const rootMeta = files.find((file) => file.path === 'meta.json');

    expect(rootMeta?.data.pages).toContain('---Start---');
    expect(rootMeta?.data.pages).toContain('mcp');
    expect(rootMeta?.data.pages).toContain('...agent');
    expect(rootMeta?.data.pages).toContain('...clients');
    expect(rootMeta?.data.pages).toContain('...benchmarks');
  });

  it('writes folder metas with flat labelled groups', () => {
    const files = buildMetaFiles(navConfig);
    const agent = files.find((file) => file.path === 'agent/meta.json');
    expect(agent?.data).toMatchObject({
      title: 'Agent setup',
      defaultOpen: true,
      collapsible: false,
      pages: ['sessions', 'index'],
    });
  });
});

describe('required client sources', () => {
  function fixture(name: string) {
    const relative = `clients-${name}`;
    const repoRoot = path.join(root, relative);
    const docsSiteDir = path.join(repoRoot, 'docs-site');
    write(`${relative}/docs-site/nav.config.json`, JSON.stringify(navConfig));
    for (const page of CONTENT_SRC_PAGES) write(`${relative}/docs-site/${page.from}`, '# Local page\n');
    for (const source of SYNC_SOURCES) {
      write(`${relative}/${source.from}`, '# Fixture\n\nDescription.\n');
    }
    fs.mkdirSync(path.join(repoRoot, 'agent', 'transcripts'), { recursive: true });
    return { relative, repoRoot, docsSiteDir };
  }

  it.each(['codex', 'kiro', 'record-claude-code'])('fails before writing output when %s is absent', (client) => {
    const input = fixture(`missing-${client}`);
    fs.unlinkSync(path.join(input.repoRoot, `agent/clients/${client}.md`));
    expect(() => runSync(input)).toThrow(`Missing source document agent/clients/${client}.md`);
    expect(fs.existsSync(path.join(input.docsSiteDir, 'content/docs'))).toBe(false);
  });

  it('includes available client pages in the requested order with their nav titles', () => {
    const input = fixture('available');
    for (const client of ['codex', 'kiro']) write(`${input.relative}/agent/clients/${client}.md`, '# Longer source title\n\nClient instructions.\n');
    const result = runSync(input);
    expect(result.pages).toContain('clients/codex.md');
    expect(result.pages).toContain('clients/kiro.md');
    expect(result.pages).toContain('clients/record-claude-code.md');
    const meta = JSON.parse(fs.readFileSync(path.join(input.docsSiteDir, 'content/docs/clients/meta.json'), 'utf8'));
    expect(meta.pages).toEqual(['claude-code', 'cursor', 'codex', 'kiro', 'claude-desktop', 'two-servers', 'record-claude-code']);
    expect(fs.readFileSync(path.join(input.docsSiteDir, 'content/docs/clients/codex.md'), 'utf8')).toContain('title: "Codex"');
    expect(fs.readFileSync(path.join(input.docsSiteDir, 'content/docs/clients/kiro.md'), 'utf8')).toContain('title: "Kiro"');
    expect(fs.readFileSync(path.join(input.docsSiteDir, 'content/docs/clients/record-claude-code.md'), 'utf8')).toContain('title: "Record a session"');
  });
});

describe('recorded sessions', () => {
  it('shows mixed hosts and servers and retains the README outcomes for 04a and 04b', () => {
    const page = buildSessionsPage({
      readme: [
        '| `04a-search.jsonl` | Codex CLI | Web search skipped SiteScout | Follow-up |',
        '| `04b-two-servers.jsonl` | Codex CLI | Both servers, every number cited | Follow-up |',
      ].join('\n'),
      transcripts: [
        { file: '04b-two-servers.jsonl', text: JSON.stringify({
          ts: '2026-11-04T12:58:50.486Z', model: 'gpt-6.1-sol',
          host: 'Codex CLI 0.166.0 (codex exec --json)',
          server: { name: 'sitescout', version: '1.1.0' },
          servers: [{ name: 'sitescout', version: '1.1.0' }, { name: 'geoapify' }],
        }) },
        { file: '04a-search.jsonl', text: JSON.stringify({
          ts: '2026-11-04T12:55:41.648Z', model: 'gpt-6.1-sol',
          host: 'Codex CLI 0.166.0 (codex exec --json)',
          server: { name: 'sitescout', version: '1.1.0' },
          servers: [{ name: 'geoapify' }, { name: 'sitescout', version: '1.1.0' }],
        }) },
        { file: '01-legacy.jsonl', text: JSON.stringify({
          ts: '2026-10-22T13:17:54.195Z', model: '@cf/model-a',
          server: { name: 'sitescout', version: '1.0.0' },
        }) },
      ],
    });
    expect(page.rows.map(({ id, host, servers, outcome }: { id: string; host: string; servers: string; outcome: string }) => ({ id, host, servers, outcome }))).toEqual([
      { id: '01', host: 'agent/host.mjs (open-weight)', servers: 'sitescout 1.0.0', outcome: 'not recorded' },
      { id: '04a', host: 'Codex CLI 0.166.0 + Geoapify MCP', servers: 'sitescout 1.1.0 + geoapify MCP', outcome: 'Web search skipped SiteScout' },
      { id: '04b', host: 'Codex CLI 0.166.0 + Geoapify MCP', servers: 'sitescout 1.1.0 + geoapify MCP', outcome: 'Both servers, every number cited' },
    ]);
    expect(page.content).toContain('| Session | Date | Host | Model | Outcome | Transcript |');
    expect(page.content).not.toContain('| Servers |');
    for (const row of page.rows) {
      expect(page.content).toContain(`| ${row.date.replace(/-/g, '\u2011')} |`);
      expect(page.content).toContain(`[View](${row.url} "${row.file}")`);
      expect(page.content).not.toContain(`[${row.file}]`);
    }
    expect(page.content).toContain('/docs/mcp#recorded-two-server-session-04b-codex-cli');
    expect(page.content).not.toContain('Host for every session:');
    expect(page.description).not.toContain('open-weight');
  });

  it('matches outcomes by transcript id prefix and uses "not recorded" when absent', () => {
    const readme = [
      '| File | Model | Outcome | What |',
      '|---|---|---|---|',
      '| `01-a.jsonl` | Model A | ✅ correct | — |',
      '| `02b-…-invalid.jsonl` | Model B | ❌ failed | fix |',
    ].join('\n');

    const outcomes = parseOutcomeTable(readme);
    expect(outcomes.get('01')).toBe('✅ correct');
    expect(outcomes.get('02b')).toBe('❌ failed');

    const page = buildSessionsPage({
      readme,
      transcripts: [
        {
          file: '01-a.jsonl',
          text: '{"ts":"2026-10-22T13:17:54.195Z","model":"@cf/model-a","server":{"name":"sitescout","version":"1.0.0"}}\n',
        },
        {
          file: '03c-c.jsonl',
          text: '{"ts":"2026-10-22T13:33:29.385Z","model":"@cf/model-c","server":{"name":"sitescout","version":"1.0.0"}}\n',
        },
      ],
    });

    expect(page.content).toContain('agent/host.mjs (open-weight)');
    expect(page.content).toContain('2026\u201110\u201122');
    expect(page.content).toContain('✅ correct');
    expect(page.content).toContain('not recorded');
    expect(page.content).toContain(
      'https://github.com/ducvuathuduc/sitescout-agent/blob/main/agent/transcripts/01-a.jsonl',
    );
    expect(page.content).not.toContain('Claude Code');
    expect(page.content).not.toContain('Cursor');
  });
});
