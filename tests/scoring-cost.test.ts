import { describe, expect, it } from "vitest";
import {
  COST_AWARE_PROFILE,
  COST_AWARE_WEIGHTS,
  assertWeightsSumToOne,
  scoreCandidateWithCost,
} from "../src/scoring/cost-aware.js";
import {
  DEFAULT_MARKET_PROFILE,
  DEFAULT_WEIGHTS,
  scoreCandidate,
  type EvidenceBundle,
} from "../src/scoring/model.js";

const base: EvidenceBundle = {
  candidateId: "c1",
  candidateLabel: "Site 1",
  competitorCount: 4,
  complementaryPoiCount: 20,
  catchmentRadiusM: 600,
  catchmentAreaM2: 1_130_000,
  meanAccessDurationS: 900,
};

describe("cost-aware weights", () => {
  it("sum to exactly 1", () => {
    const sum = Object.values(COST_AWARE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
  });
  it("give cost a 0.15 weight", () => {
    expect(COST_AWARE_WEIGHTS.cost).toBe(0.15);
  });
  it("reject weights that do not sum to 1", () => {
    expect(() => assertWeightsSumToOne({ ...COST_AWARE_WEIGHTS, cost: 0.5 })).toThrow(RangeError);
  });
  it("reject negative weights", () => {
    expect(() =>
      assertWeightsSumToOne({ ...COST_AWARE_WEIGHTS, cost: -0.15, competition: 0.4 }),
    ).toThrow(RangeError);
  });
});

describe("default profile is unchanged (0.1.0 reproduction)", () => {
  it("keeps cost weight 0", () => {
    expect(DEFAULT_WEIGHTS.cost).toBe(0);
    expect(DEFAULT_MARKET_PROFILE.weights.cost).toBe(0);
  });
  it("ignores marketCostIndex when cost weight is 0", () => {
    const cheap = scoreCandidate({ ...base, marketCostIndex: 0 }, DEFAULT_MARKET_PROFILE);
    const dear = scoreCandidate({ ...base, marketCostIndex: 1 }, DEFAULT_MARKET_PROFILE);
    expect(cheap.total).toBeCloseTo(dear.total, 12);
  });
});

describe("scoreCandidateWithCost", () => {
  it("uses the cost-aware profile", () => {
    const r = scoreCandidateWithCost(base, [7]);
    expect(r.weights).toEqual(COST_AWARE_PROFILE.weights);
    expect(r.evidenceRefs).toEqual([7]);
  });
  it("cost sub-score is 1 - marketCostIndex", () => {
    expect(scoreCandidateWithCost({ ...base, marketCostIndex: 0.25 }).scores.cost).toBeCloseTo(0.75, 12);
  });
  it("treats an absent marketCostIndex as neutral (cost sub-score 0.5)", () => {
    expect(scoreCandidateWithCost(base).scores.cost).toBeCloseTo(0.5, 12);
  });
  it("clamps out-of-range inputs into [0, 1]", () => {
    expect(scoreCandidateWithCost({ ...base, marketCostIndex: 1 }).scores.cost).toBe(0);
    expect(scoreCandidateWithCost({ ...base, marketCostIndex: 0 }).scores.cost).toBe(1);
  });
  it("a cheaper site scores higher than an identical, more expensive site", () => {
    const cheap = scoreCandidateWithCost({ ...base, marketCostIndex: 0.2 });
    const dear = scoreCandidateWithCost({ ...base, marketCostIndex: 0.8 });
    expect(cheap.total).toBeGreaterThan(dear.total);
    // difference equals weight * sub-score difference
    expect(cheap.total - dear.total).toBeCloseTo(0.15 * (0.8 - 0.2), 12);
  });
  it("total stays in [0, 1] at the extremes", () => {
    const lo = scoreCandidateWithCost({ ...base, competitorCount: 1000, complementaryPoiCount: 0, meanAccessDurationS: 1e6, marketCostIndex: 1 });
    const hi = scoreCandidateWithCost({ ...base, competitorCount: 0, complementaryPoiCount: 1000, meanAccessDurationS: 0, marketCostIndex: 0 });
    expect(lo.total).toBeGreaterThanOrEqual(0);
    expect(hi.total).toBeLessThanOrEqual(1);
  });
  it("more competitors never raise the score (competition monotonicity)", () => {
    const a = scoreCandidateWithCost({ ...base, competitorCount: 2 });
    const b = scoreCandidateWithCost({ ...base, competitorCount: 10 });
    expect(a.scores.competition).toBeGreaterThan(b.scores.competition);
  });
});
