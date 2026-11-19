/**
 * Shared text helpers for geocoding: one implementation of normalize / fold / slug.
 * Zero dependencies.
 */

/** Canonical display form: trimmed, single-spaced, diacritics preserved. */
export function normalize(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * ASCII-folded form: NFD decompose, strip combining marks, map đ/Đ → d/D.
 * "Nguyễn Huệ" → "Nguyen Hue".
 */
export function fold(input: string): string {
  return normalize(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Lookup key: folded, lowercased, trimmed. */
export function foldKey(input: string): string {
  return fold(input).toLowerCase().trim();
}

/** URL/identifier-safe slug: "Thảo Điền, Quận 2" → "thao-dien-quan-2". */
export function slugify(input: string): string {
  return foldKey(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
