/**
 * src/research/questions.ts — CLI-compatible re-export of playbook question sets.
 *
 * The CLI resolves `--question <id> [--playbook <name>] [--region <r>]` through
 * these registries. Playbooks own their questions; this module is the index.
 */
export {
  SITE_SELECTION_QUESTIONS,
  getSiteSelectionQuestion,
  seedQueries,
  type Region,
  type SiteSelectionQuestion,
} from "../playbooks/site-selection/questions.js";
export {
  MEETUP_QUESTIONS,
  getMeetupQuestion,
  type MeetupQuestion,
} from "../playbooks/meetup-planning/questions.js";
export {
  COVERAGE_QUESTIONS,
  type CoverageQuestion,
} from "../playbooks/coverage-analysis/playbook.js";
export {
  PROFILE_QUESTIONS,
  type ProfileQuestion,
} from "../playbooks/neighborhood-profile/playbook.js";
export {
  DAYPLAN_QUESTIONS,
  type DayplanQuestion,
} from "../playbooks/tourism-dayplan/playbook.js";
