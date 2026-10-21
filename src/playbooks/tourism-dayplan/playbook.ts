/**
 * Playbook 5 — Tourism day-plan grounding. STRETCH.
 *
 * DOCS-ONLY (red-team cut — REDTEAM.md GO-WITH-CUTS): question definitions +
 * workflow doc ship; NO runtime implementation, NO sample runs in v1.
 *
 * Documented workflow (for a future runtime):
 *   1. search_places: tourism categories (tourism.attraction, tourism.sights.*,
 *      catering.restaurant) around the base area.
 *   2. Shortlist stops with the traveler (or heuristic: top-rated mix of
 *      sights + food).
 *   3. calculate_route with optimize_stops=true → sensible stop order.
 *   4. Split into timed legs (durations from the route) → realistic itinerary
 *      with opening-hours notes where the places index provides them.
 *   5. Visual report: ordered stop markers + route line + time blocks.
 */
export const PLAYBOOK_ID = "tourism-dayplan";
export const PLAYBOOK_TITLE = "Tourism day-plan grounding";
export const PLAYBOOK_STATUS = "stretch" as const;

export interface DayplanQuestion {
  id: string;
  region: "hcmc" | "hanoi" | "danang";
  title: string;
  question: string;
  locale: "vi";
  baseArea: string;
  mustInclude: string[];
}

export const DAYPLAN_QUESTIONS: DayplanQuestion[] = [
  {
    id: "danang-dayplan",
    region: "danang",
    title: "One realistic day — Da Nang",
    question:
      "One realistic day in Da Nang: Mỹ Khê beach → Dragon Bridge → Marble Mountains, lunch included.",
    locale: "vi",
    baseArea: "Đà Nẵng",
    mustInclude: ["Bãi biển Mỹ Khê", "Cầu Rồng", "Ngũ Hành Sơn"],
  },
];
