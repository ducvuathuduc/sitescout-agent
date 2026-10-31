import { describe, expect, it } from "vitest";
import { BudgetTracker, estimateCall, settleActual } from "../src/agent/budget.js";

/**
 * Credit budgeting — verified rules from docs/mcp-reference.md#credit-rules.
 */
describe("estimateCall", () => {
  it("geocoding costs 1 credit per call", () => {
    expect(estimateCall("geocode_address", { query: "x" })).toBe(1);
    expect(estimateCall("geocode_structured_address", { city: "x" })).toBe(1);
    expect(estimateCall("reverse_geocode_coordinates", { lat: 10, lon: 106 })).toBe(1);
  });

  it("search_places costs ceil(limit/20)", () => {
    expect(estimateCall("search_places", { category: "catering.cafe", lat: 10, lon: 106, limit: 100 })).toBe(5);
    expect(estimateCall("search_places", { category: "catering.cafe", lat: 10, lon: 106, limit: 50 })).toBe(3);
    expect(estimateCall("search_places", { category: "catering.cafe", lat: 10, lon: 106 })).toBe(1);
  });

  it("route matrix costs max(s,t) × min(s,t,10)", () => {
    const sources = [{ lat: 10, lon: 106 }, { lat: 10.1, lon: 106 }];
    const targets = [{ lat: 10.2, lon: 106 }];
    expect(estimateCall("calculate_route_matrix", { sources, targets })).toBe(2);
    // 5×7 example from the pricing page = 35
    const s5 = Array.from({ length: 5 }, () => ({ lat: 10, lon: 106 }));
    const t7 = Array.from({ length: 7 }, () => ({ lat: 10, lon: 106 }));
    expect(estimateCall("calculate_route_matrix", { sources: s5, targets: t7 })).toBe(35);
  });

  // https://apidocs.geoapify.com/docs/mcp/ "Pricing" (read 2026-10-31): each geometry tool "1 call costs 1 credit";
  // https://www.geoapify.com/mcp/: list_place_categories "costs zero credits".
  it("list_place_categories costs 0; each geometry op costs 1 on the MCP path", () => {
    const point = { type: "Point", coordinates: [106, 10] };
    expect(estimateCall("list_place_categories", {})).toBe(0);
    expect(estimateCall("transform_geometry", { operation: "buffer", geometry: point, distance: 0.8 })).toBe(1);
    expect(estimateCall("measure_geometry", { operation: "area", geometry: point })).toBe(1);
    expect(estimateCall("evaluate_spatial_relation", { operation: "valid", geometry: point })).toBe(1);
    expect(estimateCall("combine_geometries", { operation: "union", geometries: [point, point] })).toBe(1);
  });

  it("calculate_route costs 1 per waypoint pair + avoid toggles", () => {
    expect(
      estimateCall("calculate_route", {
        waypoints: [{ lat: 10, lon: 106 }, { lat: 10.1, lon: 106.1 }],
      }),
    ).toBe(1);
    expect(
      estimateCall("calculate_route", {
        waypoints: [{ lat: 10, lon: 106 }, { lat: 10.1, lon: 106.1 }],
        avoid: ["tolls", "ferries"],
      }),
    ).toBe(3);
  });
});

describe("BudgetTracker", () => {
  it("plans, settles, and reports per-question credits", () => {
    const b = new BudgetTracker();
    b.plan(0, "geocode_address", { query: "x" });
    b.plan(1, "search_places", { category: "catering.cafe", lat: 10, lon: 106, limit: 100 });
    b.settle(0, 1);
    b.settle(1, 4);
    expect(b.estimatedTotal).toBe(6);
    expect(b.actualTotal).toBe(5);
    const report = b.report();
    expect(report).toContain("[T0] geocode_address");
    expect(report).toContain("3,000/day");
  });

  it("aborts planning when the --budget cap would be exceeded", () => {
    const b = new BudgetTracker(2);
    b.plan(0, "geocode_address", { query: "x" });
    expect(() =>
      b.plan(1, "search_places", { category: "catering.cafe", lat: 10, lon: 106, limit: 100 }),
    ).toThrow(/budget exceeded/);
  });

  it("settleActual derives search_places cost from the real result count", () => {
    const result = {
      structuredContent: { results: new Array(45).fill({ name: "cafe" }) },
    };
    expect(
      settleActual("search_places", { category: "catering.cafe", lat: 10, lon: 106, limit: 100 }, result),
    ).toBe(3); // ceil(45/20)
  });
});
