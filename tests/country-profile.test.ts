/**
 * CountryProfile tests. Verify that VN_HCMC_PROFILE reproduces the legacy
 * constants, and that a second synthetic profile is honoured end to end
 * through the planner and the geocoder without touching the engine.
 */
import { describe, expect, it } from "vitest";
import { VN_HCMC_PROFILE, type CountryProfile } from "../src/engine/profile.js";
import {
  AREA_ALIASES,
  BUSINESS_RULES,
  DEFAULT_ORIGINS,
  PLANNER_SYSTEM_PROMPT,
  heuristicPlan,
  parseLlmPlan,
  reconcileArea,
  reconcileCompetitor,
} from "../src/engine/plan.js";
import { GeoapifyApi } from "../src/engine/geoapify.js";
import { resolvePlace } from "../src/engine/scout.js";

/** Synthetic market: Hanoi. Reuses the VN business rules, swaps geography. */
const HANOI_PROFILE: CountryProfile = {
  ...VN_HCMC_PROFILE,
  id: "vn-hanoi-test",
  label: "Hanoi, Vietnam (test)",
  biasPoint: [105.8342, 21.0278],
  boundaryCheck: (lat, lon) => Math.abs(lat - 21.0278) < 0.3 && Math.abs(lon - 105.8342) < 0.3,
  areaSuffix: "Hà Nội",
  areaAliases: [{ match: /hoan kiem|hoàn kiếm/i, area: "Hồ Hoàn Kiếm, Hà Nội" }],
  defaultAreaLabel: "Hồ Hoàn Kiếm",
  defaultOrigins: ["Hồ Hoàn Kiếm, Hà Nội", "Ga Hà Nội, Hai Bà Trưng, Hà Nội"],
  plannerPrompt: "Test prompt for Hanoi.",
};

describe("VN_HCMC_PROFILE preserves the legacy constants", () => {
  it("bias point is the HCMC centre used before the refactor", () => {
    expect(VN_HCMC_PROFILE.biasPoint).toEqual([106.7009, 10.7769]);
  });
  it("boundaryCheck accepts central HCMC and rejects Hanoi", () => {
    expect(VN_HCMC_PROFILE.boundaryCheck(10.7721, 106.6983)).toBe(true); // Bến Thành
    expect(VN_HCMC_PROFILE.boundaryCheck(21.0278, 105.8342)).toBe(false); // Hanoi
  });
  it("legacy exports are the same objects as the profile fields", () => {
    expect(AREA_ALIASES).toBe(VN_HCMC_PROFILE.areaAliases);
    expect(DEFAULT_ORIGINS).toBe(VN_HCMC_PROFILE.defaultOrigins);
    expect(BUSINESS_RULES).toBe(VN_HCMC_PROFILE.businessRules);
    expect(PLANNER_SYSTEM_PROMPT).toBe(VN_HCMC_PROFILE.plannerPrompt);
  });
  it("omitting the profile gives the same plan as passing VN_HCMC_PROFILE", () => {
    const q = "Mở tiệm bánh mì ở Quận 3";
    expect(heuristicPlan(q)).toEqual(heuristicPlan(q, VN_HCMC_PROFILE));
  });
});

describe("planner honours the profile", () => {
  it("area aliases and suffix come from the profile", () => {
    const p = heuristicPlan("Mở quán cà phê ở Hoan Kiem", HANOI_PROFILE).plan;
    expect(p.area).toBe("Hồ Hoàn Kiếm, Hà Nội");
    expect(p.origins).toEqual(["Ga Hà Nội, Hai Bà Trưng, Hà Nội"]);
  });
  it("an unrecognised area falls back to the profile's default label and suffix", () => {
    const out = heuristicPlan("Open a gym", HANOI_PROFILE);
    expect(out.plan.area).toBe("Hồ Hoàn Kiếm, Hà Nội");
    expect(out.notes.join()).toContain("defaulted to Hồ Hoàn Kiếm");
  });
  it("reconcileArea uses the profile aliases", () => {
    const base = heuristicPlan("Open a gym", HANOI_PROFILE).plan;
    const notes: string[] = [];
    const r = reconcileArea("gym near Hoan Kiem", { ...base, area: "somewhere, Hà Nội" }, notes, HANOI_PROFILE);
    expect(r.area).toBe("Hồ Hoàn Kiếm, Hà Nội");
    expect(notes.join()).toMatch(/replaced by the verified geocode text/);
  });
  it("reconcileCompetitor and parseLlmPlan accept a profile", () => {
    const notes: string[] = [];
    const raw = JSON.stringify({ business: "bánh mì shop", competitorCategory: "catering.cafe", demandCategories: ["office"], area: "Hoan Kiem, Hà Nội", walkMinutes: 10, candidates: 7, origins: ["Ga Hà Nội"] });
    const p = parseLlmPlan(raw, notes, "bánh mì bakery near Hoan Kiem", HANOI_PROFILE);
    expect(p.competitorCategory).toBe("commercial.food_and_drink.bakery");
    expect(p.area).toBe("Hồ Hoàn Kiếm, Hà Nội");
    const c = reconcileCompetitor("coffee", { ...p, competitorCategory: "catering.cafe" }, [], HANOI_PROFILE);
    expect(c.competitorCategory).toBe("catering.cafe");
  });
});

describe("resolvePlace honours the profile boundary", () => {
  // One Hanoi hit returned for every geocoder request.
  const hanoiHit = {
    results: [{ formatted: "Hồ Hoàn Kiếm, Hà Nội", lat: 21.0285, lon: 105.8542, result_type: "amenity", rank: { confidence: 0.9 } }],
  };
  const fetchImpl = (async () =>
    new Response(JSON.stringify(hanoiHit), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  it("rejects an out-of-market hit under the HCMC profile", async () => {
    const api = new GeoapifyApi({ fetchImpl });
    const r = await resolvePlace(api, "Hồ Hoàn Kiếm, Hà Nội");
    expect(r.hit).toBeUndefined();
  });
  it("accepts the same hit under a profile whose boundary covers Hanoi", async () => {
    const api = new GeoapifyApi({ fetchImpl });
    const r = await resolvePlace(api, "Hồ Hoàn Kiếm, Hà Nội", HANOI_PROFILE);
    expect(r.hit?.lat).toBe(21.0285);
    expect(r.hit?.formatted).toBe("Hồ Hoàn Kiếm, Hà Nội");
  });
});
