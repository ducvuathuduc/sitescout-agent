/**
 * vietnam-address — standalone Vietnamese address normalization library.
 *
 * Zero dependencies. Usable outside SiteScout (import from anywhere).
 *
 * What it does:
 *  - `normalize()`  — canonical display form: trim, collapse whitespace, keep diacritics.
 *  - `fold()`       — ASCII-folded form for fallback geocoding (NFD strip + đ/Đ mapping).
 *  - `resolveWardAlias()` — maps legacy pre-2025-reform admin names to current ward names.
 *  - `candidateQueries()` — ordered query list for the geocode fallback chain:
 *                           canonical → folded → alias-expanded.
 *
 * The 2025 reform: Vietnam moved to two-level government (province + commune/ward) on
 * 2025-07-01; district-level units (quận/huyện) were abolished 2025-06-30 and many wards
 * were merged/renamed. Aliases below are DATA, versioned (ALIASES_VERSION), covering the
 * sample regions. Unknown mappings are NOT invented — resolveWardAlias() returns
 * `{ status: "unmapped" }` explicitly.
 */
export const ALIASES_VERSION = "2025-07";

export interface WardAlias {
  /** Legacy name as it appears in old addresses, e.g. "Quận 1". */
  legacy: string;
  /** Current ward names that absorbed it, e.g. ["Phường Sài Gòn", ...]. */
  current: string[];
  /** Normalized (folded, lowercased) legacy key for lookup. */
  key: string;
}

function foldKey(s: string): string {
  return fold(s).toLowerCase().trim();
}

/** v0 alias table — sample regions only. Extend with sourced data, never by guessing. */
const ALIASES: WardAlias[] = [
  {
    legacy: "Quận 1",
    current: ["Phường Sài Gòn", "Phường Bến Thành", "Phường Cầu Ông Lãnh"],
    key: foldKey("Quận 1"),
  },
  {
    legacy: "Quận 3",
    current: ["Phường Bàn Cờ", "Phường Xuân Hòa", "Phường Nhiêu Lộc"],
    key: foldKey("Quận 3"),
  },
  {
    legacy: "Quận Thủ Đức",
    current: ["Phường Thủ Đức", "Phường Hiệp Bình", "Phường Tam Bình"],
    key: foldKey("Quận Thủ Đức"),
  },
  {
    legacy: "Quận 2",
    current: ["Phường Thảo Điền", "Phường An Khánh", "Phường Thủ Thiêm"],
    key: foldKey("Quận 2"),
  },
  {
    legacy: "Quận 7",
    current: ["Phường Tân Hưng", "Phường Tân Mỹ", "Phường Tân Thuận"],
    key: foldKey("Quận 7"),
  },
  {
    legacy: "Quận Bình Thạnh",
    current: ["Phường Bình Thạnh", "Phường Gia Định", "Phường Bình Lợi Trung"],
    key: foldKey("Quận Bình Thạnh"),
  },
  {
    legacy: "Quận Hoàn Kiếm",
    current: ["Phường Hoàn Kiếm", "Phường Cửa Nam"],
    key: foldKey("Quận Hoàn Kiếm"),
  },
  {
    legacy: "Quận Tây Hồ",
    current: ["Phường Tây Hồ", "Phường Phú Thượng"],
    key: foldKey("Quận Tây Hồ"),
  },
  {
    legacy: "Quận Hải Châu",
    current: ["Phường Hải Châu", "Phường Hòa Cường"],
    key: foldKey("Quận Hải Châu"),
  },
];

const ALIAS_INDEX = new Map<string, WardAlias>(ALIASES.map((a) => [a.key, a]));

/** Canonical display form: trimmed, single-spaced, diacritics preserved. */
export function normalize(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * ASCII-folded form for fallback geocoding: NFD decompose, strip combining
 * marks, map đ/Đ → d/D. E.g. "Nguyễn Huệ" → "Nguyen Hue".
 */
export function fold(input: string): string {
  return normalize(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export type WardAliasResult =
  | { status: "mapped"; legacy: string; current: string[]; aliasesVersion: string }
  | { status: "unmapped"; input: string; aliasesVersion: string };

/**
 * Resolve one address segment against the ward-rename table.
 * Returns "mapped" with current ward names, or "unmapped" — never invented.
 */
export function resolveWardAlias(segment: string): WardAliasResult {
  const hit = ALIAS_INDEX.get(foldKey(segment));
  if (!hit) return { status: "unmapped", input: normalize(segment), aliasesVersion: ALIASES_VERSION };
  return {
    status: "mapped",
    legacy: hit.legacy,
    current: hit.current,
    aliasesVersion: ALIASES_VERSION,
  };
}

/**
 * Ordered geocode query list for the fallback chain (ARCHITECTURE.md §5.3):
 *   1. canonical (diacritics preserved)
 *   2. folded (ASCII)
 *   3. alias-expanded (legacy ward segment replaced by each current ward name)
 * Deduplicated, order-preserving.
 */
export function candidateQueries(input: string): string[] {
  const canonical = normalize(input);
  const out: string[] = [canonical];
  const folded = fold(input);
  if (folded !== canonical) out.push(folded);

  const segments = canonical.split(",").map((s) => s.trim());
  for (const seg of segments) {
    const r = resolveWardAlias(seg);
    if (r.status === "mapped") {
      for (const ward of r.current) {
        const variant = segments.map((s) => (s === seg ? ward : s)).join(", ");
        if (!out.includes(variant)) out.push(variant);
        const foldedVariant = fold(variant);
        if (!out.includes(foldedVariant)) out.push(foldedVariant);
      }
    }
  }
  return out;
}

/** All known legacy→current mappings (for docs/debugging). */
export function listAliases(): WardAlias[] {
  return ALIASES.map((a) => ({ ...a, current: [...a.current] }));
}
