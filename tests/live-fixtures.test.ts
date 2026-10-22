/**
 * Regression tests against REAL Geoapify MCP responses captured on
 * 2026-10-22 (tests/fixtures/live/*.json). v0.1 passed its synthetic tests
 * but returned 0 candidates live because client.ts unwrapped `content` to a
 * bare array and the geometry parser did not know the {type,data} wrapper.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { upstreamError } from "../src/mcp/client.js";
import {
  parseCategoryCatalog,
  parseGeocodeResults,
  parseGeometryResult,
  parseMeasureValue,
  parsePlacesResults,
  parseReverseGeocode,
  parseRouteMatrixDurations,
  parseSpatialRelation,
} from "../src/mcp/results.js";
import { geometryAreaM2, hexRing, haversineM, pointInGeometry } from "../src/geo/grid.js";

const fx = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/live/${name}.json`, import.meta.url), "utf8"));

describe("live MCP fixtures", () => {
  it("geocode_address → Xuân Thuỷ, Phường An Khánh (post-2025 ward name)", () => {
    const pts = parseGeocodeResults(fx("geocode_address"));
    expect(pts.length).toBeGreaterThan(0);
    expect(pts[0].formatted).toContain("Phường An Khánh");
    expect(pts[0].lat).toBeCloseTo(10.8035, 2);
  });

  it("transform_geometry buffer {type:'geojson',data:Feature} → Polygon", () => {
    const g = parseGeometryResult(fx("transform_geometry_buffer"));
    expect(g.type).toBe("Polygon");
    // 0.8 km buffer ≈ π·800² ≈ 2.01 km² (8-step polygon is slightly smaller)
    expect(geometryAreaM2(g)).toBeGreaterThan(1.9e6);
    expect(geometryAreaM2(g)).toBeLessThan(2.05e6);
  });

  it("measure_geometry area {type:'number'} agrees with local area within 1%", () => {
    const server = parseMeasureValue(fx("measure_geometry_area"));
    const local = geometryAreaM2(parseGeometryResult(fx("transform_geometry_buffer")));
    expect(Math.abs(server - local) / server).toBeLessThan(0.01);
  });

  it("evaluate_spatial_relation {type:'boolean'}", () => {
    expect(parseSpatialRelation(fx("evaluate_spatial_relation_contains"))).toBe(true);
  });

  it("search_places → 27 cafés in 800 m around Xuân Thuỷ", () => {
    const hits = parsePlacesResults(fx("search_places_cafe"));
    expect(hits.length).toBe(27);
    expect(hits.every((h) => h.lat !== undefined && h.lon !== undefined)).toBe(true);
  });

  it("400 for an unsupported category is detected as an upstream error", () => {
    const e = upstreamError(fx("search_places_400_bad_category"));
    expect(e?.statusCode).toBe(400);
    expect(e?.message).toContain("list_place_categories");
  });

  it("list_place_categories → catalog contains the categories SiteScout uses", () => {
    const cats = new Set(parseCategoryCatalog(fx("list_place_categories")));
    expect(cats.size).toBeGreaterThan(800);
    for (const c of ["catering.cafe", "office", "sport.fitness", "commercial.clothing", "healthcare.pharmacy", "catering.restaurant"]) {
      expect(cats.has(c)).toBe(true);
    }
    expect(cats.has("commercial.gym")).toBe(false);
  });

  it("calculate_route_matrix → 3×1 durations", () => {
    const m = parseRouteMatrixDurations(fx("calculate_route_matrix"));
    expect(m.length).toBe(3);
    expect(m[0][0]).toBeGreaterThan(600);
  });

  it("reverse_geocode_coordinates → label", () => {
    expect(parseReverseGeocode(fx("reverse_geocode_coordinates"))).toContain("Xuân Thuỷ");
  });
});

describe("grid helpers", () => {
  it("hexRing yields 7 points at the requested spacing", () => {
    const c = { lat: 10.8035, lon: 106.7375 };
    const ring = hexRing(c, 550);
    expect(ring).toHaveLength(7);
    for (const p of ring.slice(1)) expect(haversineM(c, p)).toBeCloseTo(550, -1);
  });
  it("pointInGeometry", () => {
    const g = parseGeometryResult(fx("transform_geometry_buffer"));
    expect(pointInGeometry({ lat: 10.8034834, lon: 106.7375412 }, g)).toBe(true);
    expect(pointInGeometry({ lat: 10.9, lon: 106.9 }, g)).toBe(false);
  });
});
