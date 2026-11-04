// Heading slugs used for link-fragment validation.
//
// Fumadocs' built-in `remarkHeading` plugin (fumadocs-core/mdx-plugins/remark-heading)
// uses `github-slugger` with the same duplicate-suffix behaviour as GitHub
// (`heading`, `heading-1`, `heading-2`, ...). It is enabled by the default
// fumadocs-mdx preset, so we deliberately do NOT add another remark plugin.
// This module mirrors that algorithm for validation at sync time.
import GithubSlugger from 'github-slugger';

const INLINE_CODE = /`+([^`]*)`+/g;

/**
 * Strip the Markdown that GitHub renders away before slugging a heading.
 * Inline code is protected first so `<...>` inside a code span is not
 * mistaken for an HTML tag.
 */
export function stripInlineMarkdown(text) {
  const codes = [];
  let out = String(text).replace(INLINE_CODE, (_, code) => {
    codes.push(code);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  out = out
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])/g, '$1')
    .replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, '$1')
    .replace(/<[^>]*>/g, '');

  out = out.replace(/\u0000C(\d+)\u0000/g, (_, index) => codes[Number(index)]);
  return out.replace(/\s+/g, ' ').trim();
}

/** Slug one piece of text with GitHub's algorithm. */
export function githubSlug(text) {
  return new GithubSlugger().slug(String(text));
}

/**
 * Extract ATX headings, skipping fenced code blocks.
 * `dropFirstH1` mirrors the generated docs, which remove the source H1.
 * Returns `{ depth, text, id }` in document order.
 */
export function extractHeadings(markdown, { dropFirstH1 = false } = {}) {
  const headings = [];
  let fence = null;

  for (const line of String(markdown).split('\n')) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { char: marker[0], length: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      headings.push({
        depth: heading[1].length,
        text: stripInlineMarkdown(heading[2]),
      });
    }
  }

  if (dropFirstH1) {
    const firstH1 = headings.findIndex((heading) => heading.depth === 1);
    if (firstH1 !== -1) headings.splice(firstH1, 1);
  }

  const slugger = new GithubSlugger();
  return headings.map((heading) => ({ ...heading, id: slugger.slug(heading.text) }));
}

/** Convenience: the ids of a document in order. */
export function slugHeadings(markdown, options) {
  return extractHeadings(markdown, options).map((heading) => heading.id);
}
