/**
 * Playbook 4 — Neighborhood profiling for renters/buyers. STRETCH.
 *
 * DOCS-ONLY (red-team cut — REDTEAM.md GO-WITH-CUTS): question definitions +
 * workflow doc ship; NO runtime implementation, NO sample runs in v1.
 *
 * Documented workflow (for a future runtime):
 *   1. Geocode the address / area (geocode_address).
 *   2. search_places across amenity baskets within 1–2 km:
 *      schools (education.*), healthcare (healthcare.*), transport
 *      (public_transport.*), food (catering.*), leisure (leisure.*).
 *   3. calculate_route_matrix: area × key hubs (CBD, airport, office districts)
 *      → commute accessibility.
 *   4. Composite livability score (same deterministic pattern as playbook 1:
 *      pure function over evidence, documented weights).
 *   5. Profile card visual report.
 */
export const PLAYBOOK_ID = "neighborhood-profile";
export const PLAYBOOK_TITLE = "Neighborhood profiling for renters/buyers";
export const PLAYBOOK_STATUS = "stretch" as const;

export interface ProfileQuestion {
  id: string;
  region: "hcmc" | "hanoi" | "danang";
  title: string;
  question: string;
  locale: "vi";
  area: string;
  hubs: string[];
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    id: "tayho-profile",
    region: "hanoi",
    title: "Neighborhood profile — Tây Hồ, Hanoi (young family)",
    question:
      "Profile Tây Hồ for a young family: schools, healthcare, and commute to Hoàn Kiếm.",
    locale: "vi",
    area: "Tây Hồ, Hà Nội",
    hubs: ["Hoàn Kiếm, Hà Nội", "Sân bay Nội Bài"],
  },
];
