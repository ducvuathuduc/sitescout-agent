/**
 * Country / region profile: everything that makes the planner and the geocoder
 * specific to one city or country. The engine itself stays generic; a new market
 * is a new profile object, not an edit to plan.ts or scout.ts.
 *
 * VN_HCMC_PROFILE reproduces the constants that used to live in plan.ts and
 * scout.ts, so the default path is unchanged.
 */
import { haversineM } from "../geo/grid.js";

export interface BusinessRule {
  match: RegExp;
  business: string;
  competitor: string;
  demand: string[];
}

export interface AreaAlias {
  match: RegExp;
  area: string;
}

export interface CountryProfile {
  /** Stable identifier, e.g. "vn-hcmc". */
  id: string;
  /** Human label, e.g. "Ho Chi Minh City, Vietnam". */
  label: string;
  /** [lon, lat] used to bias geocoder results toward the market. */
  biasPoint: [number, number];
  /** True when a geocoder hit (lat, lon) lies inside the market's study territory. */
  boundaryCheck: (lat: number, lon: number) => boolean;
  /** Suffix appended to a free-text area phrase before geocoding, e.g. "Hồ Chí Minh". */
  areaSuffix: string;
  /** Known areas → verified geocode text. The first entry is the fallback area. */
  areaAliases: AreaAlias[];
  /** Label used in planner notes when no area is recognised. */
  defaultAreaLabel: string;
  /** Demand origins for the drive-time matrix. */
  defaultOrigins: string[];
  /** Keyword → business / competitor / demand categories. */
  businessRules: BusinessRule[];
  /** System prompt for the LLM planner. */
  plannerPrompt: string;
  /** Parts of an area string that are dropped before geocoding (pre-reform admin names). */
  legacyPartPatterns: RegExp[];
  /** Generic parts ignored when scoring a geocode hit (country / city names). */
  ignoredPartPattern: RegExp;
  /** Prefix words stripped from a part before token matching ("quan", "phuong"…). */
  partPrefixPattern: RegExp;
  /** Extracts the area phrase from a free-text question. */
  areaPhrasePattern: RegExp;
}

const VN_HCMC_BIAS: [number, number] = [106.7009, 10.7769];

/** Keyword → categories. Every category here exists in the live catalog (tested). */
const VN_BUSINESS_RULES: BusinessRule[] = [
  { match: /ti[eệ]m b[aá]nh|b[aá]nh m[iì]|banh mi|l[oò] b[aá]nh|bakery|boulangerie|patisserie/i, business: "bakery", competitor: "commercial.food_and_drink.bakery", demand: ["office", "education.school", "commercial.supermarket"] },
  { match: /c[aà]\s?ph[eê]|coffee|caf[eé]|specialty/i, business: "coffee shop", competitor: "catering.cafe", demand: ["office", "sport.fitness", "commercial.clothing", "education.university"] },
  { match: /tr[aà] s[uữ]a|bubble tea|milk tea/i, business: "bubble tea shop", competitor: "catering.cafe", demand: ["education.school", "education.university", "commercial.shopping_mall"] },
  { match: /nh[aà] thu[oố]c|pharmac|drugstore/i, business: "pharmacy", competitor: "healthcare.pharmacy", demand: ["healthcare.hospital", "healthcare.clinic_or_praxis", "commercial.supermarket"] },
  { match: /ph[oở]|b[uú]n|c[oơ]m|qu[aá]n [aă]n|restaurant|lunch|nh[aà] h[aà]ng|food/i, business: "restaurant", competitor: "catering.restaurant", demand: ["office", "education.university", "commercial.shopping_mall"] },
  { match: /gym|fitness|yoga|ph[oò]ng t[aậ]p/i, business: "gym", competitor: "sport.fitness", demand: ["office", "building.residential", "education.university"] },
  { match: /coworking|v[aă]n ph[oò]ng chia s[eẻ]/i, business: "coworking space", competitor: "office.coworking", demand: ["catering.cafe", "office.company", "education.university"] },
  { match: /c[uử]a h[aà]ng ti[eệ]n l[oợ]i|convenience|minimart/i, business: "convenience store", competitor: "commercial.convenience", demand: ["building.residential", "education.school", "office"] },
  { match: /spa|nail|salon|l[aà]m [dđ][eẹ]p|beauty/i, business: "beauty salon", competitor: "service.beauty", demand: ["office", "commercial.shopping_mall", "building.residential"] },
  { match: /nha khoa|dental|dentist/i, business: "dental clinic", competitor: "healthcare.dentist", demand: ["building.residential", "office", "education.school"] },
  { match: /qu[aầ]n [aá]o|th[oờ]i trang|fashion|clothing|boutique/i, business: "clothing boutique", competitor: "commercial.clothing", demand: ["catering.cafe", "commercial.shopping_mall", "office"] },
];

/** Known HCMC areas → canonical geocode text (old + new names welcome). */
const VN_AREA_ALIASES: AreaAlias[] = [
  // Texts chosen because Geoapify resolves them correctly (autocomplete-first, see scout.ts resolvePlace).
  { match: /th[aả]o [dđ]i[eề]n/i, area: "Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh" },
  { match: /b[iì]nh th[aạ]nh|h[aà]ng xanh/i, area: "Ngã tư Hàng Xanh, Bình Thạnh, Hồ Chí Minh" },
  { match: /qu[aậ]n 1\b|district 1|ph[uư][oờ]ng s[aà]i g[oò]n|nguy[eễ]n hu[eệ]|cbd|downtown/i, area: "Phố đi bộ Nguyễn Huệ, Quận 1, Hồ Chí Minh" },
  { match: /ph[uú] m[yỹ] h[uư]ng|qu[aậ]n 7|district 7/i, area: "Crescent Mall, Quận 7, Hồ Chí Minh" },
  { match: /g[oò] v[aấ]p/i, area: "Chợ Gò Vấp, Gò Vấp, Hồ Chí Minh" },
  { match: /qu[aậ]n 3|district 3|v[oõ] v[aă]n t[aầ]n/i, area: "Hồ Con Rùa, Quận 3, Hồ Chí Minh" },
  { match: /landmark|v[iì]nhomes central/i, area: "Landmark 81, Bình Thạnh, Hồ Chí Minh" },
  { match: /b[eế]n th[aà]nh/i, area: "Chợ Bến Thành, Quận 1, Hồ Chí Minh" },
];

const VN_DEFAULT_ORIGINS = ["Chợ Bến Thành, Quận 1, Hồ Chí Minh", "Bến xe Miền Đông, Bình Thạnh, Hồ Chí Minh", "Crescent Mall, Quận 7, Hồ Chí Minh"];

const VN_PLANNER_PROMPT = `You plan retail site-selection analyses in Ho Chi Minh City, Vietnam, for the SiteScout agent.
Return ONLY a JSON object with these keys:
- business: short English name of the business type
- competitorCategory: ONE Geoapify place category for direct competitors
- demandCategories: 1-4 Geoapify place categories that bring customers (not the competitor category)
- area: the neighbourhood to analyse, as a geocodable Vietnamese address ending with "Hồ Chí Minh" (old district names are fine)
- walkMinutes: integer 5-15 (walking catchment)
- candidates: integer 5-8
- origins: 1-3 well-known HCMC places customers travel from
Use only real Geoapify categories, e.g. catering.cafe, catering.restaurant, catering.fast_food, healthcare.pharmacy, healthcare.hospital, healthcare.clinic_or_praxis, healthcare.dentist, office, office.company, office.coworking, sport.fitness, education.school, education.university, commercial.supermarket, commercial.convenience, commercial.clothing, commercial.shopping_mall, service.beauty, building.residential.
If the question is outside Ho Chi Minh City, still answer with the closest HCMC interpretation. Never invent numbers.`;

/** Ho Chi Minh City, Vietnam. Values are the constants previously hardcoded in plan.ts and scout.ts. */
export const VN_HCMC_PROFILE: CountryProfile = {
  id: "vn-hcmc",
  label: "Ho Chi Minh City, Vietnam",
  biasPoint: VN_HCMC_BIAS,
  boundaryCheck: (lat, lon) => haversineM({ lat, lon }, { lat: VN_HCMC_BIAS[1], lon: VN_HCMC_BIAS[0] }) < 40_000,
  areaSuffix: "Hồ Chí Minh",
  areaAliases: VN_AREA_ALIASES,
  defaultAreaLabel: "Thảo Điền",
  defaultOrigins: VN_DEFAULT_ORIGINS,
  businessRules: VN_BUSINESS_RULES,
  plannerPrompt: VN_PLANNER_PROMPT,
  legacyPartPatterns: [/^(phuong|p\.?)\s*\d+$/, /^quan\s/, /^(tp\.?|thanh pho)\s*thu duc$/],
  ignoredPartPattern: /^(ho chi minh|tp\.? ?hcm|thanh pho ho chi minh|viet ?nam)$/,
  partPrefixPattern: /^(quan|phuong|duong) /,
  areaPhrasePattern: /(?:\bở|\btại|\bgần|\bkhu|\bin|\bnear|\baround)\s+([^?.!]+)/i,
};
