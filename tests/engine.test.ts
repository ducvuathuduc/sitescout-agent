/**
 * Engine tests. The product path always hits the live Geoapify API; these
 * tests inject a fake `fetch` (tests only) to pin down planning, candidate
 * generation, scoring and rendering deterministically.
 */
import { describe, expect, it } from "vitest";
import { BUSINESS_RULES, heuristicPlan, parseLlmPlan, AREA_ALIASES } from "../src/engine/plan.js";
import { CATEGORY_SET } from "../src/engine/categories.js";
import { GeoapifyApi } from "../src/engine/geoapify.js";
import { runScout } from "../src/engine/scout.js";
import { renderMarkdown, staticMapBody } from "../src/engine/render.js";
import { offset } from "../src/geo/grid.js";

describe("planner", () => {
  it("every category used by the heuristic planner exists in the live catalog", () => {
    for (const r of BUSINESS_RULES) {
      expect(CATEGORY_SET.has(r.competitor), r.competitor).toBe(true);
      for (const d of r.demand) expect(CATEGORY_SET.has(d), d).toBe(true);
    }
  });
  it("parses Vietnamese questions", () => {
    const p = heuristicPlan("Mở nhà thuốc ở Bình Thạnh thì chỗ nào tốt?").plan;
    expect(p.competitorCategory).toBe("healthcare.pharmacy");
    expect(p.area).toContain("Hàng Xanh");
  });
  it("aliases cover the three HCMC questions", () => {
    for (const q of ["Thảo Điền", "Bình Thạnh", "District 1"]) expect(AREA_ALIASES.some((a) => a.match.test(q))).toBe(true);
  });
  it("LLM output is validated: invalid categories dropped, ranges clamped", () => {
    const notes: string[] = [];
    const p = parseLlmPlan(
      'Sure! {"business":"gym","competitorCategory":"sport.fitness","demandCategories":["office","commercial.gym"],"area":"Thảo Điền, Hồ Chí Minh","walkMinutes":30,"candidates":12,"origins":["Chợ Bến Thành"]}',
      notes,
    );
    expect(p.demandCategories).toEqual(["office"]);
    expect(p.walkMinutes).toBe(15);
    expect(p.candidates).toBe(8);
    expect(notes.join()).toContain("commercial.gym");
  });
  it("LLM output with an invented competitor category is rejected", () => {
    expect(() => parseLlmPlan('{"business":"x","competitorCategory":"commercial.gym","demandCategories":["office"],"area":"Q1, Hồ Chí Minh","walkMinutes":10,"candidates":6,"origins":["Chợ Bến Thành"]}', [])).toThrow();
  });
});

/** Fake Geoapify (tests only): a tiny synthetic city around Thảo Điền. */
function fakeFetch(): typeof fetch {
  const anchor = { lat: 10.8035, lon: 106.7375 };
  const poi = (i: number, cat: string, dx: number, dy: number) => {
    const p = offset(anchor, dx, dy);
    return { type: "Feature", properties: { name: `${cat}-${i}`, lat: p.lat, lon: p.lon, categories: [cat.split(".")[0], cat], place_id: `${cat}-${i}` }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
  };
  const square = (lat: number, lon: number, m: number) => {
    const a = offset({ lat, lon }, -m, -m), b = offset({ lat, lon }, m, m);
    return { type: "Polygon", coordinates: [[[a.lon, a.lat], [b.lon, a.lat], [b.lon, b.lat], [a.lon, b.lat], [a.lon, a.lat]]] };
  };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const j = (x: unknown) => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
    const q = u.searchParams;
    switch (u.pathname) {
      case "/v1/geocode/autocomplete":
      case "/v1/geocode/search":
        return j({ results: [{ formatted: `${q.get("text")}, Phường An Khánh, Thành phố Hồ Chí Minh`, lat: anchor.lat, lon: anchor.lon, result_type: "amenity", rank: { confidence: 0.9 } }] });
      case "/v1/boundaries/part-of":
        return j({ features: [{ type: "Feature", properties: { name: "Phường An Khánh", categories: ["administrative", "administrative.county_level"] }, geometry: square(anchor.lat, anchor.lon, 3000) }] });
      case "/v1/geocode/reverse":
        return j({ results: [{ formatted: "x", address_line1: `Street ${q.get("lat")}`, lat: 0, lon: 0, place_id: "pid" }] });
      case "/v1/isoline":
        return j({ features: [{ type: "Feature", properties: { id: `iso-${q.get("lat")}` }, geometry: square(Number(q.get("lat")), Number(q.get("lon")), 400) }] });
      case "/v2/places": {
        const cat = q.get("categories")!;
        const n = cat === "catering.cafe" ? 6 : 4;
        return j({ type: "FeatureCollection", features: Array.from({ length: n }, (_, i) => poi(i, cat, (i - 2) * 300 + (cat.length % 7) * 40, (i % 3) * 250 - 250)) });
      }
      case "/v1/routematrix": {
        const body = JSON.parse(String(init?.body));
        return j({ sources_to_targets: body.sources.map((_: unknown, si: number) => body.targets.map((_t: unknown, ti: number) => ({ time: 900 + 60 * ti + 30 * si, distance: 5000 }))) });
      }
      case "/v1/routing":
        return j({ features: [{ type: "Feature", properties: { time: 1200, distance: 8000 }, geometry: { type: "LineString", coordinates: [[106.7, 10.77], [106.73, 10.8]] } }] });
      case "/v2/place-details":
        return j({ features: [{ type: "Feature", properties: { feature_type: "drive_5" }, geometry: square(anchor.lat, anchor.lon, 1500) }] });
      default:
        return new Response("{}", { status: 404 });
    }
  }) as typeof fetch;
}

describe("runScout (fake fetch)", () => {
  it("generates 7 ranked candidates with refs and sane scores", async () => {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch() });
    const r = await runScout("Where should I open a specialty coffee shop in Thảo Điền?", heuristicPlan("coffee in Thảo Điền"), { api });
    expect(r.candidates).toHaveLength(7);
    expect(r.candidates.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const c of r.candidates) {
      expect(c.total).toBeGreaterThanOrEqual(0);
      expect(c.total).toBeLessThanOrEqual(1);
      expect(c.refs.length).toBeGreaterThan(2);
      expect(c.isoline?.type).toBe("Polygon");
    }
    expect(r.area.ward?.name).toBe("Phường An Khánh");
    expect(r.winnerDrive5).not.toBeNull();
    // never a key in the trace
    expect(JSON.stringify(r.calls)).not.toMatch(/apiKey=/);
    const md = renderMarkdown(r);
    expect(md).toContain("Ranked shortlist");
    expect(md).toContain("Powered by [Geoapify]");
    const body = staticMapBody(r);
    expect((body.markers as unknown[]).length).toBe(7);
  });
});
