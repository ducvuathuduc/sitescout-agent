/**
 * Include a single top-level symbol from a real source file, at build time.
 *
 *   <include-symbol file="src/engine/geoapify.ts" name="estimateCredits" lang="ts" />
 *
 * `file` is resolved from the repository root (the parent of docs-site/), so the
 * path stays stable no matter where the generated MDX page lives. The block is
 * extracted by brace matching, never retyped, and a missing file or symbol
 * fails the build with a message that names both.
 *
 * Why not VS Code region markers: files such as src/engine/geoapify.ts are
 * outside docs-site/ and cannot be edited by the docs build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PLUGIN = 'remark-include-symbol';

function readAttributes(node) {
  const out = {};
  for (const attr of node.attributes ?? []) {
    if (attr.type !== 'mdxJsxAttribute') continue;
    if (typeof attr.value === 'string') out[attr.name] = attr.value;
    else if (attr.value == null) out[attr.name] = '';
  }
  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Skip a quoted string (including template literals with `${...}`), return the index after it. */
function skipQuoted(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (quote === '`' && ch === '$' && source[i + 1] === '{') {
      const end = matchBrace(source, i + 1);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

/** Index of the `}` that closes the `{` at `start`, or -1. Strings and comments are ignored. */
function matchBrace(source, start) {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      const nl = source.indexOf('\n', i);
      if (nl === -1) return -1;
      i = nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipQuoted(source, i);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Index of the `)` that closes the `(` at `start`, or -1. */
function matchParen(source, start) {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipQuoted(source, i);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function extractFunction(source, name, fileLabel) {
  const declaration = new RegExp(
    `(^|\\n)export\\s+(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`,
    'g',
  );
  const match = declaration.exec(source);
  if (!match) {
    throw new Error(
      `[${PLUGIN}] Symbol "${name}" not found in ${fileLabel}. ` +
        `Expected a top-level \`export function ${name}(...) { ... }\`.`,
    );
  }

  const start = match.index + match[1].length;
  const paramsStart = source.indexOf('(', match.index + match[0].length - 1);
  const paramsEnd = matchParen(source, paramsStart);
  if (paramsEnd === -1) {
    throw new Error(`[${PLUGIN}] Unbalanced parameter list for "${name}" in ${fileLabel}.`);
  }

  const bodyStart = source.indexOf('{', paramsEnd);
  if (bodyStart === -1) {
    throw new Error(`[${PLUGIN}] No function body found for "${name}" in ${fileLabel}.`);
  }

  const bodyEnd = matchBrace(source, bodyStart);
  if (bodyEnd === -1) {
    throw new Error(`[${PLUGIN}] Unbalanced braces in "${name}" in ${fileLabel}.`);
  }

  return source.slice(start, bodyEnd + 1).replace(/\s+$/, '');
}

function transform(tree, fileLabel) {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node.children)) return;

    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index];
      if (child && child.type === 'mdxJsxFlowElement' && child.name === 'include-symbol') {
        const attributes = readAttributes(child);
        const requested = attributes.file;
        const symbol = attributes.name;
        const lang = attributes.lang || 'ts';

        if (!requested) {
          throw new Error(`[${PLUGIN}] <include-symbol> needs a "file" attribute (${fileLabel}).`);
        }
        if (!symbol) {
          throw new Error(
            `[${PLUGIN}] <include-symbol file="${requested}"> needs a "name" attribute (${fileLabel}).`,
          );
        }

        const absolute = path.resolve(REPO_ROOT, requested);
        if (!fs.existsSync(absolute)) {
          throw new Error(
            `[${PLUGIN}] File not found: "${requested}" (resolved to ${absolute}) in ${fileLabel}.`,
          );
        }

        const source = fs.readFileSync(absolute, 'utf8');
        const value = extractFunction(source, symbol, requested);

        // The code block title is the file the reader can open in the repository.
        node.children[index] = { type: 'code', lang, meta: `title="${requested}"`, value };
        continue;
      }

      visit(child);
    }
  };

  visit(tree);
}

export default function remarkIncludeSymbol() {
  return (tree, file) => {
    transform(tree, file?.path ? path.basename(String(file.path)) : 'MDX file');
  };
}
