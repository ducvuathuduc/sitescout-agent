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
 * Same question pattern, same scoring model, 3 regions — only region, seeds,
 * and category change (ARCHITECTURE.md §2).
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
    "Specialty coffee shop — Thảo Điền, Thủ Đức, HCMC",
    "Where should I open a specialty coffee shop in Thảo Điền?",
    "catering.cafe",
    ["office", "commercial.gym", "commercial.boutique"],
    ["Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh"],
    ["Bến Thành, Hồ Chí Minh", "Thủ Thiêm, Hồ Chí Minh", "Phú Mỹ Hưng, Hồ Chí Minh"],
  ),
  q(
    "tayho-coworking",
    "hanoi",
    "Coworking space — Tây Hồ, Hanoi",
    "Where should I open a coworking space in Tây Hồ?",
    "office.coworking",
    ["catering.cafe", "catering.restaurant", "commercial"],
    ["Xuân Diệu, Tây Hồ, Hà Nội"],
    ["Hoàn Kiếm, Hà Nội", "Mỹ Đình, Hà Nội", "Cầu Giấy, Hà Nội"],
  ),
  q(
    "mykhe-pharmacy",
    "danang",
    "Pharmacy — Mỹ Khê, Da Nang",
    "Where should I open a pharmacy near Mỹ Khê?",
    "healthcare.pharmacy",
    ["healthcare.hospital", "healthcare.clinic", "commercial"],
    ["Võ Nguyên Giáp, Mỹ Khê, Đà Nẵng"],
    ["Hải Châu, Đà Nẵng", "Sơn Trà, Đà Nẵng", "Ngũ Hành Sơn, Đà Nẵng"],
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

/** Geocode query fallback chain for one seed (ARCHITECTURE.md §5.3). */
export function seedQueries(seed: string): string[] {
  return candidateQueries(seed);
}
