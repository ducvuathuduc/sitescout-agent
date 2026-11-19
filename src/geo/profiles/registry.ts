/**
 * Country profile registry for ASEAN markets: SG, VN, TH, MY, ID, PH.
 *
 * Data notes:
 *  - bbox values are rounded approximate national extents. They are for bias
 *    and detection only. Malaysia and Indonesia boxes include Borneo, and the
 *    Indonesia box contains Singapore and parts of Malaysia; point detection
 *    therefore prefers the smallest containing box.
 *  - primaryCity values are the largest city of each country by population.
 *  - adminLevels are descriptive labels, not verified unit lists.
 */
import { fold } from "../text.js";
import type { BBox, CountryCode, CountryProfile } from "./types.js";

export const COUNTRY_PROFILES: readonly CountryProfile[] = [
  {
    code: "SG",
    name: "Singapore",
    localName: "Singapore",
    isoCountry: "sg",
    bbox: { minLon: 103.6, minLat: 1.16, maxLon: 104.1, maxLat: 1.48 },
    primaryCity: "Singapore",
    adminLevels: ["country", "planning area"],
    textPatterns: [/\bsingapore\b/, /\bsg\b/],
  },
  {
    code: "VN",
    name: "Vietnam",
    localName: "Việt Nam",
    isoCountry: "vn",
    bbox: { minLon: 102.14, minLat: 8.15, maxLon: 109.47, maxLat: 23.39 },
    primaryCity: "Ho Chi Minh City",
    adminLevels: ["province / city", "commune / ward"],
    textPatterns: [/\bvietnam\b/, /\bviet nam\b/, /\bho chi minh\b/, /\bsai gon\b/, /\bhanoi\b/, /\bha noi\b/, /\bda nang\b/],
  },
  {
    code: "TH",
    name: "Thailand",
    localName: "ประเทศไทย",
    isoCountry: "th",
    bbox: { minLon: 97.34, minLat: 5.61, maxLon: 105.64, maxLat: 20.46 },
    primaryCity: "Bangkok",
    adminLevels: ["province", "district", "sub-district"],
    textPatterns: [/\bthailand\b/, /\bthai lan\b/, /\bbangkok\b/, /\bchiang mai\b/],
  },
  {
    code: "MY",
    name: "Malaysia",
    localName: "Malaysia",
    isoCountry: "my",
    bbox: { minLon: 99.64, minLat: 0.85, maxLon: 119.27, maxLat: 7.36 },
    primaryCity: "Kuala Lumpur",
    adminLevels: ["state / federal territory", "district", "locality"],
    textPatterns: [/\bmalaysia\b/, /\bkuala lumpur\b/, /\bpenang\b/, /\bjohor\b/],
  },
  {
    code: "ID",
    name: "Indonesia",
    localName: "Indonesia",
    isoCountry: "id",
    bbox: { minLon: 95.01, minLat: -11.01, maxLon: 141.02, maxLat: 6.08 },
    primaryCity: "Jakarta",
    adminLevels: ["province", "regency / city", "district", "village"],
    textPatterns: [/\bindonesia\b/, /\bjakarta\b/, /\bbandung\b/, /\bsurabaya\b/, /\bbali\b/],
  },
  {
    code: "PH",
    name: "Philippines",
    localName: "Pilipinas",
    isoCountry: "ph",
    bbox: { minLon: 116.93, minLat: 4.59, maxLon: 126.6, maxLat: 21.12 },
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
