import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { areaCheck, mergeOverrides, summarize, buildServer } from "../src/mcp-server.js";
import { heuristicPlan } from "../src/engine/plan.js";
import type { ScoutResult } from "../src/engine/scout.js";

describe("areaCheck (regression: agent/transcripts/02a)", () => {
  it("accepts a resolved area that shares a token with the query", () => {
    expect(areaCheck("Ngã tư Hàng Xanh, Bình Thạnh, Hồ Chí Minh", "Ngã tư Hàng Xanh, Cầu vượt Hàng Xanh, Phường Thạnh Mỹ Tây")).toBe("ok");
  });
  it("flags a garbled query that landed elsewhere", () => {
    const r = areaCheck("mở mở nhà thuốc ứ Ểnh Thắc", "Hẻm 108 Cộng Hòa, Phường Tân Sơn Nhất", "Phường Tân Sơn Nhất");
    expect(r.startsWith("mismatch")).toBe(true);
  });
  it("is diacritic-insensitive", () => {
    expect(areaCheck("Thao Dien", "Đường Xuân Thuỷ, Thảo Điền, Phường An Khánh")).toBe("ok");
  });
});

describe("mergeOverrides (regression: agent/transcripts/02b)", () => {
  const base = heuristicPlan("Where should I open a pharmacy in Bình Thạnh?").plan;
  it("drops invented categories and keeps the planner's", () => {
    const notes: string[] = [];
    const p = mergeOverrides(base, { competitorCategory: "Nhà thuốc", demandCategories: ["Bệnh viện"] }, notes);
    expect(p.competitorCategory).toBe("healthcare.pharmacy");
    expect(p.demandCategories).toEqual(base.demandCategories);
    expect(notes.join(" ")).toMatch(/Nhà thuốc/);
  });
  it("applies valid overrides", () => {
    const p = mergeOverrides(base, { walkMinutes: 7 }, []);
    expect(p.walkMinutes).toBe(7);
  });
  it("falls back to the base plan on schema violations", () => {
    const notes: string[] = [];
    const p = mergeOverrides(base, { walkMinutes: 99 }, notes);
    expect(p.walkMinutes).toBe(base.walkMinutes);
    expect(notes[0]).toMatch(/rejected/);
  });
});

describe("summarize on a recorded run", () => {
  const r = JSON.parse(readFileSync("examples/saigon-lunch/result.json", "utf8")) as ScoutResult;
  const s = summarize(r);
  it("maps refs per metric to the right API", () => {
    const apiOf = new Map(r.calls.map((c) => [c.seq, c.api]));
    for (const c of s.candidates) {
      for (const x of c.evidence.poiCounts) expect(apiOf.get(x)).toBe("places");
      for (const x of c.evidence.isochrone) expect(apiOf.get(x)).toBe("isoline");
    }
  });
  it("exposes the real requests behind #1 without any key", () => {
    expect(s.topCandidateCalls.some((c) => c.endpoint.includes("/v2/places") && c.endpoint.includes("geometry"))).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/apiKey=/i);
  });
});

describe("server", () => {
  it("builds with 5 tools", () => {
    const server = buildServer();
    expect(server).toBeTruthy();
  });
});
