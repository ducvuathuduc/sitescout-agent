/**
 * Numbeo Rent Index: versioned static table for ASEAN-6 key cities, plus a
 * normaliser that turns a rent index into a marketCostIndex in (0, 1).
 *
 * Status: PROVISIONAL. The values below are midpoints of the 2026 ranges
 * supplied by the project owner, not values copied from a verified Numbeo
 * snapshot. Replace them with dated snapshot values and set
 * NUMBEO_SNAPSHOT_DATE before relying on them for a production decision.
 *
 * Mapping: costIndex = r / (r + median). It is 0.5 at the market median, lies
 * strictly inside (0, 1), and increases with rent. The scorer uses
 * 1 - costIndex as the cost sub-score (cheaper sites score higher).
 *
 * Bump NUMBEO_RENT_INDEX_VERSION whenever a value or the mapping changes.
 */

export const NUMBEO_RENT_INDEX_VERSION = "0.2.0";

/** Snapshot date of the source values (YYYY-MM-DD), or null until verified. */
export const NUMBEO_SNAPSHOT_DATE: string | null = null;

export interface RentIndexEntry {
  /** Stable id used by candidates and profiles, e.g. "vn-hcmc". */
  cityId: string;
  city: string;
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string;
  /**
   * Numbeo Rent Index (New York City = 100 on Numbeo's basis), or null when
   * no value is available.
   */
  rentIndex: number | null;
  /** Where the value came from, or why it is missing. */
  sourceNote: string;
}

const PROVISIONAL = "Provisional: midpoint of owner-supplied 2026 range; not yet checked against a dated Numbeo snapshot.";

export const ASEAN6_RENT_INDEX: readonly RentIndexEntry[] = [
  { cityId: "vn-hcmc", city: "Ho Chi Minh City", country: "VN", rentIndex: 20, sourceNote: PROVISIONAL },
  { cityId: "vn-hanoi", city: "Hanoi", country: "VN", rentIndex: 15.5, sourceNote: PROVISIONAL },
  { cityId: "th-bangkok", city: "Bangkok", country: "TH", rentIndex: 27.5, sourceNote: PROVISIONAL },
  { cityId: "sg-singapore", city: "Singapore", country: "SG", rentIndex: 75, sourceNote: PROVISIONAL },
  { cityId: "id-jakarta", city: "Jakarta", country: "ID", rentIndex: 16.5, sourceNote: PROVISIONAL },
  { cityId: "ph-manila", city: "Manila", country: "PH", rentIndex: 19, sourceNote: PROVISIONAL },
  { cityId: "my-kl", city: "Kuala Lumpur", country: "MY", rentIndex: 16.5, sourceNote: PROVISIONAL },
];

/**
 * Median of the valid rent indices in the table, or undefined when no value
 * is available.
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
