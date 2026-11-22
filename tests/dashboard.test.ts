import { describe, expect, it } from "vitest";
import { buildMemoIndex, loadCalibration } from "../scripts/build-memo-index.mjs";
import { renderDashboard, type MemoIndex } from "../web/src/dashboard.js";

function memoFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    memoId: "signed-only",
    market: "vn-hcmc",
    business: "coffee shop",
    topCandidate: "159, Võ Nguyên Giáp",
    band: { low: 120, high: 180 },
    ...overrides,
  };
}

function signedOutcome(): Record<string, unknown> {
  return {
    memoId: "signed-only",
    candidateId: "c1",
    decision: "signed",
    actualDailyCustomersMean: null,
    actualTrafficTier: null,
    measurementMethod: "customer-counts",
    projectedLow: 120,
    projectedHigh: 180,
    observedAt: "2026-11-20",
    source: "operator report",
  };
}

function openedOutcome(): Record<string, unknown> {
  return {
    memoId: "opened",
    candidateId: "c1",
    decision: "opened",
    actualDailyCustomersMean: 150,
    actualTrafficTier: "high",
    measurementMethod: "customer-counts",
    projectedLow: 120,
    projectedHigh: 180,
    observedAt: "2026-11-21",
    source: "operator report",
  };
}

function indexWithOrphanOutcome(): MemoIndex {
  return buildMemoIndex([], [
    {
      memoId: "no-such-memo",
      candidateId: "c1",
      decision: "opened",
      actualDailyCustomersMean: 150,
      actualTrafficTier: "high",
      measurementMethod: "customer-counts",
      projectedLow: 120,
      projectedHigh: 180,
      observedAt: "2026-11-21",
      source: "operator report",
    },
  ]);
}

describe("buildMemoIndex", () => {
  it("derives decided then outcome-recorded from the outcomes file", () => {
    const idx = buildMemoIndex(
      [memoFixture(), memoFixture({ memoId: "opened", topCandidate: "113 Nguyễn Hữu Cảnh" })],
      [signedOutcome(), openedOutcome()],
    );
    expect(idx.memos.find((m) => m.memoId === "signed-only")!.status).toBe("decided");
    expect(idx.memos.find((m) => m.memoId === "opened")!.status).toBe("outcome-recorded");
  });
  it("counts metering as aggregates only, with a null accountId reserved", () => {
    const idx = buildMemoIndex([memoFixture()], [signedOutcome()]);
    expect(idx.metering).toEqual({ memosGenerated: 1, marketsUsed: ["vn-hcmc"], outcomesRecorded: 1 });
    expect(idx.accountId).toBeNull();
  });
  it("excludes example outcomes from metering", () => {
    const idx = buildMemoIndex([], [{ ...openedOutcome(), _example: true }]);
    expect(idx.metering.outcomesRecorded).toBe(0);
  });
});

describe("renderDashboard", () => {
  it("renders an empty state when the index has no memos", () => {
    expect(
      renderDashboard({
        generatedAt: "",
        memos: [],
        metering: { memosGenerated: 0, marketsUsed: [], outcomesRecorded: 0 },
        accountId: null,
      }),
    ).toContain("No memos yet");
  });
  it("renders an outcome whose memo is missing from the index as an unknown-memo row", () => {
    const html = renderDashboard(indexWithOrphanOutcome());
    expect(html).toContain("unknown memo");
  });
  it("surfaces the gate-open state when the bench dataset is below the 30/10 minimum", () => {
    const base: MemoIndex = {
      generatedAt: "",
      memos: [{ memoId: "thaodien-coffee", market: "vn-hcmc", business: "coffee shop", status: "delivered", topCandidate: "159, Võ Nguyên Giáp", band: null }],
      metering: { memosGenerated: 1, marketsUsed: ["vn-hcmc"], outcomesRecorded: 0 },
      calibration: [{ market: "th-bangkok", version: "2.0.0-unified", runDate: "2026-11-22", entries: 5, closedEntries: 2, gateOpen: true }],
      accountId: null,
    };
    expect(renderDashboard(base)).toContain("gate open — example data only");
    const closed: MemoIndex = { ...base, calibration: [{ market: "th-bangkok", version: "2.0.0-calibrated", runDate: "2026-11-22", entries: 30, closedEntries: 10, gateOpen: false }] };
    expect(renderDashboard(closed)).not.toContain("gate open");
  });
  it("loadCalibration flags the Bangkok bench gate open on its 5 EXAMPLE entries", () => {
    const cal = loadCalibration(".");
    const bangkok = cal.find((c: { market: string }) => c.market === "th-bangkok")!;
    expect(bangkok.entries).toBe(5);
    expect(bangkok.closedEntries).toBe(2);
    expect(bangkok.gateOpen).toBe(true);
    expect(cal.find((c: { market: string }) => c.market === "vn-hcmc")!.gateOpen).toBe(false);
  });
});
