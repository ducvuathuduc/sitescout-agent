import { describe, expect, it } from "vitest";
import {
  dudRate,
  runBench,
  spearmanRankCorrelation,
  top3HitRate,
  validateDataset,
} from "../src/bench/bangkok.js";

const validEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "bk-001",
  label: "Example Coffee, Thonglor",
  lat: 13.73,
  lon: 100.58,
  area: "Thonglor",
  status: "open",
  opened_approx: "2022-03",
  closed_approx: null,
  traffic_tier: "high",
  tier_source: "operator-reported",
  observed_at: "2026-11-01",
  ...overrides,
});

const makeEntries = (n: number, nClosed: number) =>
  Array.from({ length: n }, (_, i) =>
    validEntry({
      id: `bk-${String(i + 1).padStart(3, "0")}`,
      lat: 13.73 + i * 0.001,
      lon: 100.58 + i * 0.001,
      status: i < nClosed ? "closed" : "open",
      closed_approx: i < nClosed ? "2024-06" : null,
    }),
  );

describe("validateDataset", () => {
  it("rejects a dataset with fewer than 30 entries or fewer than 10 closed", () => {
    expect(validateDataset(makeEntries(29, 10)).ok).toBe(false);
    expect(validateDataset(makeEntries(30, 9)).ok).toBe(false);
    expect(validateDataset(makeEntries(30, 10)).ok).toBe(true);
  });

  it("rejects an invented traffic tier", () => {
    const r = validateDataset([{ ...validEntry(), traffic_tier: "booming" }]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/traffic_tier/);
  });

  it("rejects a closed entry with no closed_approx and duplicate ids", () => {
    expect(validateDataset([validEntry({ status: "closed", closed_approx: null })]).ok).toBe(false);
    expect(validateDataset([validEntry(), validEntry()]).ok).toBe(false);
  });
});

describe("bench metrics", () => {
  it("spearman is 1 for identical order and -1 for reversed order", () => {
    expect(spearmanRankCorrelation([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(spearmanRankCorrelation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
  });

  it("top-3 hit rate and dud rate count only the top 3", () => {
    expect(top3HitRate([{ tier: "high" }, { tier: "medium" }, { tier: "low" }])).toBeCloseTo(2 / 3, 10);
    expect(dudRate([
      { status: "open", tier: "high" },
      { status: "closed", tier: "low" },
      { status: "open", tier: "low" },
    ])).toBeCloseTo(2 / 3, 10);
  });

  it("computes the three metrics on the synthetic fixture", () => {
    const m = runBench("tests/fixtures/bangkok-coffee-dataset.json", "tests/fixtures/bangkok-coffee-run.json");
    expect(m.rankCorrelation).toBeGreaterThanOrEqual(-1);
    expect(m.rankCorrelation).toBeLessThanOrEqual(1);
    expect(m.top3HitRate).toBeGreaterThanOrEqual(0);
    expect(m.top3HitRate).toBeLessThanOrEqual(1);
    expect(m.dudRate).toBeGreaterThanOrEqual(0);
    expect(m.dudRate).toBeLessThanOrEqual(1);
  });
});
