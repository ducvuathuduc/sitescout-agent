/**
 * Playbook 2 — Group meetup & outing planning. MUST-SHIP.
 *
 * Documented workflow:
 *   1. Normalize + geocode each participant's origin (geocode_address).
 *   2. Generate candidate venue areas (midpoint heuristics or named districts).
 *   3. calculate_route_matrix: origins × candidate venues → travel-time table.
 *   4. Pick the min-max "fair" point: minimize the WORST participant's travel time.
 *   5. search_places: venue categories around the fair point (radius per playbook).
 *   6. calculate_route: final legs per participant → per-person times in the report.
 *   7. reverse_geocode_coordinates: human-readable label for the fair point.
 */
import type { Region } from "../site-selection/questions.js";

export interface MeetupQuestion {
  id: string;
  region: Region;
  title: string;
  question: string;
  locale: "vi";
  /** Participant origin descriptions (geocoded at runtime). */
  origins: string[];
  /** Venue categories to search around the fair point. */
  venueCategories: string[];
  /** Search radius around the fair point in metres. */
  venueRadiusM: number;
}

export const MEETUP_QUESTIONS: MeetupQuestion[] = [
  {
    id: "hcmc-meetup",
    region: "hcmc",
    title: "Fair café meetup — HCMC (Thảo Điền / Bến Thành / Phú Mỹ Hưng)",
    question:
      "3 friends in Thảo Điền, Bến Thành and Phú Mỹ Hưng — where is the fairest café to meet on Saturday afternoon?",
    locale: "vi",
    origins: [
      "Thảo Điền, Thủ Đức, Hồ Chí Minh",
      "Bến Thành, Hồ Chí Minh",
      "Phú Mỹ Hưng, Hồ Chí Minh",
    ],
    venueCategories: ["catering.cafe"],
    venueRadiusM: 1500,
  },
  {
    id: "hanoi-meetup",
    region: "hanoi",
    title: "Fair restaurant meetup — Hanoi (Tây Hồ / Hoàn Kiếm / Mỹ Đình)",
    question:
      "3 friends in Tây Hồ, Hoàn Kiếm and Mỹ Đình — where is the fairest restaurant to meet on Saturday evening?",
    locale: "vi",
    origins: ["Tây Hồ, Hà Nội", "Hoàn Kiếm, Hà Nội", "Mỹ Đình, Hà Nội"],
    venueCategories: ["catering.restaurant"],
    venueRadiusM: 2000,
  },
];

export function getMeetupQuestion(id: string): MeetupQuestion {
  const found = MEETUP_QUESTIONS.find((x) => x.id === id);
  if (!found) throw new Error(`Unknown meetup question "${id}"`);
  return found;
}

export const PLAYBOOK_ID = "meetup-planning";
export const PLAYBOOK_TITLE = "Group meetup & outing planning";
export const PLAYBOOK_STATUS = "must-ship" as const;
