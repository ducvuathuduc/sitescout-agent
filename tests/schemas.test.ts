import { describe, expect, it } from "vitest";
import { validateToolArgs } from "../src/mcp/schemas.js";

/**
 * Per-tool arg-shape validation: the correction table from
 * research/track1-geopify-deepdive.md §1.1 is enforced client-side.
 * Wrong shapes fail fast — never as a wasted API credit.
 */
describe("validateToolArgs", () => {
  it("accepts the corrected geocode_address shape (query, not text)", () => {
    expect(() =>
      validateToolArgs("geocode_address", { query: "Xuân Thủy, Thảo Điền", lang: "vi", limit: 3 }),
    ).not.toThrow();
  });

  it("rejects the old wrong shape: geocode_address with text", () => {
    expect(() =>
      validateToolArgs("geocode_address", { text: "Xuân Thủy" }),
    ).toThrow(/Invalid args for geocode_address/);
  });

  it("rejects the old wrong shape: search_places with categories+filter", () => {
    expect(() =>
      validateToolArgs("search_places", {
        categories: "catering.cafe",
        filter: "circle:106.7,10.8,1000",
      }),
    ).toThrow(/Invalid args for search_places/);
  });

  it("accepts the corrected search_places shape", () => {
    expect(() =>
      validateToolArgs("search_places", {
        category: "catering.cafe",
        lat: 10.8,
        lon: 106.7,
        radius_meters: 1000,
        limit: 100,
      }),
    ).not.toThrow();
  });

  it("rejects the old wrong shape: transform_geometry with operations[]", () => {
    expect(() =>
      validateToolArgs("transform_geometry", {
        geometry: { type: "Point", coordinates: [106.7, 10.8] },
        operations: [{ type: "buffer", distance: 800 }],
      }),
    ).toThrow(/Invalid args for transform_geometry/);
  });

  it("accepts the corrected transform_geometry shape", () => {
    expect(() =>
      validateToolArgs("transform_geometry", {
        operation: "buffer",
        geometry: { type: "Point", coordinates: [106.7, 10.8] },
        distance: 0.8,
      }),
    ).not.toThrow();
  });

  it("rejects the old wrong shape: route matrix with {location:[lon,lat]}", () => {
    expect(() =>
      validateToolArgs("calculate_route_matrix", {
        sources: [{ location: [106.7, 10.8] }],
      }),
    ).toThrow(/Invalid args for calculate_route_matrix/);
  });

  it("accepts the corrected route-matrix shape and enforces the 1000-cell cap", () => {
    expect(() =>
      validateToolArgs("calculate_route_matrix", {
        sources: [{ lat: 10.8, lon: 106.7 }],
        targets: [{ lat: 10.77, lon: 106.7 }],
        mode: "drive",
        traffic: "approximated",
      }),
    ).not.toThrow();
    const big = Array.from({ length: 40 }, (_, i) => ({ lat: 10 + i * 0.01, lon: 106.7 }));
    expect(() =>
      validateToolArgs("calculate_route_matrix", { sources: big, targets: big }),
    ).toThrow(/≤ 1000/);
  });

  it("list_place_categories takes an empty object only", () => {
    expect(() => validateToolArgs("list_place_categories", {})).not.toThrow();
    expect(() => validateToolArgs("list_place_categories", { foo: 1 })).toThrow();
  });

  it("evaluate_spatial_relation requires other_geometry except for valid", () => {
    const point = { type: "Point", coordinates: [106.7, 10.8] };
    expect(() =>
      validateToolArgs("evaluate_spatial_relation", { operation: "valid", geometry: point }),
    ).not.toThrow();
    expect(() =>
      validateToolArgs("evaluate_spatial_relation", { operation: "contains", geometry: point }),
    ).toThrow(/other_geometry/);
  });

  it("rejects unknown tools at the type level via the registry", () => {
    expect(() =>
      validateToolArgs("calculate_isochrone" as never, {}),
    ).toThrow();
  });
});
