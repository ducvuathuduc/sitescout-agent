/**
 * Demo proxy budget (web/worker/budget.ts): API calls and map tiles share one
 * daily credit budget. Rules: https://www.geoapify.com/pricing-details/ (2026-10-31).
 */
import { describe, expect, it } from "vitest";
import { checkCaps, credits, isolineCredits, spent, DEFAULT_DAILY_CAP, TILE_CREDITS } from "../web/worker/budget.js";
import { estimateCredits } from "../src/engine/geoapify.js";

const q = (s: string): URLSearchParams => new URLSearchParams(s);

describe("isoline credits: 1 credit for each 5 minutes", () => {
  it("counts a 10-minute walk as 2 credits", () => {
    expect(isolineCredits("600")).toBe(2);
    expect(credits("/v1/isoline", q("type=time&mode=walk&range=600"), {}, undefined)).toBe(2);
  });
  it("sums the bands of a multi-range request (5/10/15 min = 1+2+3)", () => {
    expect(isolineCredits("300,600,900")).toBe(6);
  });
  it("rounds partial 5-minute blocks up and never returns 0", () => {
    expect(isolineCredits("420")).toBe(2); // 7 minutes
    expect(isolineCredits("60")).toBe(1);
    expect(isolineCredits(null)).toBe(1);
  });
  it("matches the engine's own estimate, so the UI and the Worker agree", () => {
    expect(estimateCredits("isoline", { range: 600 })).toBe(isolineCredits("600"));
    expect(estimateCredits("isoline", { ranges: [300, 600, 900] })).toBe(isolineCredits("300,600,900"));
  });
});

describe("other proxied APIs", () => {
  it("places: max(1, ceil(features / 20))", () => {
    expect(credits("/v2/places", q(""), { features: [] }, undefined)).toBe(1);
    expect(credits("/v2/places", q(""), { features: new Array(41).fill({}) }, undefined)).toBe(3);
  });
  it("route matrix: max(s, t) * min(s, t, 10)", () => {
    const body = { sources: new Array(3).fill({}), targets: new Array(7).fill({}) };
    expect(credits("/v1/routematrix", q(""), {}, body)).toBe(21);
  });
  it("boundaries: 1 per 20 results, +1 per result with polygons; same as the engine", () => {
    const four = { features: new Array(4).fill({}) };
    expect(credits("/v1/boundaries/part-of", q("lat=10.8&lon=106.7&geometry=geometry_1000"), four, undefined)).toBe(5);
    expect(credits("/v1/boundaries/part-of", q("lat=10.8&lon=106.7"), four, undefined)).toBe(1);
    expect(estimateCredits("boundaries", { results: 4, geometry: "geometry_1000" })).toBe(5);
  });
  it("place details: 1, plus 1 per 5 minutes of an isochrone feature", () => {
    expect(credits("/v2/place-details", q("id=x&features=details,drive_5"), {}, undefined)).toBe(2);
    expect(credits("/v2/place-details", q("id=x&features=details"), {}, undefined)).toBe(1);
  });
  it("geocoding and the rest: 1 credit", () => {
    expect(credits("/v1/geocode/autocomplete", q("text=x"), {}, undefined)).toBe(1);
  });
});

describe("one daily budget for API calls and tiles", () => {
  it("counts a tile as a quarter credit", () => {
    expect(TILE_CREDITS).toBe(0.25);
    expect(spent({ credits: 100, tiles: 400 })).toBe(200);
  });
  it("keeps the default cap under the free plan's 3,000 credits even with the old tile ceiling", () => {
    expect(DEFAULT_DAILY_CAP).toBeLessThan(3000);
    // the reviewer's case: 1,500 API credits + 2,500 tiles = 2,125 credits, now inside ONE cap
    expect(spent({ credits: 1500, tiles: 2500 })).toBe(2125);
  });
  it("blocks API calls when tiles have used the budget", () => {
    const d = checkCaps({ credits: 2000, tiles: 1600, ipCalls: 0 }, { daily: 2400, perIp: 180 });
    expect(d).toEqual({ ok: false, reason: "daily", used: 2400, cap: 2400 });
  });
  it("blocks a visitor at the per-visitor cap while the shared budget is fine", () => {
    const d = checkCaps({ credits: 10, tiles: 0, ipCalls: 180 }, { daily: 2400, perIp: 180 });
    expect(d).toEqual({ ok: false, reason: "visitor", used: 180, cap: 180 });
  });
  it("allows a call under both caps", () => {
    expect(checkCaps({ credits: 2399, tiles: 3, ipCalls: 179 }, { daily: 2400, perIp: 180 })).toEqual({ ok: true });
  });
});
