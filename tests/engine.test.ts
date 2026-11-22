/**
 * Engine tests. The product path always hits the live Geoapify API; these
 * tests inject a fake `fetch` (tests only) to pin down planning, candidate
 * generation, scoring and rendering deterministically.
 */
import { describe, expect, it } from "vitest";
import { BUSINESS_RULES, heuristicPlan, parseLlmPlan, AREA_ALIASES, reconcileCompetitor } from "../src/engine/plan.js";
import { CATEGORY_SET } from "../src/engine/categories.js";
import { GeoapifyApi } from "../src/engine/geoapify.js";
import { TH_BANGKOK_PROFILE } from "../src/engine/profile.js";
import { emptyChecklist, type MicroChecklist } from "../src/engine/checklist.js";
import { renderHtml, renderMarkdown, staticMapBody } from "../src/engine/render.js";
import { dataCoverageScore, VN_HCMC_PROFILE } from "../src/scoring/model.js";
import { runScout, type ScoutResult } from "../src/engine/scout.js";
import { isStale } from "../src/engine/freshness.js";
import { parseSignalsFile } from "../src/engine/signals-file.js";
import { type LocalSignal } from "../src/engine/signals.js";
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
  it("bánh mì → bakery competitor, even when the AI picks catering.cafe", () => {
    expect(heuristicPlan("Mở tiệm bánh mì ở Quận 3").plan.competitorCategory).toBe("commercial.food_and_drink.bakery");
    const notes: string[] = [];
    const raw = JSON.stringify({ business: "bánh mì shop", competitorCategory: "catering.cafe", demandCategories: ["office", "education.school"], area: "Quận 3, Hồ Chí Minh", walkMinutes: 10, candidates: 7, origins: ["Chợ Bến Thành, Quận 1, Hồ Chí Minh"] });
    const p = parseLlmPlan(raw, notes, "Where should I open a bánh mì bakery in District 3?");
    expect(p.competitorCategory).toBe("commercial.food_and_drink.bakery");
    expect(notes.join(" ")).toMatch(/does not match/);
    // a subcategory of the rule's competitor is kept
    const keep = reconcileCompetitor("coffee in Thảo Điền", { ...p, competitorCategory: "catering.cafe.coffee_shop" }, []);
    expect(keep.competitorCategory).toBe("catering.cafe.coffee_shop");
    // the question names District 3, so the verified alias text wins over the model's area
    expect(p.area).toBe("Hồ Con Rùa, Quận 3, Hồ Chí Minh");
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
function fakeFetch(opts: { isolineFails?: boolean; thinFirstCandidate?: boolean; ghost?: boolean } = {}): typeof fetch {
  // With thinFirstCandidate, the first geometry-filtered places query (the
  // first candidate's isoline) returns 1 café and 0 demand POIs.
  let thinFilter: string | null = null;
  const thin = (filter: string): boolean => {
    if (!opts.thinFirstCandidate || !filter.startsWith("geometry:")) return false;
    if (thinFilter === null) thinFilter = filter;
    return filter === thinFilter;
  };
  // With ghost, the first geometry-filtered places query returns one extra
  // competitor, "Ghost Cafe" (place_id ghost-1), and Place Details for that
  // id returns a closed marker (see tests/fixtures/ghost-poi.json).
  let ghostFilter: string | null = null;
  const isGhostFilter = (filter: string): boolean => {
    if (!opts.ghost || !filter.startsWith("geometry:")) return false;
    if (ghostFilter === null) ghostFilter = filter;
    return filter === ghostFilter;
  };
  const ghostPoi = () => {
    const g = offset(anchor, 120, 80);
    return { type: "Feature", properties: { name: "Ghost Cafe", lat: g.lat, lon: g.lon, categories: ["catering", "catering.cafe"], place_id: "ghost-1" }, geometry: { type: "Point", coordinates: [g.lon, g.lat] } };
  };
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
        if (opts.isolineFails) return new Response("{}", { status: 404 });
        return j({ features: [{ type: "Feature", properties: { id: `iso-${q.get("lat")}` }, geometry: square(Number(q.get("lat")), Number(q.get("lon")), 400) }] });
      case "/v2/places": {
        const cat = q.get("categories")!;
        if (thin(q.get("filter") ?? "")) {
          const n = cat === "catering.cafe" ? 1 : 0;
          return j({ type: "FeatureCollection", features: Array.from({ length: n }, (_, i) => poi(i, cat, (i - 2) * 300 + (cat.length % 7) * 40, (i % 3) * 250 - 250)) });
        }
        const n = cat === "catering.cafe" ? 6 : 4;
        const features = Array.from({ length: n }, (_, i) => poi(i, cat, (i - 2) * 300 + (cat.length % 7) * 40, (i % 3) * 250 - 250));
        if (cat === "catering.cafe" && isGhostFilter(q.get("filter") ?? "")) features.push(ghostPoi());
        return j({ type: "FeatureCollection", features });
      }
      case "/v1/routematrix": {
        const body = JSON.parse(String(init?.body));
        return j({ sources_to_targets: body.sources.map((_: unknown, si: number) => body.targets.map((_t: unknown, ti: number) => ({ time: 900 + 60 * ti + 30 * si, distance: 5000 }))) });
      }
      case "/v1/routing":
        return j({ features: [{ type: "Feature", properties: { time: 1200, distance: 8000 }, geometry: { type: "LineString", coordinates: [[106.7, 10.77], [106.73, 10.8]] } }] });
      case "/v2/place-details":
        if (opts.ghost && q.get("id") === "ghost-1") {
          // Closed marker per tests/fixtures/ghost-poi.json.
          const closed = ghostPoi();
          (closed.properties as Record<string, unknown>).closed = true;
          return j({ type: "FeatureCollection", features: [closed] });
        }
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
    // Regression guard (Task 2): pin the unified model's ranking order on
    // this fake city. NOTE — this is NOT the v1 order (c1, c5, c4, c2, c3,
    // c6, c7, recorded 2026-11-22 by a scratch run against main @ 5778b0a):
    // v1 min-max normalised the isoline areas across candidates, so
    // sub-metre area noise became full [0, 1] score swings and drove the
    // ranking. The unified model scores on absolute scales, so the ranking
    // is now driven by the only real varying signal in this fixture — the
    // drive times (900 + 60·target-index s). The plan's "pin ranking
    // order" guard cannot hold across the model change; the pinned order
    // below is the unified model's deterministic order. Exact totals are
    // NOT pinned — the REST model changed by construction (spec §2.1
    // "score identically" cannot hold for both disagreeing v1 models).
    expect(r.candidates.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
    expect(r.weightsVersion).toBe("2.0.0-unified");
    // never a key in the trace
    expect(JSON.stringify(r.calls)).not.toMatch(/apiKey=/);
    const md = renderMarkdown(r);
    expect(md).toContain("Ranked shortlist");
    expect(md).toContain("Powered by [Geoapify]");
    const body = staticMapBody(r);
    expect((body.markers as unknown[]).length).toBe(7);
  });

  it("rejects a Bangkok-profile run whose anchor resolves outside the 40 km radius", async () => {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch() });
    // The fake geocoder always returns the Thảo Điền anchor, which is
    // outside Bangkok's 40 km boundary — the engine must reject it naming
    // the market, never silently score the wrong city.
    await expect(
      runScout("Where should I open a coffee shop in Thonglor?", heuristicPlan("coffee in Thonglor", TH_BANGKOK_PROFILE), { api, profile: TH_BANGKOK_PROFILE }),
    ).rejects.toThrow(/Bangkok, Thailand/);
  });

  it("falls back to a 600 m disk for every candidate when all isolines fail", async () => {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch({ isolineFails: true }) });
    const r = await runScout("Where should I open a specialty coffee shop in Thảo Điền?", heuristicPlan("coffee in Thảo Điền"), { api });
    expect(r.candidates).toHaveLength(7);
    for (const c of r.candidates) {
      expect(c.isoline).toBeNull();
      expect(c.isolineAreaM2).toBeCloseTo(Math.PI * 600 ** 2, 0);
      expect(c.total).toBeGreaterThanOrEqual(0);
      expect(c.total).toBeLessThanOrEqual(1);
    }
    expect(r.limitations.join(" ")).toMatch(/Isoline failed for candidate/);
  });

  it("excludes a candidate below the POI floor instead of ranking it", async () => {
    const api = new GeoapifyApi({ fetchImpl: thinDataApi() });
    const r = await runScout("coffee in Thảo Điền", heuristicPlan("coffee in Thảo Điền"), { api });
    expect(r.candidates.every((c) => c.competitors + c.demandTotal >= 5)).toBe(true);
    expect(r.excluded.length).toBeGreaterThan(0);
    expect(r.excluded[0].reason).toMatch(/insufficient data/i);
  });

  it("coverage score is 0 with no POIs and 1 at the profile expectation", () => {
    expect(dataCoverageScore(0, VN_HCMC_PROFILE)).toBe(0);
    expect(dataCoverageScore(33, VN_HCMC_PROFILE)).toBe(1); // 8 + 25
  });
});

describe("runScout memo v2 data model", () => {
  it("attaches an all-UNVERIFIED checklist, a verdict, and dates to every candidate", async () => {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch() });
    const r = await runScout("Where should I open a specialty coffee shop in Thảo Điền?", heuristicPlan("coffee in Thảo Điền"), { api });
    expect(r.dataAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.dataAsOf).toBe(r.generatedAt.slice(0, 10));
    for (const c of r.candidates) {
      expect(Object.values(c.checklist).every((f) => f.status === "UNVERIFIED")).toBe(true);
      // All-UNVERIFIED top-3 candidates cannot be recommended.
      expect(c.verdict).toBe(c.rank <= 3 ? "verify on foot before deciding" : "recommend");
      expect(c.trafficBand).toBeNull(); // no trafficScale yet
    }
  });

  it("a verified top-3 candidate is recommended; an unknown id fails loudly", async () => {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch() });
    const r = await runScout("Where should I open a specialty coffee shop in Thảo Điền?", heuristicPlan("coffee in Thảo Điền"), {
      api,
      checklist: { c1: allVerifiedChecklist() },
    });
    expect(r.candidates.find((c) => c.id === "c1")!.verdict).toBe("recommend");
    expect(r.candidates.find((c) => c.id === "c2")!.verdict).toBe("verify on foot before deciding");

    const api2 = new GeoapifyApi({ fetchImpl: fakeFetch() });
    await expect(
      runScout("Where should I open a specialty coffee shop in Thảo Điền?", heuristicPlan("coffee in Thảo Điền"), {
        api: api2,
        checklist: { c9: emptyChecklist() },
      }),
    ).rejects.toThrow(/c9/);
  });
});

/** Variant of fakeFetch() whose first candidate sees 1 café and 0 demand POIs. */
function thinDataApi(): typeof fetch {
  return fakeFetch({ thinFirstCandidate: true });
}

/** Variant of fakeFetch() whose first candidate sees a closed "Ghost Cafe". */
function ghostApi(): typeof fetch {
  return fakeFetch({ ghost: true });
}

/** All six micro-factors VERIFIED (site visit 2026-11-20). */
const allVerifiedChecklist = (): MicroChecklist => ({
  walkability: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  curbAppeal: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  construction: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  morningShade: { status: "VERIFIED", source: "Street View 2026-10-15", observedAt: "2026-10-15" },
  motorcycleParking: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  alleyLighting: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
});

describe("GeoapifyApi against the demo proxy", () => {
  it("does not retry a 429 the proxy marks as 'daily budget used up'", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response(JSON.stringify({ error: "daily live quota reached", fallback: true }), { status: 429, headers: { "content-type": "application/json", "x-sitescout-fallback": "quota" } });
    }) as typeof fetch;
    const api = new GeoapifyApi({ fetchImpl, baseUrl: "https://demo.example/geo" });
    await expect(api.autocomplete("Thảo Điền")).rejects.toThrow(/429/);
    expect(n).toBe(1);
  });

  it("records 2 credits for a 10-minute walk isoline (1 per 5 minutes)", async () => {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch() });
    await api.isoline({ lat: 10.8, lon: 106.73, mode: "walk", range: 600 });
    expect(api.calls[0].credits).toBe(2);
  });
});

describe("memo v2 rendering", () => {
  /**
   * Fake-fetch run + a 2-UNVERIFIED checklist on #1 + a 120–180 band on #1.
   * Async because the fixture is built from runScout (the plan's snippet
   * shows a sync call; runScout is async, so the builder and test await).
   */
  async function memoV2Result(): Promise<ScoutResult> {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch() });
    const c1 = allVerifiedChecklist();
    c1.walkability.status = "UNVERIFIED";
    c1.motorcycleParking.status = "UNVERIFIED";
    const r = await runScout("Where should I open a specialty coffee shop in Thảo Điền?", heuristicPlan("coffee in Thảo Điền"), {
      api,
      checklist: { c1 },
    });
    const top = r.candidates.find((c) => c.rank === 1)!;
    top.trafficBand = { low: 120, high: 180 };
    return r;
  }

  it("memo v2 renders the checklist, the band, and the expiry notice in md and html", async () => {
    const r = await memoV2Result();
    const md = renderMarkdown(r);
    const html = renderHtml(r);
    for (const out of [md, html]) {
      expect(out).toContain("What this model cannot see");
      expect(out).toContain("Data as of");
      expect(out).toContain("verify on foot before deciding");
      expect(out).toContain("Visit the site before signing a lease.");
      expect(out).not.toMatch(/calibrated/i);
    }
    expect(md).toContain("120–180"); // band fixture value, never a point projection
    expect(html).toContain("120–180");
    // md and html agree on the numbers: same totals and verdicts in both.
    for (const c of r.candidates) {
      expect(md).toContain(c.total.toFixed(2));
      expect(html).toContain(c.total.toFixed(2));
    }
  });
});

describe("ghost-POI filter", () => {
  it("moves a known-closed competitor out of the count into unconfirmed", async () => {
    const r = await runScout("coffee in Thảo Điền", heuristicPlan("coffee in Thảo Điền"), { api: new GeoapifyApi({ fetchImpl: ghostApi() }) });
    expect(r.unconfirmed.map((u) => u.name)).toContain("Ghost Cafe");
    expect(r.candidates.flatMap((c) => c.pois.map((p) => p.name))).not.toContain("Ghost Cafe");
    // The ghost no longer counts as competition for its candidate (c1 had
    // 6 real cafés + the ghost; the ghost is the only one removed).
    expect(r.candidates.find((c) => c.id === "c1")?.competitors).toBe(6);
    expect(r.unconfirmed[0]).toMatchObject({ name: "Ghost Cafe", category: "catering.cafe", reason: "unconfirmed — verify on foot" });
    // And the memo renders the unconfirmed section in both formats.
    const md = renderMarkdown(r);
    const html = renderHtml(r);
    for (const out of [md, html]) {
      expect(out).toContain("Unconfirmed competitors — verify on foot");
      expect(out).toContain("Ghost Cafe");
    }
  });
  it("flags counts older than 90 days as stale", () => {
    expect(isStale("2026-08-01", new Date("2026-11-22"))).toBe(true);
    expect(isStale("2026-11-01", new Date("2026-11-22"))).toBe(false);
  });
});

describe("local signals (operator-reported)", () => {
  /**
   * Async because the fixture is built from runScout (the plan's snippet
   * shows a sync call; runScout is async, so the builder and test await —
   * same as the memo v2 fixture above).
   */
  async function resultWithSignal(signal: LocalSignal): Promise<ScoutResult> {
    const api = new GeoapifyApi({ fetchImpl: fakeFetch() });
    return runScout(
      "Where should I open a specialty coffee shop in Thảo Điền?",
      heuristicPlan("coffee in Thảo Điền"),
      { api, signals: [signal] },
    );
  }

  it("renders an operator-reported signal with observer and date", async () => {
    const r = await resultWithSignal({
      kind: "closure",
      street: "Soi 55",
      observedBy: "operator",
      observedAt: "2026-11-20",
    });
    expect(r.signals).toHaveLength(1);
    const md = renderMarkdown(r);
    const html = renderHtml(r);
    for (const out of [md, html]) {
      expect(out).toContain("Local signals (operator-reported)");
      expect(out).toContain("Soi 55");
      expect(out).toContain("2026-11-20");
      expect(out).toContain("operator");
    }
  });
  it("signals never alter a score", async () => {
    const plain = await runScout(
      "Where should I open a specialty coffee shop in Thảo Điền?",
      heuristicPlan("coffee in Thảo Điền"),
      { api: new GeoapifyApi({ fetchImpl: fakeFetch() }) },
    );
    const withSignal = await resultWithSignal({
      kind: "delivery-presence",
      street: "Soi 55",
      observedBy: "operator",
      observedAt: "2026-11-20",
      note: "Delivery riders queued outside",
    });
    expect(withSignal.candidates.map((c) => c.total)).toEqual(plain.candidates.map((c) => c.total));
    expect(withSignal.candidates.map((c) => c.rank)).toEqual(plain.candidates.map((c) => c.rank));
  });
  it("rejects a signal without observer or date", () => {
    expect(() => parseSignalsFile("tests/fixtures/bad-signals.json")).toThrow(/observedBy|observedAt/);
  });
});
