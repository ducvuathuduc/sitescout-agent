// Relative-link rewriting for generated docs pages.
//
// Rules (see the task spec):
//   1. another synced source file      -> /docs/<slug> (+ #fragment)
//   2. any other repo file / folder    -> GitHub blob / tree URL
//   3. image under docs/               -> copied to public/docs-assets, /docs-assets/<name>
//   4. missing target or bad fragment  -> throw "<source>:<line>:<target>"
// Absolute, protocol-relative and site-absolute links, and code spans/blocks,
// are left untouched. Rewriting is idempotent.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractHeadings } from './slug.mjs';

export const GITHUB_REPO_URL = 'https://github.com/ducvuathuduc/sitescout-agent';
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const INDENTED_CODE = /^(?: {4,}|\t)/;

// `d` gives us the exact span of the destination, so the rest of the link
// (alt text, title, surrounding prose) is preserved byte-for-byte.
const MD_LINK =
  /(!?)\[([^\]]*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gd;
const HTML_ATTR = /\b(href|src)\s*=\s*("([^"]*)"|'([^']*)')/gd;

export function isExternalTarget(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target.trim());
}

function isSiteAbsolute(target) {
  return target.trim().startsWith('/');
}

function isFragmentOnly(target) {
  return target.trim().startsWith('#');
}

function isImagePath(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function realpath(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return fs.realpathSync(filePath);
  }
}

function isInside(parent, child) {
  const rel = path.relative(realpath(parent), realpath(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function repoRelative(repoRoot, filePath) {
  const root = fs.existsSync(repoRoot) ? realpath(repoRoot) : repoRoot;
  return path.relative(root, filePath).split(path.sep).join('/');
}

function encodeRepoPath(relPath) {
  return relPath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function splitTarget(target) {
  const hashIndex = target.indexOf('#');
  const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const pathPart = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  return { pathPart, fragment };
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveTarget(sourcePath, target) {
  const { pathPart } = splitTarget(target);
  if (!pathPart) return null;
  const decoded = decode(pathPart);
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(decoded)) return null;
  return path.resolve(path.dirname(sourcePath), decoded);
}

/**
 * Ranges of inline code spans on one line. Escaped backticks are literal and
 * cannot open a span (CommonMark).
 */
function inlineCodeRanges(line) {
  const ranges = [];
  const runs = /`+/g;
  let open = null;
  let match;

  while ((match = runs.exec(line)) !== null) {
    const start = match.index;
    if (line[start - 1] === '\\') continue;
    const length = match[0].length;
    if (!open) {
      open = { start, length };
    } else if (length === open.length) {
      ranges.push([open.start, start + length]);
      open = null;
    }
  }

  return ranges;
}

function intersects(ranges, start, end) {
  return ranges.some(([from, to]) => start < to && end > from);
}

/**
 * All inline Markdown/HTML links and images in prose, with exact destination
 * spans and 1-based line numbers. Fenced and indented code are skipped.
 */
export function extractLinks(markdown) {
  const links = [];
  const lines = String(markdown).split('\n');
  let offset = 0;
  let fence = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      offset += line.length + 1;
      continue;
    }
    if (fence) {
      offset += line.length + 1;
      continue;
    }
    if (INDENTED_CODE.test(line)) {
      offset += line.length + 1;
      continue;
    }

    const protectedRanges = inlineCodeRanges(line);

    MD_LINK.lastIndex = 0;
    let match;
    while ((match = MD_LINK.exec(line)) !== null) {
      const destRange = match.indices[3];
      // Only the destination has to be outside code. Link text may contain a
      // code span, e.g. [`examples/`](../examples/).
      if (intersects(protectedRanges, destRange[0], destRange[1])) continue;
      const destRaw = match[3];
      const angle = destRaw.startsWith('<') && destRaw.endsWith('>');
      const dest = angle ? destRaw.slice(1, -1) : destRaw;
      links.push({
        kind: match[1] === '!' ? 'image' : 'link',
        dest,
        destStart: offset + destRange[0] + (angle ? 1 : 0),
        destEnd: offset + destRange[1] - (angle ? 1 : 0),
        line: lineNumber,
      });
    }

    HTML_ATTR.lastIndex = 0;
    while ((match = HTML_ATTR.exec(line)) !== null) {
      const innerIndex = match[3] !== undefined ? 3 : 4;
      const innerRange = match.indices[innerIndex];
      if (intersects(protectedRanges, innerRange[0], innerRange[1])) continue;
      links.push({
        kind: match[1] === 'src' ? 'image' : 'link',
        dest: match[innerIndex],
        destStart: offset + innerRange[0],
        destEnd: offset + innerRange[1],
        line: lineNumber,
      });
    }

    offset += line.length + 1;
  }

  return links.sort((a, b) => a.destStart - b.destStart);
}

/**
 * Images under docs/ that are referenced from a source document, whether the
 * reference is Markdown image syntax, a normal link, or an HTML src/href.
 * Returns absolute real paths, deduplicated and sorted for determinism.
 */
export function collectImageReferences(
  markdown,
  { repoRoot, sourcePath, docsDir = path.join(repoRoot, 'docs') },
) {
  const found = new Set();

  for (const link of extractLinks(markdown)) {
    if (isExternalTarget(link.dest) || isSiteAbsolute(link.dest) || isFragmentOnly(link.dest)) continue;

    const absolute = resolveTarget(sourcePath, link.dest);
    if (!absolute || !fs.existsSync(absolute)) continue;

    const stat = fs.statSync(absolute);
    if (!stat.isFile() || !isImagePath(absolute) || !isInside(docsDir, absolute)) continue;

    found.add(realpath(absolute));
  }

  return [...found].sort();
}

function assetBasename(filePath) {
  return path.basename(filePath).replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * Stable asset names. A basename is used as-is; when two different source
 * files share a basename, every member of that group gets a short hash prefix.
 */
export function buildAssetPlan(imagePaths, { repoRoot } = {}) {
  const unique = [...new Set(imagePaths.map((filePath) => realpath(filePath)))].sort();
  const groups = new Map();

  for (const filePath of unique) {
    const base = assetBasename(filePath);
    const key = base.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ filePath, base });
  }

  const used = new Set();
  const plan = new Map();

  for (const key of [...groups.keys()].sort()) {
    const members = groups.get(key).sort((a, b) => (a.filePath < b.filePath ? -1 : 1));
    for (const member of members) {
      let name = member.base;
      if (members.length > 1) {
        const rel = repoRoot ? repoRelative(repoRoot, member.filePath) : member.filePath;
        const hash = crypto.createHash('sha1').update(rel).digest('hex').slice(0, 8);
        name = `${hash}-${member.base}`;
      }

      let candidate = name;
      let suffix = 1;
      while (used.has(candidate.toLowerCase())) {
        candidate = `${name}-${suffix}`;
        suffix += 1;
      }
      used.add(candidate.toLowerCase());
      plan.set(member.filePath, candidate);
    }
  }

  return plan;
}

/** Copy the planned assets into `publicDir` (the caller clears it first). */
export function copyAssets(plan, publicDir) {
  fs.mkdirSync(publicDir, { recursive: true });
  for (const [source, name] of [...plan.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    fs.copyFileSync(source, path.join(publicDir, name));
  }
}

function fail(context, line, target) {
  throw new Error(`${context.sourceRelPath}:${line}:${target}`);
}

function validateFragment(targetPath, fragment, context, dropFirstH1, line, original) {
  if (!fragment) return;
  const wanted = decode(fragment);
  const headings = extractHeadings(fs.readFileSync(targetPath, 'utf8'), { dropFirstH1 });
  if (!headings.some((heading) => heading.id === wanted)) {
    fail(context, line, original);
  }
}

function rewriteDestination(dest, context, line) {
  const target = dest.trim();
  if (!target) return dest;

  if (isFragmentOnly(target)) {
    validateFragment(context.sourcePath, target.slice(1), context, true, line, target);
    return dest;
  }
  if (isExternalTarget(target) || isSiteAbsolute(target)) return dest;

  const absolute = resolveTarget(context.sourcePath, target);
  if (!absolute || !fs.existsSync(absolute)) fail(context, line, target);

  const real = realpath(absolute);
  const stat = fs.statSync(real);
  const { fragment } = splitTarget(target);
  const source = context.sourceMap.get(real);

  if (source !== undefined) {
    const resolvedFragment = source.fragmentAliases?.[decode(fragment)] ?? fragment;
    if (resolvedFragment) validateFragment(real, resolvedFragment, context, true, line, target);
    const base = source.slug ? `/docs/${source.slug}` : '/docs';
    return resolvedFragment ? `${base}#${resolvedFragment}` : base;
  }

  if (stat.isFile() && isImagePath(real) && isInside(context.docsDir, real)) {
    const name = context.assets.get(real);
    if (!name) fail(context, line, target);
    return fragment ? `/docs-assets/${name}#${fragment}` : `/docs-assets/${name}`;
  }

  const rel = repoRelative(context.repoRoot, real);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) fail(context, line, target);

  const kind = stat.isDirectory() ? 'tree' : 'blob';
  if (fragment && stat.isFile() && /\.mdx?$/i.test(real)) {
    validateFragment(real, fragment, context, false, line, target);
  }
  const base = `${GITHUB_REPO_URL}/${kind}/main/${encodeRepoPath(rel)}`;
  return fragment ? `${base}#${fragment}` : base;
}

/**
 * Rewrite every relative prose link in `markdown`.
 *
 * options:
 *   repoRoot      absolute repository root
 *   sourcePath    absolute path of the source document
 *   sourceRelPath repo-relative path used in error messages (e.g. docs/mcp.md)
 *   sources       [{ from: 'docs/mcp.md', slug: 'mcp', fragmentAliases?: { old: current } }, ...]
 *   assets        Map<absolute real path, asset file name>
 */
export function rewriteMarkdownLinks(markdown, options) {
  const {
    repoRoot,
    sourcePath,
    sourceRelPath,
    sources = [],
    assets = new Map(),
    docsDir = path.join(repoRoot, 'docs'),
  } = options;

  const sourceMap = new Map();
  for (const source of sources) {
    sourceMap.set(realpath(path.join(repoRoot, source.from)), source);
  }

  const context = { repoRoot, sourcePath, sourceRelPath, sourceMap, assets, docsDir };
  const links = extractLinks(markdown);
  const replacements = [];

  for (const link of links) {
    const next = rewriteDestination(link.dest, context, link.line);
    if (next !== link.dest) {
      replacements.push({ start: link.destStart, end: link.destEnd, value: next });
    }
  }

  let out = markdown;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, replacement.start) + replacement.value + out.slice(replacement.end);
  }
  return out;
}
