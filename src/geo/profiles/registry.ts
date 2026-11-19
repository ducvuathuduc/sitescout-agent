/**
 * Country profile registry for ASEAN markets: SG, VN, TH, MY, ID, PH.
 *
 * Data source:
 *  - bbox values are the extents of GeoBoundaries gbOpen ADM0 geometry
 *    (wmgeolab/geoBoundaries release 9469f09, ADM0 simplified), rounded to
 *    0.001 degrees. They are for bias and detection only, not legal borders.
 *  - primaryCity values are the largest city of each country by population.
 *  - adminLevels are descriptive labels, not verified unit lists.
 *  - lang is the default geocoder language for each country.
 *
 * Known limitation (bbox detection, not yet polygon-based):
 *  - The MY and ID boxes overlap. The MY box covers all of Borneo, and the ID
 *    box covers Kalimantan, Sumatra, and the Riau Islands.
 *  - The ID box contains Singapore and parts of Malaysia.
 *  - detectCountryFromPoint picks the smallest containing box. This is correct
 *    for Singapore, but not for some border points. Known misclassifications
 *    include Tarakan, Batam, and Bintan (resolve to MY, should be ID) and
 *    Johor Bahru (resolves to SG, should be MY).
 *  - Fixing this needs polygon point-in-country tests, not tighter boxes.
 */
import { fold } from "../text.js";
import type { BBox, CountryCode, CountryProfile } from "./types.js";

export const COUNTRY_PROFILES: readonly CountryProfile[] = [
  {
    code: "SG",
    name: "Singapore",
    localName: "Singapore",
    isoCountry: "sg",
    lang: "en",
    bbox: { minLon: 103.605, minLat: 1.189, maxLon: 104.089, maxLat: 1.471 },
    primaryCity: "Singapore",
    adminLevels: ["country", "planning area"],
    // Bare "sg" removed (matches unrelated abbreviations). Postal-code context
    // ("sg 018956" or "singapore 018956") is still matched by the second pattern.
    textPatterns: [/\bsingapore\b/, /\bsg \d{6}\b/],
  },
  {
    code: "VN",
    name: "Vietnam",
    localName: "Việt Nam",
    isoCountry: "vn",
    lang: "vi",
    bbox: { minLon: 102.144, minLat: 8.403, maxLon: 109.463, maxLat: 23.394 },
    primaryCity: "Ho Chi Minh City",
    adminLevels: ["province / city", "commune / ward"],
    textPatterns: [/\bvietnam\b/, /\bviet nam\b/, /\bho chi minh\b/, /\bsai gon\b/, /\bhanoi\b/, /\bha noi\b/, /\bda nang\b/],
  },
  {
    code: "TH",
    name: "Thailand",
    localName: "ประเทศไทย",
    isoCountry: "th",
    lang: "th",
    bbox: { minLon: 97.344, minLat: 5.613, maxLon: 105.637, maxLat: 20.465 },
    primaryCity: "Bangkok",
    adminLevels: ["province", "district", "sub-district"],
    textPatterns: [/\bthailand\b/, /\bthai lan\b/, /\bbangkok\b/, /\bchiang mai\b/],
  },
  {
    code: "MY",
    name: "Malaysia",
    localName: "Malaysia",
    isoCountry: "my",
    lang: "en",
    bbox: { minLon: 99.641, minLat: 0.854, maxLon: 119.269, maxLat: 7.363 },
    primaryCity: "Kuala Lumpur",
    adminLevels: ["state / federal territory", "district", "locality"],
    textPatterns: [/\bmalaysia\b/, /\bkuala lumpur\b/, /\bpenang\b/, /\bjohor\b/],
  },
  {
    code: "ID",
    name: "Indonesia",
    localName: "Indonesia",
    isoCountry: "id",
    lang: "id",
    bbox: { minLon: 95.011, minLat: -11.008, maxLon: 141.019, maxLat: 5.907 },
    primaryCity: "Jakarta",
    adminLevels: ["province", "regency / city", "district", "village"],
    textPatterns: [/\bindonesia\b/, /\bjakarta\b/, /\bbandung\b/, /\bsurabaya\b/, /\bbali\b/],
  },
  {
    code: "PH",
    name: "Philippines",
    localName: "Pilipinas",
    isoCountry: "ph",
    lang: "en",
    bbox: { minLon: 114.278, minLat: 4.587, maxLon: 126.605, maxLat: 21.122 },
    primaryCity: "Manila",
    adminLevels: ["region", "province", "city / municipality", "barangay"],
    textPatterns: [/\bphilippines\b/, /\bpilipinas\b/, /\bmanila\b/, /\bmakati\b/, /\bcebu\b/],
  },
];

/** Profile by code. Throws on unknown code (no silent default). */
export function getProfile(code: CountryCode): CountryProfile {
  const p = COUNTRY_PROFILES.find((x) => x.code === code);
  if (!p) throw new Error(`Unknown country code: ${String(code)}`);
  return p;
}

/** Profile for an exact or folded name match ("Việt Nam", "vietnam"), or undefined. */
export function findProfileByName(name: string): CountryProfile | undefined {
  const key = fold(name).toLowerCase().replace(/\s+/g, " ").trim();
  return COUNTRY_PROFILES.find(
    (p) =>
      fold(p.name).toLowerCase() === key ||
      fold(p.localName).toLowerCase() === key ||
      p.code.toLowerCase() === key,
  );
}

/**
 * Detect the country from free text using textPatterns on the folded input.
 * Returns the first profile in registry order that matches, or undefined.
 */
export function detectCountryFromText(text: string): CountryProfile | undefined {
  const folded = fold(text).toLowerCase();
  return COUNTRY_PROFILES.find((p) => p.textPatterns.some((re) => re.test(folded)));
}

function bboxArea(b: BBox): number {
  return (b.maxLon - b.minLon) * (b.maxLat - b.minLat);
}

function containsPoint(b: BBox, lat: number, lon: number): boolean {
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
}

/**
 * Detect the country containing a point. Where boxes overlap, the smallest
 * containing box wins, so Singapore is not classed as Indonesia.
 * Known limitation: some border points in the MY/ID/SG overlap regions are
 * misclassified. See the module note above.
 */
export function detectCountryFromPoint(lat: number, lon: number): CountryProfile | undefined {
  let best: CountryProfile | undefined;
  for (const p of COUNTRY_PROFILES) {
    if (!containsPoint(p.bbox, lat, lon)) continue;
    if (!best || bboxArea(p.bbox) < bboxArea(best.bbox)) best = p;
  }
  return best;
}

/** Bias point (bbox centre) as [lon, lat], for geocoder bias parameters. */
export function biasLonLat(profile: CountryProfile): [number, number] {
  const { minLon, minLat, maxLon, maxLat } = profile.bbox;
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}
