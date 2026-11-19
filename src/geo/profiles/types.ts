/**
 * Country profile types for the multi-country registry.
 *
 * A profile carries only data the engine needs to bias geocoding, detect a
 * country from text or coordinates, and label administrative levels.
 * Bounding boxes are APPROXIMATE extents used for bias and detection; they
 * are not legal boundaries and must not be used for border decisions.
 */

export type CountryCode = "SG" | "VN" | "TH" | "MY" | "ID" | "PH";

/** [minLon, minLat, maxLon, maxLat], WGS84 degrees. */
export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface CountryProfile {
  code: CountryCode;
  /** English name, e.g. "Vietnam". */
  name: string;
  /** Name in the local language. */
  localName: string;
  /** ISO 3166-1 alpha-2 in lowercase, for geocoder country filters. */
  isoCountry: string;
  /** Approximate national bounding box (see module note). */
  bbox: BBox;
  /** Largest city, used as a neutral geocoding suffix when the user gives none. */
  primaryCity: string;
  /** Descriptive labels for administrative levels, top-down. */
  adminLevels: string[];
  /**
   * Lowercase ASCII patterns matched against the FOLDED input text
   * (see fold() in ../text.ts), so diacritics do not matter.
   */
  textPatterns: RegExp[];
}
