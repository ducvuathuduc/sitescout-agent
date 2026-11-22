import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeCalibrationReport, matchTrafficBand, parseOutcomeLine } from "../src/bench/outcomes.js";
import { recordOutcome } from "../src/outcome-cli.js";

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

describe("matchTrafficBand", () => {
  it("the ±20% match rule widens the band, it does not widen the actual", () => {
    expect(matchTrafficBand(120, 180, 144)).toBe(true); // inside [96, 216]
    expect(matchTrafficBand(120, 180, 95)).toBe(false); // below 120 × 0.8
    expect(matchTrafficBand(120, 180, 217)).toBe(false); // above 180 × 1.2
  });
});

describe("recordOutcome", () => {
  it("record refuses an outcome for a memo with no band on file", () => {
    expect(() => recordOutcome({ memoId: "no-such-memo", bandLow: 0, bandHigh: 0 })).toThrow(/no-such-memo/);
  });
  it("record onto a file without a trailing newline keeps both lines parseable", () => {
    const dir = mkdtempSync(join(tmpdir(), "sitescout-outcomes-"));
    try {
      const outcomesPath = join(dir, "outcomes.jsonl");
      writeFileSync(outcomesPath, JSON.stringify({ ...validOutcome(), _example: true })); // no trailing newline
      recordOutcome({
        memoId: "example-memo",
        candidateId: "c1",
        decision: "opened",
        method: "customer-counts",
        bandLow: 120,
        bandHigh: 180,
        actualMean: 144,
        observedAt: "2026-11-22",
        source: "operator report",
        outcomesPath,
        examplesDir: dir,
      });
      const lines = readFileSync(outcomesPath, "utf8").split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(lines.map((l) => parseOutcomeLine(l).actualDailyCustomersMean)).toEqual([150, 144]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("computeCalibrationReport", () => {
  it("aggregates only real traffic-match points; signed-only rows are n/a", () => {
    const report = computeCalibrationReport([
      parseOutcomeLine(JSON.stringify({ ...validOutcome(), _example: true })),
      parseOutcomeLine(JSON.stringify(signedOnlyOutcome())),
      parseOutcomeLine(JSON.stringify({ ...validOutcome(), memoId: "real-memo", actualDailyCustomersMean: 250 })),
    ]);
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0].match).toBe(true); // example row still judged, but excluded below
    expect(report.rows[1].match).toBeNull(); // signed, no traffic yet
    expect(report.rows[2].match).toBe(false); // 250 outside [96, 216]
    expect(report.nMatchable).toBe(1);
    expect(report.nMatched).toBe(0);
    expect(report.matchShare).toBe(0);
    expect(report.nSignedOnly).toBe(1);
  });
});
