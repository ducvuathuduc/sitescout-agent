/**
 * Site-scoring model — pure, deterministic functions over traced evidence.
 *
 * Design rules:
 *  1. The model NEVER calls the network. It scores EvidenceBundles that the
 *     agent runtime collected through the 11 MCP tools (see agent/run.ts).
 *  2. Catchments are circular-buffer approximations: transform_geometry
 *     buffer + evaluate_spatial_relation + measure_geometry. This is NOT a
 *     drive-time isochrone — true isochrones need the REST-only Isoline API,
 *     which the MCP server does not expose. Filed as docs/FEEDBACK.md#1 and
 *     surfaced in every report's limitations section. We approximate openly;
 *     we do not silently substitute REST.
 *  3. Weights are v0 heuristics, documented below, to be calibrated against
 *     smoke-test evidence once a Geoapify API key is available.
 *  4. Market-specific tuning lives in a MarketProfile (weights + per-market
 *     normalizer scales). The default profile reproduces the 0.1.0 behaviour
 *     exactly, so callers that pass no profile get identical scores.
 *
 * All sub-scores are normalised to [0, 1], higher = better site.
 */
import { z } from "zod";

export const EvidenceBundleSchema = z.object({
  candidateId: z.string().min(1),
  candidateLabel: z.string().min(1),
  /** Competitors of the same business category within the catchment. */
  competitorCount: z.number().int().nonnegative(),
  /** Complementary POIs (demand signals) within the catchment. */
  complementaryPoiCount: z.number().int().nonnegative(),
  /** Catchment circle radius in metres (buffer approximation). */
  catchmentRadiusM: z.number().positive(),
  /** Buffer area in m², from measure_geometry. */
  catchmentAreaM2: z.number().positive(),
  /** Mean travel duration (seconds) from demand origins, from calculate_route_matrix. */
  meanAccessDurationS: z.number().nonnegative().optional(),
  /**
   * Relative cost of operating at this site, in [0, 1] (0 = cheapest, 1 = most
   * expensive). Absent means neutral (0.5). Only contributes to the score when a
   * MarketProfile gives the `cost` sub-score a non-zero weight.
   */
  marketCostIndex: z.number().min(0).max(1).optional(),
});

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export interface SubScores {
  /** 1 − normalised competitor density. Fewer nearby competitors = better. */
  competition: number;
  /** Normalised complementary-POI density. More demand signals = better. */
  complementarity: number;
  /** Catchment "richness": POIs per km² within the buffer. */
  catchment: number;
  /** 1 − normalised mean access duration. Closer to demand = better. */
  accessibility: number;
  /** 1 − marketCostIndex. Cheaper sites = better. Weight 0 in the default profile. */
  cost: number;
}

export interface ScoredCandidate {
  candidateId: string;
  candidateLabel: string;
  scores: SubScores;
  /** Weighted total in [0, 1]. */
  total: number;
  weights: Record<keyof SubScores, number>;
  /** Trace seq numbers backing the evidence (for report citations). */
  evidenceRefs: number[];
}

/**
 * Weight-vector version. Bumped on every calibration change — never silently.
 * Format: "<major>.<minor>.<patch>-<basis>".
 */
export const WEIGHTS_VERSION = "0.2.0-market-aware";

/** v0 weights — heuristic, pending calibration against smoke-test evidence. */
export const DEFAULT_WEIGHTS: Record<keyof SubScores, number> = {
  competition: 0.3,
  complementarity: 0.25,
  catchment: 0.25,
  accessibility: 0.2,
  cost: 0,
};

/**
 * Per-market configuration: the sub-score weights and the reference scales that
 * set where each normaliser reaches 0.5. Pure data; no network.
 */
export interface MarketProfile {
  /** Stable identifier, e.g. "default" or "vn-hcmc". */
  id: string;
  weights: Record<keyof SubScores, number>;
  scales: {
    /** Competitor count that yields competition 0.5. */
    competitorK: number;
    /** Complementary POI count that yields complementarity 0.5. */
    complementaryK: number;
    /** POIs-per-km² that yields catchment 0.5. */
    catchmentDensityK: number;
    /** Mean access duration (s) that yields accessibility 0.5. */
    accessHalfS: number;
  };
}

/** Reproduces the 0.1.0 model exactly (cost weight 0). */
export const DEFAULT_MARKET_PROFILE: MarketProfile = {
  id: "default",
  weights: DEFAULT_WEIGHTS,
  scales: {
    competitorK: 8,
    complementaryK: 25,
    catchmentDensityK: 60,
    accessHalfS: 900,
  },
};

/**
 * Data-density floor: a candidate whose catchment yields
 * fewer than this many POIs across ALL place sweeps is flagged
 * `insufficient-data` and EXCLUDED from ranking — "no data" must never read
 * as "no competition".
 */
export const INSUFFICIENT_DATA_POI_FLOOR = 5;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Normalise a raw count against a reference scale with diminishing returns:
 * f(x) = x / (x + k). k = count that yields 0.5.
 */
function diminishing(count: number, k: number): number {
  return clamp01(count / (count + k));
}

function isProfile(x: MarketProfile | Record<keyof SubScores, number>): x is MarketProfile {
  return "weights" in x && "scales" in x;
}

/**
 * Score one candidate. The second argument is either a MarketProfile or, for
 * backward compatibility with 0.1.0 callers, a bare weight vector (in which
 * case the default scales are used).
 */
export function scoreCandidate(
  ev: EvidenceBundle,
  profileOrWeights: MarketProfile | Record<keyof SubScores, number> = DEFAULT_MARKET_PROFILE,
  evidenceRefs: number[] = [],
): ScoredCandidate {
  const profile: MarketProfile = isProfile(profileOrWeights)
    ? profileOrWeights
    : { ...DEFAULT_MARKET_PROFILE, weights: profileOrWeights };
  const { weights, scales } = profile;
  const areaKm2 = ev.catchmentAreaM2 / 1_000_000;

  const competition = 1 - diminishing(ev.competitorCount, scales.competitorK);
  const complementarity = diminishing(ev.complementaryPoiCount, scales.complementaryK);
  const catchment = diminishing((ev.complementaryPoiCount + ev.competitorCount) / Math.max(areaKm2, 1e-6), scales.catchmentDensityK);
  const accessibility =
    ev.meanAccessDurationS === undefined
      ? 0.5 // neutral when no route-matrix evidence exists yet
      : 1 - diminishing(ev.meanAccessDurationS, scales.accessHalfS);
  const cost = 1 - clamp01(ev.marketCostIndex ?? 0.5); // absent = neutral

  const scores: SubScores = { competition, complementarity, catchment, accessibility, cost };
  const total =
    scores.competition * weights.competition +
    scores.complementarity * weights.complementarity +
    scores.catchment * weights.catchment +
    scores.accessibility * weights.accessibility +
    scores.cost * weights.cost;

  return {
    candidateId: ev.candidateId,
    candidateLabel: ev.candidateLabel,
    scores,
    total: clamp01(total),
    weights,
    evidenceRefs,
  };
}

/** Rank best-first. Ties broken deterministically by candidateId. */
export function rankCandidates(scored: ScoredCandidate[]): ScoredCandidate[] {
  return [...scored].sort((a, b) => b.total - a.total || a.candidateId.localeCompare(b.candidateId));
}

/* ------------------------------------------------------------------ */
/* Playbook 2 — meetup venue scoring (min-max fairness)                 */
/* ------------------------------------------------------------------ */

/**
 * Meetup venue evidence: travel durations (seconds) per participant to the
 * venue, from calculate_route_matrix (origins × venues).
 */
export interface MeetupVenueEvidence {
  venueId: string;
  venueLabel: string;
  lat?: number;
  lon?: number;
  /** Per-participant durations in seconds, in origin order. */
  durationsS: number[];
  traceRefs: number[];
}

export interface ScoredVenue {
  venueId: string;
  venueLabel: string;
  lat?: number;
  lon?: number;
  /** Worst participant's travel time — the fairness objective (minimize). */
  maxDurationS: number;
  meanDurationS: number;
  /** Score in [0,1]; higher = fairer + closer. */
  score: number;
  traceRefs: number[];
}

/**
 * Venue score: 1 − diminishing(max duration) blended with mean duration.
 * The min-max fairness criterion dominates (weight 0.7): the venue is only
 * as good as its worst-served participant.
 * Pure, deterministic, no network. Versioned with WEIGHTS_VERSION.
 */
export function scoreMeetupVenue(ev: MeetupVenueEvidence): ScoredVenue {
  const maxD = Math.max(...ev.durationsS);
  const meanD = ev.durationsS.reduce((a, b) => a + b, 0) / ev.durationsS.length;
  const fairness = 1 - clamp01(maxD / (maxD + 1800)); // 30 min worst-case ≈ 0.5
  const closeness = 1 - clamp01(meanD / (meanD + 1200)); // 20 min mean ≈ 0.5
  const score = clamp01(0.7 * fairness + 0.3 * closeness);
  return {
    venueId: ev.venueId,
    venueLabel: ev.venueLabel,
    lat: ev.lat,
    lon: ev.lon,
    maxDurationS: maxD,
    meanDurationS: meanD,
    score,
    traceRefs: ev.traceRefs,
  };
}

/** Rank venues: fairest first (highest score); ties by venueId. */
export function rankVenues(venues: ScoredVenue[]): ScoredVenue[] {
  return [...venues].sort(
    (a, b) => b.score - a.score || a.venueId.localeCompare(b.venueId),
  );
}
