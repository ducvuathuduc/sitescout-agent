#!/usr/bin/env node
/**
 * Static verification of the exported documentation site in `out/`.
 *
 * Run from docs-site:  node scripts/check.mjs   (or `npm run check`)
 *
 * Exits non-zero and lists every offender when a check fails; prints a single
 * summary line when everything is fine. No network access is required.
 *
 * Checks
 *  a) every internal <a href> resolves to a file inside out/
 *  b) every #fragment in an internal link exists as an id/name in the target page
 *  c) no resource (script/link/img/font/CSS url) is loaded from another origin,
 *     and no generated CSS/JS references a known third-party CDN/analytics host
 *  d) no page text, <title> or meta content mentions "vercel"
 *  e) the reviewer pages /docs/mcp and /docs/demo-proxy were generated
 *  f) /docs/mcp is stable between builds (see note below)
 *  g) no stray build tree or temporary test file inside the docs project
 *
 * Determinism (f) approach — the check must never run `next build` (that would
 * race with the build itself) and must never re-run the content sync (it
 * rewrites content/docs and would race with the generator). Instead it records
 * the SHA-256 of the generated source (content/docs/mcp.md) together with the
 * SHA-256 of the built page (out/docs/mcp/index.html) in
 * `.cache/docs-mcp-build.json`:
 *
 *   - same source, different HTML  -> the build is not deterministic  -> FAIL
 *   - changed source, changed HTML -> expected content change        -> rebaseline, note it
 *   - changed source, same HTML    -> the output is stale            -> FAIL (rebuild)
 *
 * So `npm run build && npm run check` twice in a row must produce identical
 * HTML, and any change to the generated page is still detected and reported.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'out');
const CACHE_DIR = path.join(ROOT, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'docs-mcp-build.json');
// The generator owns content/docs/mcp.*; accept either MDX flavour.
const CONTENT_MCP_CANDIDATES = ['mcp.md', 'mcp.mdx'].map((name) =>
  path.join(ROOT, 'content', 'docs', name),
);

const REVIEWER_PAGES = ['mcp', 'demo-proxy'];

/** Third-party hosts that must never be referenced from generated CSS/JS. */
const BANNED_HOST_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.',
  'unpkg.com',
  'jsdelivr',
  'google-analytics',
  'googletagmanager',
  'plausible',
  'posthog',
  'vercel.live',
  'vercel-scripts',
];

const RESOURCE_RELS = new Set([
  'stylesheet',
  'preload',
  'modulepreload',
  'prefetch',
  'preconnect',
  'dns-prefetch',
  'icon',
  'shortcut',
  'apple-touch-icon',
  'mask-icon',
  'manifest',
]);

const MAX_REPORTED = 25;

const problems = [];
const notes = [];

function report(check, message, file) {
  problems.push({ check, message, file });
}

function note(message) {
  notes.push(message);
}

/* ------------------------------------------------------------------ utils */

function listFiles(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Collapse `a//b/./c/../d` into `a/b/d`. Always returns a posix-ish path. */
function normalizePath(value) {
  const parts = [];
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

function dirnamePosix(relFile) {
  const index = relFile.lastIndexOf('/');
  return index === -1 ? '' : relFile.slice(0, index);
}

/* --------------------------------------------------------------- parsing */

function parseAttributes(raw) {
  const attrs = {};
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of raw.matchAll(re)) {
    const name = match[1].toLowerCase();
    if (Object.hasOwn(attrs, name)) continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

/** Returns the attribute maps of every opening `<tag ...>` in `html`. */
function tagAttributes(html, tagName) {
  const re = new RegExp(`<${tagName}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'gi');
  const result = [];
  for (const match of html.matchAll(re)) result.push(parseAttributes(match[1]));
  return result;
}

/**
 * Removes comments and the bodies of script/style/template elements so that
 * the React Server Component payload (page text embedded in inline scripts)
 * is not mistaken for markup.
 */
function stripNonMarkup(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, ' ');
}

function extractCssUrls(css) {
  const urls = [];
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (url) urls.push(url);
  }
  for (const match of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    const url = (match[1] ?? match[2] ?? '').trim();
    if (url) urls.push(url);
  }
  return urls;
}

function extractSrcset(value) {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function collectIds(html) {
  const ids = new Set();
  const markup = stripNonMarkup(html);
  for (const match of markup.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    ids.add(decodeEntities(match[1] ?? match[2] ?? ''));
  }
  for (const attrs of tagAttributes(markup, 'a')) {
    if (attrs.name) ids.add(decodeEntities(attrs.name));
  }
  return ids;
}

function isExternalUrl(url) {
  return /^(?:https?:)?\/\//i.test(url) || /^[a-z][a-z0-9+.-]*:/i.test(url);
}

function isExternalResource(url) {
  // Anything that is not same-origin. `data:`/`blob:` inline payloads are
  // same-origin by definition and are ignored.
  return /^(?:https?:)?\/\//i.test(url);
}

/* ------------------------------------------------------------- resolution */

function pageRelOf(file) {
  return toPosix(path.relative(OUT_DIR, file));
}

function resolveInternalLink(pageRel, rawPath) {
  const decoded = decodeUrlPart(rawPath);
  const isAbsolute = decoded.startsWith('/');
  const base = isAbsolute ? '' : dirnamePosix(pageRel);
  const combined = normalizePath(`${base}/${decoded}`);

  let candidates;
  if (decoded === '' || decoded === '/') {
    candidates = ['index.html'];
  } else if (decoded.endsWith('/')) {
    candidates = [`${combined}/index.html`, combined, `${combined}.html`];
  } else {
    candidates = [combined, `${combined}.html`, `${combined}/index.html`];
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const full = path.resolve(OUT_DIR, candidate);
    if (!full.startsWith(OUT_DIR + path.sep)) continue;
    try {
      if (fs.statSync(full).isFile()) return toPosix(path.relative(OUT_DIR, full));
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/* ------------------------------------------------------------ html checks */

function checkHtml(file, state) {
  const rel = pageRelOf(file);
  const raw = fs.readFileSync(file, 'utf8');
  const markup = stripNonMarkup(raw);
  const ids = collectIds(raw);
  state.pages.set(rel, { ids });

  /* --- a + b: internal links and fragments ------------------------------ */
  for (const attrs of tagAttributes(markup, 'a')) {
    const href = (attrs.href ?? '').trim();
    if (href === '' || isExternalUrl(href)) continue;

    const hashIndex = href.indexOf('#');
    const fragment = hashIndex === -1 ? '' : href.slice(hashIndex + 1);
    const beforeHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
    const queryIndex = beforeHash.indexOf('?');
    const rawPath = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);

    const fragmentIsDirective = fragment.startsWith(':~:');
    const hasFragment = fragment !== '' && !fragmentIsDirective;

    if (rawPath === '') {
      // Same-page link: only the fragment needs to resolve.
      if (hasFragment) {
        state.fragmentChecks += 1;
        const id = decodeUrlPart(decodeEntities(fragment));
        if (!ids.has(id)) {
          report('internal fragments', `${href} -> no element with id "${id}" on this page`, rel);
        }
      }
      continue;
    }

    state.linkChecks += 1;
    const target = resolveInternalLink(rel, rawPath);
    if (target === null) {
      report('internal links', `${href} -> no such file in out/`, rel);
      continue;
    }
    if (!hasFragment) continue;
    if (!target.endsWith('.html')) continue; // fragments only meaningful in HTML

    state.fragmentChecks += 1;
    const id = decodeUrlPart(decodeEntities(fragment));
    const targetIds = state.pages.get(target)?.ids ?? collectIds(fs.readFileSync(path.join(OUT_DIR, target), 'utf8'));
    if (!targetIds.has(id)) {
      report('internal fragments', `${href} -> "${id}" is not an id in ${target}`, rel);
    }
  }

  /* --- c: resource origins --------------------------------------------- */
  const resources = [];

  for (const attrs of tagAttributes(raw, 'script')) {
    if (attrs.src) resources.push({ kind: 'script src', url: attrs.src });
  }
  for (const attrs of tagAttributes(raw, 'link')) {
    const rels = (attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rels.some((token) => RESOURCE_RELS.has(token))) continue;
    if (attrs.href) resources.push({ kind: `link rel=${rels.join(' ')}`, url: attrs.href });
  }
  for (const tag of ['img', 'source']) {
    for (const attrs of tagAttributes(raw, tag)) {
      if (attrs.src) resources.push({ kind: `${tag} src`, url: attrs.src });
      if (attrs.srcset) {
        for (const url of extractSrcset(attrs.srcset)) resources.push({ kind: `${tag} srcset`, url });
      }
    }
  }
  for (const match of markup.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const url of extractCssUrls(match[1] ?? match[2] ?? '')) {
      resources.push({ kind: 'inline style url()', url });
    }
  }
  for (const match of raw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    for (const url of extractCssUrls(match[1])) resources.push({ kind: 'inline <style> url()', url });
  }

  for (const resource of resources) {
    if (isExternalResource(resource.url)) {
      report('external resources', `${resource.kind} -> ${resource.url}`, rel);
    }
  }
  state.resourceChecks += resources.length;

  /* --- d: no "vercel" in anything a reader sees ------------------------- */
  const title = decodeEntities(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '');
  const metaContent = tagAttributes(raw, 'meta')
    .map((attrs) => decodeEntities(attrs.content ?? ''))
    .join(' ');
  const bodyHtml = raw.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ');
  const visible = decodeEntities(stripNonMarkup(bodyHtml).replace(/<[^>]+>/g, ' '));

  for (const [label, text] of [
    ['visible text', visible],
    ['<title>', title],
    ['meta content', metaContent],
  ]) {
    if (/vercel/i.test(text)) {
      const context = text.replace(/\s+/g, ' ').trim().slice(0, 160);
      report('branding', `"vercel" found in ${label}: ${context}`, rel);
    }
  }
}

/* ------------------------------------------------------- css/js host scan */

function checkGeneratedAssets(files) {
  let scanned = 0;
  for (const file of files) {
    const isCss = file.endsWith('.css');
    const isJs = file.endsWith('.js');
    if (!isCss && !isJs) continue;
    scanned += 1;
    const rel = pageRelOf(file);
    const text = fs.readFileSync(file, 'utf8').toLowerCase();

    if (isCss) {
      // Stylesheets may only reference same-origin assets (fonts, images, ...).
      for (const url of extractCssUrls(text)) {
        if (isExternalResource(url)) {
          report('external resources', `CSS url() -> ${url}`, rel);
        }
      }
    }

    for (const pattern of BANNED_HOST_PATTERNS) {
      if (!text.includes(pattern)) continue;
      const index = text.indexOf(pattern);
      const context = text.slice(Math.max(0, index - 40), index + pattern.length + 40).replace(/\s+/g, ' ');
      report('third-party assets', `${pattern} referenced in generated ${isCss ? 'CSS' : 'JS'}: ...${context}...`, rel);
    }
  }
  return scanned;
}

/* ---------------------------------------------------------- determinism */

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(value) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function checkDeterminism(state) {
  const pageFile = [path.join(OUT_DIR, 'docs', 'mcp', 'index.html'), path.join(OUT_DIR, 'docs', 'mcp.html')]
    .find((candidate) => fs.existsSync(candidate));
  if (!pageFile) return; // reported by the reviewer-page check

  const htmlHash = sha256(fs.readFileSync(pageFile));
  const sourceFile = CONTENT_MCP_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  const sourceHash = sourceFile ? sha256(fs.readFileSync(sourceFile)) : null;
  // Layout, styles, MDX components and build configuration also affect HTML.
  // Only compare outputs when all build inputs match, not just the Markdown.
  const inputFiles = ['app', 'components', 'lib', 'content', 'public'].flatMap((dir) =>
    listFiles(path.join(ROOT, dir)),
  ).concat(['next.config.mjs', 'source.config.ts', 'nav.config.json', 'package.json', 'package-lock.json', 'postcss.config.mjs']
    .map((file) => path.join(ROOT, file))).sort();
  const inputHash = sha256(Buffer.concat(inputFiles.flatMap((file) => [
    Buffer.from(toPosix(path.relative(ROOT, file)) + '\0'), fs.readFileSync(file),
  ])));
  const sourceLabel = sourceFile ? toPosix(path.relative(ROOT, sourceFile)) : 'the generated source';
  const previous = readCache();
  let consistent = true;

  if (!previous) {
    note('determinism: baseline recorded for /docs/mcp');
  } else if (previous.inputHash !== inputHash) {
    note('determinism: build inputs changed; baseline updated');
  } else if (previous.htmlHash === htmlHash) {
    if (sourceHash && previous.sourceHash && previous.sourceHash !== sourceHash) {
      consistent = false;
      report(
        'determinism',
        `${sourceLabel} changed but out/docs/mcp did not — the build is stale, rebuild before checking`,
      );
    }
  } else if (!previous.sourceHash || !sourceHash) {
    note('determinism: /docs/mcp changed and no generated source is available to attribute it; baseline updated');
  } else if (previous.sourceHash !== sourceHash) {
    note('determinism: /docs/mcp changed together with its generated source; baseline updated');
  } else {
    consistent = false;
    report(
      'determinism',
      `out/docs/mcp/index.html differs from the previous check although ${sourceLabel} is unchanged — the build is not deterministic`,
    );
  }

  // Only advance the baseline on a consistent result, otherwise a bad build
  // would be silently adopted by the next run.
  if (consistent) writeCache({ htmlHash, sourceHash, inputHash, page: toPosix(path.relative(OUT_DIR, pageFile)) });
  state.htmlHash = htmlHash;
}

/* ---------------------------------------------------------- stray files */

function checkStrayFiles() {
  const nested = path.join(ROOT, 'docs-site');
  if (fs.existsSync(nested)) {
    report(
      'stray files',
      'docs-site/docs-site/ exists — a build ran with the wrong working directory; delete it and rebuild from docs-site/',
    );
  }

  const e2eDir = path.join(ROOT, 'tests', 'e2e');
  if (!fs.existsSync(e2eDir)) return;
  for (const entry of fs.readdirSync(e2eDir)) {
    if (/\.tmp\./.test(entry)) report('stray files', `tests/e2e/${entry} is a temporary file`);
  }
}

/* ------------------------------------------------------------------ main */

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`[check] FAIL — ${toPosix(path.relative(ROOT, OUT_DIR))}/ does not exist; run \`npm run build\` first.`);
    process.exit(1);
  }

  const allFiles = listFiles(OUT_DIR);
  const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));

  if (htmlFiles.length === 0) {
    console.error('[check] FAIL — no HTML files were found in out/; run `npm run build` first.');
    process.exit(1);
  }

  // Stable ordering keeps the report reproducible.
  htmlFiles.sort();
  const state = { pages: new Map(), linkChecks: 0, fragmentChecks: 0, resourceChecks: 0 };

  for (const file of htmlFiles) checkHtml(file, state);
  const assetCount = checkGeneratedAssets(allFiles.sort());

  // e) reviewer pages
  for (const slug of REVIEWER_PAGES) {
    const candidates = [path.join(OUT_DIR, 'docs', slug, 'index.html'), path.join(OUT_DIR, 'docs', `${slug}.html`)];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      report('reviewer pages', `missing out/docs/${slug}/index.html (or out/docs/${slug}.html)`);
    }
  }

  // f) determinism
  checkDeterminism(state);

  // g) stray files
  checkStrayFiles();

  if (problems.length > 0) {
    const groups = new Map();
    for (const problem of problems) {
      if (!groups.has(problem.check)) groups.set(problem.check, []);
      groups.get(problem.check).push(problem);
    }

    console.error(`[check] FAIL — ${problems.length} problem(s) found:\n`);
    for (const [check, items] of groups) {
      console.error(`  ${check} (${items.length})`);
      for (const item of items.slice(0, MAX_REPORTED)) {
        console.error(`    ${item.file ? `${item.file}: ` : ''}${item.message}`);
      }
      if (items.length > MAX_REPORTED) {
        console.error(`    ... and ${items.length - MAX_REPORTED} more`);
      }
      console.error('');
    }
    process.exit(1);
  }

  const parts = [
    `[check] OK — ${state.pages.size} pages`,
    `${state.linkChecks} internal links`,
    `${state.fragmentChecks} fragments`,
    `${state.resourceChecks} resources`,
    `${assetCount} css/js files`,
  ];
  if (state.htmlHash) parts.push(`mcp sha256 ${state.htmlHash.slice(0, 12)}`);
  console.log(parts.join(', '));
  for (const message of notes) console.log(`[check] ${message}`);
}

main();
