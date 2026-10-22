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
export const WEIGHTS_VERSION = "0.1.0-heuristic";

/** v0 weights — heuristic, pending calibration against smoke-test evidence. */
export const DEFAULT_WEIGHTS: Record<keyof SubScores, number> = {
  competition: 0.3,
  complementarity: 0.25,
  catchment: 0.25,
  accessibility: 0.2,
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

export function scoreCandidate(
  ev: EvidenceBundle,
  weights: Record<keyof SubScores, number> = DEFAULT_WEIGHTS,
  evidenceRefs: number[] = [],
): ScoredCandidate {
  const areaKm2 = ev.catchmentAreaM2 / 1_000_000;

  const competition = 1 - diminishing(ev.competitorCount, 8);
  const complementarity = diminishing(ev.complementaryPoiCount, 25);
  const catchment = diminishing((ev.complementaryPoiCount + ev.competitorCount) / Math.max(areaKm2, 1e-6), 60);
  const accessibility =
    ev.meanAccessDurationS === undefined
      ? 0.5 // neutral when no route-matrix evidence exists yet
      : 1 - diminishing(ev.meanAccessDurationS, 900); // 15 min ≈ 0.5

  const scores: SubScores = { competition, complementarity, catchment, accessibility };
  const total =
    scores.competition * weights.competition +
    scores.complementarity * weights.complementarity +
    scores.catchment * weights.catchment +
    scores.accessibility * weights.accessibility;

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
