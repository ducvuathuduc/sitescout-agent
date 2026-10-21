/**
 * Playbook 3 — Delivery & service coverage analysis. STRETCH.
 *
 * DOCS-ONLY (red-team cut — REDTEAM.md GO-WITH-CUTS): question definitions +
 * workflow doc ship; NO runtime implementation, NO sample runs in v1.
 *
 * Documented workflow (for a future runtime):
 *   1. Geocode depot / service points (geocode_address).
 *   2. transform_geometry: buffer each depot by its service radius → service zones.
 *   3. combine_geometries (union) → total coverage polygon; measure_geometry → area.
 *   4. search_places: order hotspots (dense residential / office POIs).
 *   5. calculate_route_matrix: depots × hotspots → travel-time SLA check.
 *   6. evaluate_spatial_relation: hotspots within coverage? → gap list.
 *
 * Note: true drive-time polygons need the REST-only Isoline API; the MCP path
 * uses buffer approximations (docs/FEEDBACK.md#1). The tooling layer MAY use
 * REST Isoline for comparison — the delta itself is a publishable finding.
 */
export const PLAYBOOK_ID = "coverage-analysis";
export const PLAYBOOK_TITLE = "Delivery & service coverage analysis";
export const PLAYBOOK_STATUS = "stretch" as const;

export interface CoverageQuestion {
  id: string;
  region: "hcmc" | "hanoi" | "danang";
  title: string;
  question: string;
  locale: "vi";
  depots: string[];
  serviceRadiusM: number;
  slaMinutes: number;
}

export const COVERAGE_QUESTIONS: CoverageQuestion[] = [
  {
    id: "danang-coverage",
    region: "danang",
    title: "Cloud-kitchen coverage — Hải Châu, Da Nang",
    question:
      "A cloud kitchen in Hải Châu: which wards are within a 25-minute drive, and where are the gaps?",
    locale: "vi",
    depots: ["Hải Châu, Đà Nẵng"],
    serviceRadiusM: 5000,
    slaMinutes: 25,
  },
];
