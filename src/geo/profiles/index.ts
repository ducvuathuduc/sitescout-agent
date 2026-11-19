/** Public surface of the country profile registry. */
export type { BBox, CountryCode, CountryProfile } from "./types.js";
export {
  COUNTRY_PROFILES,
  biasLonLat,
  detectCountryFromPoint,
  detectCountryFromText,
  findProfileByName,
  getProfile,
} from "./registry.js";
