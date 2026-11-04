// Frontmatter extraction for the repository Markdown that feeds the docs site.
// The source files have no frontmatter: the first H1 becomes `title` and the
// first plain paragraph becomes `description`.
import { stripInlineMarkdown } from './slug.mjs';

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})\s+/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const TABLE = /^\s*\|/;
const BLOCKQUOTE = /^\s*>/;
const IMAGE = /^\s*!\[/;
const HTML_BLOCK = /^\s*</;
const HR = /^\s*(?:[-*_])(?:\s*[-*_]){2,}\s*$/;
const INDENTED_CODE = /^(?: {4,}|\t)/;

function protectInlineCode(text) {
  const codes = [];
  const out = String(text).replace(/`+([^`]*)`+/g, (_, code) => {
    codes.push(code);
    return `\u0000C${codes.length - 1}\u0000`;
  });
  return {
    text: out,
    restore(value) {
      return value.replace(/\u0000C(\d+)\u0000/g, (_, index) => codes[Number(index)]);
    },
  };
}

/** Markdown inline syntax -> readable plain text (for descriptions). */
export function plainText(markdown) {
  const protectedText = protectInlineCode(markdown);
  let out = protectedText.text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])/g, '$1')
    .replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, '$1')
    .replace(/<[^>]*>/g, '');

  out = protectedText.restore(out);
  return out.replace(/\s+/g, ' ').trim();
}

/** Cut at a word boundary, at most `max` characters including the ellipsis. */
export function truncateDescription(text, max = 160) {
  const value = String(text).trim();
  if (value.length <= max) return value;

  const room = Math.max(1, max - 1);
  const slice = value.slice(0, room);
  const space = slice.lastIndexOf(' ');
  const base = space > 0 ? slice.slice(0, space) : slice;
  return `${base.replace(/[\s,;:.!?\-–—]+$/, '')}…`;
}

/**
 * Split the first H1 from the body. Throws when the source has no H1 so a
 * missing heading never silently produces an untitled page.
 */
export function extractTitleAndBody(markdown, { sourcePath = '<source>' } = {}) {
  const text = String(markdown).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  let fence = null;
  let titleLine = -1;
  let title = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    const heading = /^#\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      titleLine = index;
      title = stripInlineMarkdown(heading[1]);
      break;
    }
  }

  if (titleLine === -1) {
    throw new Error(`${sourcePath}: missing H1 heading`);
  }

  const body = lines.slice(0, titleLine).concat(lines.slice(titleLine + 1)).join('\n');
  return { title, body: body.replace(/^\n+/, '') };
}

/**
 * First plain paragraph: not a heading, list, table, code fence, blockquote,
 * image, HTML block or horizontal rule.
 *
 * Returns the paragraph's description *and* the body with that paragraph
 * removed. The page renders `description` directly under the title, so leaving
 * the paragraph in place would print the same lead twice.
 */
export function splitDescription(markdown) {
  const text = String(markdown);
  const lines = text.split('\n');
  let fence = null;
  let start = -1;
  let end = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      if (start !== -1) break;
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    const blank = line.trim() === '';
    if (blank) {
      if (start !== -1) break;
      continue;
    }

    const special =
      HEADING.test(line) ||
      LIST_ITEM.test(line) ||
      TABLE.test(line) ||
      BLOCKQUOTE.test(line) ||
      IMAGE.test(line) ||
      HTML_BLOCK.test(line) ||
      HR.test(line) ||
      INDENTED_CODE.test(line);

    if (special) {
      if (start !== -1) break;
      continue;
    }

    if (start === -1) start = index;
    end = index;
  }

  if (start === -1) return { description: '', body: text };

  const paragraph = lines.slice(start, end + 1).map((line) => line.trim());
  const description = truncateDescription(plainText(paragraph.join(' ')));
  const body = lines
    .slice(0, start)
    .concat(lines.slice(end + 1))
    .join('\n')
    .replace(/^\n+/, '');

  return { description, body };
}

/** Just the description, for callers that keep the body untouched. */
export function extractDescription(markdown) {
  return splitDescription(markdown).description;
}

/** A YAML-safe double-quoted scalar (JSON strings are valid YAML). */
export function yamlString(value) {
  return JSON.stringify(String(value));
}

export function buildFrontmatter({ title, description }) {
  const lines = ['---', `title: ${yamlString(title)}`];
  if (description) lines.push(`description: ${yamlString(description)}`);
  lines.push('---', '', '');
  return lines.join('\n');
}

/** Full generated page: frontmatter followed by the body without its lead paragraph. */
export function withFrontmatter(markdown, { sourcePath } = {}) {
  const { title, body } = extractTitleAndBody(markdown, { sourcePath });
  const { description, body: trimmedBody } = splitDescription(body);
  return {
    title,
    description,
    body: trimmedBody,
    content: `${buildFrontmatter({ title, description })}${trimmedBody}`,
  };
}
