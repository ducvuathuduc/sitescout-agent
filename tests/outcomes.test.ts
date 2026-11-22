import { describe, expect, it } from "vitest";
import { parseOutcomeLine } from "../src/bench/outcomes.js";

function validOutcome(): Record<string, unknown> {
  return {
    memoId: "thaodien-coffee",
    candidateId: "c1",
    candidateLabel: "Thảo Điền — Xuân Thủy",
    decision: "opened",
    actualDailyCustomersMean: 150,
    actualTrafficTier: "high",
    measurementMethod: "customer-counts",
    projectedLow: 120,
    projectedHigh: 180,
    observedAt: "2026-11-20",
    source: "owner-reported counts, week of 2026-11-16",
  };
}

function signedOnlyOutcome(): Record<string, unknown> {
  return {
    ...validOutcome(),
    decision: "signed",
    actualDailyCustomersMean: null,
    actualTrafficTier: null,
  };
}

describe("parseOutcomeLine", () => {
  it("rejects an outcome without a measurement method", () => {
    expect(() => parseOutcomeLine(JSON.stringify({ ...validOutcome(), measurementMethod: undefined }))).toThrow(
      /measurementMethod/,
    );
  });
  it("accepts a signed-lease outcome with no traffic yet", () => {
    expect(parseOutcomeLine(JSON.stringify(signedOnlyOutcome())).decision).toBe("signed");
  });
  it("accepts a full opened outcome with counts and tier", () => {
    const o = parseOutcomeLine(JSON.stringify(validOutcome()));
    expect(o.actualDailyCustomersMean).toBe(150);
    expect(o.actualTrafficTier).toBe("high");
  });
  it("rejects traffic-free outcomes unless the decision is signed", () => {
    expect(() =>
      parseOutcomeLine(
        JSON.stringify({ ...validOutcome(), decision: "opened", actualDailyCustomersMean: null, actualTrafficTier: null }),
      ),
    ).toThrow(/actualDailyCustomersMean/);
    expect(() =>
      parseOutcomeLine(
        JSON.stringify({ ...validOutcome(), decision: "passed", actualDailyCustomersMean: null, actualTrafficTier: null }),
      ),
    ).toThrow(/actualDailyCustomersMean/);
  });
  it("rejects a projected band with low above high", () => {
    expect(() =>
      parseOutcomeLine(JSON.stringify({ ...validOutcome(), projectedLow: 200, projectedHigh: 180 })),
    ).toThrow(/projectedLow/);
  });
  it("rejects a non-ISO observedAt", () => {
    expect(() => parseOutcomeLine(JSON.stringify({ ...validOutcome(), observedAt: "20/11/2026" }))).toThrow(/observedAt/);
  });
  it("keeps the clearly-marked example flag", () => {
    const o = parseOutcomeLine(JSON.stringify({ ...validOutcome(), _example: true }));
    expect(o._example).toBe(true);
  });
});
