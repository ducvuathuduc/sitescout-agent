/**
 * Public entry point for the v2 core modules added in PR #9.
 *
 * Only new modules are re-exported here. model.ts and engine/scout.ts both
 * declare WEIGHTS_VERSION, so they are imported by path and not re-exported
 * from this barrel to avoid a name collision.
 */

export {
  TraceLogger,
  canonicalJson,
  formatRef,
  parseJsonl,
  sha256Hex,
  verifyEntries,
  type Clock,
  type TraceEntry,
  type TraceRef,
  type VerifyFailure,
  type VerifyOk,
  type VerifyResult,
} from "./trace/logger.js";

export {
  ASEAN6_RENT_INDEX,
  NUMBEO_RENT_INDEX_VERSION,
  NUMBEO_SNAPSHOT_DATE,
  cityCostIndex,
  medianRentIndex,
  rentToCostIndex,
  type RentIndexEntry,
} from "./data/numbeo-rent-index.js";

export {
  COST_AWARE_PROFILE,
  COST_AWARE_VERSION,
  COST_AWARE_WEIGHTS,
  assertWeightsSumToOne,
  scoreCandidateWithCost,
} from "./scoring/cost-aware.js";
