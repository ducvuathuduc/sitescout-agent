import GithubSlugger from 'github-slugger';
import { stripInlineMarkdown } from './slug.mjs';

// Include joined emoji, variation selectors, modifiers, flags and keycaps.
const EMOJI = /^(?:(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)\s+)+/u;

export function stripLeadingEmoji(text) {
  return String(text).replace(EMOJI, '');
}

/** Clean display text at sync time, preserving the original GitHub IDs.
 * Explicit IDs on every heading keep duplicate suffixes stable even when a
 * cleaned heading would otherwise collide with another heading's text.
 */
export function cleanMarkdownHeadings(markdown) {
  const slugger = new GithubSlugger();
  let fence = null;
  return String(markdown).split('\n').map((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      return line;
    }
    if (fence) return line;
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!heading) return line;
    const id = slugger.slug(stripInlineMarkdown(heading[2]));
    return `${heading[1]} ${stripLeadingEmoji(heading[2])} [#${id}]`;
  }).join('\n');
}
