/**
 * Cost-aware scoring profile (v0.3.0-cost-aware).
 *
 * Decision: the default profile in model.ts keeps cost weight 0 so the 0.1.0
 * reproduction guarantee holds. Callers that have a marketCostIndex (from
 * src/data/numbeo-rent-index.ts) opt in with COST_AWARE_PROFILE. The five
 * weights sum to 1.0 and the normalisers are the same diminishing-returns
 * scales as the default profile, so the only change is the added cost term.
 *
 * Cost sub-score = 1 - marketCostIndex, with marketCostIndex = r / (r + median).
 * Absent marketCostIndex is neutral (0.5), so a missing rent value cannot
 * favour or penalise a site.
 */
import {
  DEFAULT_MARKET_PROFILE,
  scoreCandidate,
  type EvidenceBundle,
  type MarketProfile,
  type ScoredCandidate,
  type SubScores,
} from "./model.js";

export const COST_AWARE_VERSION = "0.3.0-cost-aware";

export const COST_AWARE_WEIGHTS: Record<keyof SubScores, number> = {
  competition: 0.25,
  complementarity: 0.2,
  catchment: 0.2,
  accessibility: 0.2,
  cost: 0.15,
};

export const COST_AWARE_PROFILE: MarketProfile = {
  id: "cost-aware-v1",
  weights: COST_AWARE_WEIGHTS,
  scales: DEFAULT_MARKET_PROFILE.scales,
};

/** Throws unless the weight vector sums to 1 within 1e-9. */
export function assertWeightsSumToOne(weights: Record<keyof SubScores, number>): void {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new RangeError(`weights must sum to 1, got ${sum}`);
  }
  for (const [k, w] of Object.entries(weights)) {
    if (!Number.isFinite(w) || w < 0) {
      throw new RangeError(`weight ${k} must be a non-negative finite number, got ${w}`);
    }
  }
}

assertWeightsSumToOne(COST_AWARE_WEIGHTS);

/** Score one candidate under the cost-aware profile. */
export function scoreCandidateWithCost(
  ev: EvidenceBundle,
  evidenceRefs: number[] = [],
): ScoredCandidate {
  return scoreCandidate(ev, COST_AWARE_PROFILE, evidenceRefs);
}
