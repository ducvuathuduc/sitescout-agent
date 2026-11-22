import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKET_PROFILE,
  DEFAULT_WEIGHTS,
  TH_BANGKOK_PROFILE,
  VN_HCMC_PROFILE,
  rankCandidates,
  scoreCandidate,
  trafficBandFor,
  type EvidenceBundle,
} from "../src/scoring/model.js";

const base: EvidenceBundle = {
  candidateId: "a",
  candidateLabel: "Candidate A",
  competitorCount: 2,
  complementaryPoiCount: 30,
  catchmentRadiusM: 800,
  catchmentAreaM2: Math.PI * 800 * 800,
  meanAccessDurationS: 600,
};

describe("scoreCandidate", () => {
  it("returns sub-scores in [0,1] and a weighted total", () => {
    const s = scoreCandidate(base);
    for (const v of Object.values(s.scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const expected =
      s.scores.competition * DEFAULT_WEIGHTS.competition +
      s.scores.complementarity * DEFAULT_WEIGHTS.complementarity +
      s.scores.catchment * DEFAULT_WEIGHTS.catchment +
      s.scores.accessibility * DEFAULT_WEIGHTS.accessibility;
    expect(s.total).toBeCloseTo(expected, 10);
    expect(s.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it("is deterministic: same input → identical output", () => {
    expect(scoreCandidate(base)).toEqual(scoreCandidate(base));
  });

  it("fewer competitors scores higher on competition", () => {
    const low = scoreCandidate({ ...base, competitorCount: 0 });
    const high = scoreCandidate({ ...base, competitorCount: 40 });
    expect(low.scores.competition).toBeGreaterThan(high.scores.competition);
  });

  it("vn-hcmc and th-bangkok profiles reproduce the default scores exactly", () => {
    // Guard against a vacuous pass: a missing named ESM import resolves to
    // undefined under esbuild, and scoreCandidate(undefined) falls back to
    // the default profile — so pin the profile identities first.
    expect(VN_HCMC_PROFILE.id).toBe("vn-hcmc");
    expect(TH_BANGKOK_PROFILE.id).toBe("th-bangkok");
    const s0 = scoreCandidate(base, DEFAULT_MARKET_PROFILE);
    expect(scoreCandidate(base, VN_HCMC_PROFILE)).toEqual(s0);
    expect(scoreCandidate(base, TH_BANGKOK_PROFILE)).toEqual(s0);
  });

  it("traffic band is null while the profile has no trafficScale", () => {
    expect(trafficBandFor(0.66, VN_HCMC_PROFILE)).toBeNull();
    expect(trafficBandFor(0.66, TH_BANGKOK_PROFILE)).toBeNull();
  });

  it("missing accessibility evidence scores neutral 0.5", () => {
    const { meanAccessDurationS: _drop, ...rest } = base;
    const s = scoreCandidate(rest);
    expect(s.scores.accessibility).toBe(0.5);
  });
});

describe("rankCandidates", () => {
  it("sorts best-first, ties broken by candidateId", () => {
    const b = scoreCandidate({ ...base, candidateId: "b", competitorCount: 50 });
    const a = scoreCandidate({ ...base, candidateId: "a", competitorCount: 0 });
    const ranked = rankCandidates([b, a]);
    expect(ranked[0].candidateId).toBe("a");
    const t1 = scoreCandidate({ ...base, candidateId: "x" });
    const t2 = scoreCandidate({ ...base, candidateId: "y" });
    expect(rankCandidates([t2, t1]).map((c) => c.candidateId)).toEqual(["x", "y"]);
  });
});
