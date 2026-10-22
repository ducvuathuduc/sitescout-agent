/**
 * Playbook 1 — SME site selection (retail/F&B). FLAGSHIP · MUST-SHIP.
 *
 * Documented workflow:
 *   1. Normalize seed addresses (src/geo/vietnam-address.ts) → candidateQueries().
 *   2. Geocode each query (geocode_address, fallback chain §5.3) → candidate points.
 *   3. search_places: business category within catchment → competitor count.
 *   4. search_places: complementary categories within catchment → demand signals.
 *   5. transform_geometry buffer (default 800 m) → measure_geometry (area) +
 *      evaluate_spatial_relation (POI containment) → catchment stats.
 *   6. calculate_route_matrix: demand origins × candidates → accessibility.
 *   7. Score (src/scoring/model.ts) → rank → Markdown + visual report.
 *
 * Three HCMC questions (Geoapify Batch #2 scope). Same pattern and scoring
 * model; only the area seed, categories and demand origins change.
 */
import { candidateQueries } from "../../geo/vietnam-address.js";

export type Region = "hcmc" | "hanoi" | "danang";

export interface SiteSelectionQuestion {
  id: string;
  region: Region;
  title: string;
  question: string;
  locale: "vi";
  businessCategory: string;
  complementaryCategories: string[];
  candidateSeeds: string[];
  /** Demand origins for the accessibility route matrix (geocoded like seeds). */
  demandOrigins: string[];
  /** Catchment buffer radius in metres (default 800). */
  catchmentRadiusM: number;
  /** Expand each seed into centre + hexagonal ring (default true → 7 candidates). */
  generateCandidates?: boolean;
  /** Spacing of generated candidates in metres (default 550). */
  candidateSpacingM?: number;
}

const q = (
  id: string,
  region: Region,
  title: string,
  question: string,
  businessCategory: string,
  complementaryCategories: string[],
  candidateSeeds: string[],
  demandOrigins: string[],
): SiteSelectionQuestion => ({
  id,
  region,
  title,
  question,
  locale: "vi",
  businessCategory,
  complementaryCategories,
  candidateSeeds,
  demandOrigins,
  catchmentRadiusM: 800,
});

export const SITE_SELECTION_QUESTIONS: SiteSelectionQuestion[] = [
  q(
    "thaodien-coffee",
    "hcmc",
    "Specialty coffee shop — Thảo Điền (Phường An Khánh), HCMC",
    "Where should I open a specialty coffee shop in Thảo Điền?",
    "catering.cafe",
    // validated against list_place_categories (2026-10-22)
    ["office", "sport.fitness", "commercial.clothing"],
    ["Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh"],
    ["Bến Thành, Hồ Chí Minh", "Thủ Thiêm, Hồ Chí Minh", "Phú Mỹ Hưng, Hồ Chí Minh"],
  ),
  q(
    "binhthanh-pharmacy",
    "hcmc",
    "Pharmacy — Bình Thạnh (around Hàng Xanh), HCMC",
    "Where should I open a pharmacy in Bình Thạnh?",
    "healthcare.pharmacy",
    ["healthcare.hospital", "healthcare.clinic_or_praxis", "commercial.supermarket"],
    ["Ngã tư Hàng Xanh, Bình Thạnh, Hồ Chí Minh"],
    ["Bến Thành, Hồ Chí Minh", "Gò Vấp, Hồ Chí Minh", "Thảo Điền, Hồ Chí Minh"],
  ),
  q(
    "saigon-lunch",
    "hcmc",
    "Office-lunch restaurant — Phường Sài Gòn (old District 1 CBD), HCMC",
    "Where should I open an office-lunch restaurant in the District 1 CBD?",
    "catering.restaurant",
    ["office", "office.company", "office.coworking"],
    ["Nhà hát Thành phố, Quận 1, Hồ Chí Minh"],
    ["Thảo Điền, Hồ Chí Minh", "Bình Thạnh, Hồ Chí Minh", "Quận 7, Hồ Chí Minh"],
  ),
];

export function getSiteSelectionQuestion(id: string, region?: Region): SiteSelectionQuestion {
  const found = SITE_SELECTION_QUESTIONS.filter(
    (x) => x.id === id && (!region || x.region === region),
  );
  if (found.length === 0) {
    throw new Error(
      `Unknown site-selection question "${id}"${region ? ` in region "${region}"` : ""}. ` +
        `Known: ${SITE_SELECTION_QUESTIONS.map((x) => x.id).join(", ")}`,
    );
  }
  return found[0];
}

/** Geocode query fallback chain for one seed.  */
export function seedQueries(seed: string): string[] {
  return candidateQueries(seed);
}
