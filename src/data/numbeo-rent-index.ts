/**
 * Numbeo Rent Index: versioned static table for ASEAN-6 key cities, plus a
 * normaliser that turns a rent index into a marketCostIndex in (0, 1).
 *
 * Status: VALUES NOT YET VERIFIED. Every rentIndex is null until it is
 * copied from a dated Numbeo snapshot and the source is recorded in
 * sourceNote. While a value is null, cityCostIndex returns undefined, and
 * scoreCandidate treats the missing cost as neutral (0.5).
 *
 * Mapping: costIndex = r / (r + median). It is 0.5 at the market median, lies
 * strictly inside (0, 1), and increases with rent. It matches the diminishing-
 * returns form used in src/scoring/model.ts, so the cost sub-score is
 * 1 - costIndex (cheaper sites score higher).
 *
 * Bump NUMBEO_RENT_INDEX_VERSION whenever a value or the mapping changes.
 */

export const NUMBEO_RENT_INDEX_VERSION = "0.1.0";

/** Snapshot date of the source values (YYYY-MM-DD), or null until verified. */
export const NUMBEO_SNAPSHOT_DATE: string | null = null;

export interface RentIndexEntry {
  /** Stable id used by candidates and profiles, e.g. "vn-hcmc". */
  cityId: string;
  city: string;
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string;
  /**
   * Numbeo Rent Index (New York City = 100 on Numbeo's basis), or null until
   * copied from a verified snapshot.
   */
  rentIndex: number | null;
  /** Where the value came from, or why it is missing. */
  sourceNote: string;
}

const PENDING = "Not yet copied from a verified Numbeo snapshot.";

export const ASEAN6_RENT_INDEX: readonly RentIndexEntry[] = [
  { cityId: "vn-hcmc", city: "Ho Chi Minh City", country: "VN", rentIndex: null, sourceNote: PENDING },
  { cityId: "vn-hanoi", city: "Hanoi", country: "VN", rentIndex: null, sourceNote: PENDING },
  { cityId: "th-bangkok", city: "Bangkok", country: "TH", rentIndex: null, sourceNote: PENDING },
  { cityId: "sg-singapore", city: "Singapore", country: "SG", rentIndex: null, sourceNote: PENDING },
  { cityId: "id-jakarta", city: "Jakarta", country: "ID", rentIndex: null, sourceNote: PENDING },
  { cityId: "ph-manila", city: "Manila", country: "PH", rentIndex: null, sourceNote: PENDING },
  { cityId: "my-kl", city: "Kuala Lumpur", country: "MY", rentIndex: null, sourceNote: PENDING },
];

/**
 * Median of the valid rent indices in the table, or undefined when no value
 * is available yet.
 */
export function medianRentIndex(entries: readonly RentIndexEntry[] = ASEAN6_RENT_INDEX): number | undefined {
  const values = entries
    .map((e) => e.rentIndex)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return undefined;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[mid];
  const lo = values[mid - 1];
  const hi = values[mid];
  if (lo === undefined || hi === undefined) return undefined;
  return (lo + hi) / 2;
}

/**
 * Map a rent index to a cost index in (0, 1), with 0.5 at the median.
 * Throws RangeError on non-positive or non-finite inputs.
 */
export function rentToCostIndex(rentIndex: number, median: number): number {
  if (!Number.isFinite(rentIndex) || rentIndex <= 0) {
    throw new RangeError(`rentToCostIndex: rentIndex must be a positive finite number, got ${rentIndex}`);
  }
  if (!Number.isFinite(median) || median <= 0) {
    throw new RangeError(`rentToCostIndex: median must be a positive finite number, got ${median}`);
  }
  return rentIndex / (rentIndex + median);
}

/**
 * marketCostIndex for one city, ready to assign to EvidenceBundle.marketCostIndex.
 * Returns undefined when the city is unknown, its rent index is missing, or no
 * median can be formed. Callers must leave the field absent in those cases.
 */
export function cityCostIndex(
  cityId: string,
  entries: readonly RentIndexEntry[] = ASEAN6_RENT_INDEX,
): number | undefined {
  const entry = entries.find((e) => e.cityId === cityId);
  if (!entry || entry.rentIndex === null) return undefined;
  const median = medianRentIndex(entries);
  if (median === undefined) return undefined;
  return rentToCostIndex(entry.rentIndex, median);
}
