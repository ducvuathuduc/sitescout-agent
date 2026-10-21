import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  rankCandidates,
  scoreCandidate,
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
