import { describe, expect, it } from "vitest";
import {
  parseGeocodeResults,
  parseGeometryResult,
  parseMeasureValue,
  parsePlacesResults,
  parseRouteMatrixDurations,
  parseSpatialRelation,
  summarizeToolResult,
} from "../src/mcp/results.js";

/**
 * MCP result parsers — tested against SYNTHETIC fixtures (hand-written below),
 * NOT real Geoapify responses. Fixtures encode the most plausible response
 * shapes (Geoapify REST shapes echoed through structuredContent/content);
 * live verification against the real server is PENDING the API key.
 */

const SYNTHETIC_GEOCODE = {
  structuredContent: {
    results: [
      {
        name: "Xuân Thủy",
        formatted: "Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh, Việt Nam",
        lat: 10.8042,
        lon: 106.7337,
        result_type: "street",
        confidence: 0.9,
      },
      {
        name: "Thảo Điền",
        formatted: "Thảo Điền, Thủ Đức, Hồ Chí Minh, Việt Nam",
        lat: 10.806,
        lon: 106.74,
        result_type: "district",
      },
    ],
  },
};

const SYNTHETIC_GEOCODE_GEOJSON = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        features: [
          {
            properties: { name: "Bến Thành", formatted: "Bến Thành, Hồ Chí Minh", result_type: "amenity" },
            geometry: { type: "Point", coordinates: [106.6989, 10.7725] },
          },
        ],
      }),
    },
  ],
};

const SYNTHETIC_PLACES = {
  structuredContent: {
    results: [
      { name: "Café A", formatted: "1 Xuân Thủy", lat: 10.8042, lon: 106.7337, distance: 120, categories: ["catering.cafe"] },
      { name: "Café B", formatted: "2 Xuân Thủy", lat: 10.805, lon: 106.734, distance: 210, categories: ["catering.cafe"] },
    ],
  },
};

const SYNTHETIC_MATRIX = {
  structuredContent: {
    sources_to_targets: [
      [{ time: 600, distance: 5200 }, { time: 900, distance: 8100 }],
      [{ time: 1200, distance: 10400 }, { time: 700, distance: 6300 }],
    ],
  },
};

const SYNTHETIC_BUFFER = {
  structuredContent: {
    geometry: { type: "Polygon", coordinates: [[[106.7, 10.8]]] },
  },
};

const SYNTHETIC_MEASURE = { structuredContent: { value: 2010619.3 } };
const SYNTHETIC_RELATION = { structuredContent: { result: true } };

describe("parseGeocodeResults", () => {
  it("parses flat results with lat/lon", () => {
    const pts = parseGeocodeResults(SYNTHETIC_GEOCODE);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ lat: 10.8042, lon: 106.7337, resultType: "street" });
  });

  it("parses GeoJSON features embedded in a text content block", () => {
    const pts = parseGeocodeResults(SYNTHETIC_GEOCODE_GEOJSON);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ lat: 10.7725, lon: 106.6989, resultType: "amenity" });
  });

  it("returns [] for empty results (fallback chain continues)", () => {
    expect(parseGeocodeResults({ structuredContent: { results: [] } })).toEqual([]);
  });

  it("throws a descriptive error on an unrecognized shape", () => {
    expect(() => parseGeocodeResults({ structuredContent: { wat: 1 } })).toThrow(/unrecognized/);
  });
});

describe("parsePlacesResults", () => {
  it("extracts name/distance/categories", () => {
    const hits = parsePlacesResults(SYNTHETIC_PLACES);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ name: "Café A", distance: 120, categories: ["catering.cafe"] });
  });
});

describe("parseRouteMatrixDurations", () => {
  it("builds the durations table in seconds", () => {
    expect(parseRouteMatrixDurations(SYNTHETIC_MATRIX)).toEqual([
      [600, 900],
      [1200, 700],
    ]);
  });
});

describe("geometry parsers", () => {
  it("parseGeometryResult extracts the polygon", () => {
    expect(parseGeometryResult(SYNTHETIC_BUFFER)).toMatchObject({ type: "Polygon" });
  });
  it("parseMeasureValue extracts the numeric value", () => {
    expect(parseMeasureValue(SYNTHETIC_MEASURE)).toBeCloseTo(2010619.3, 1);
  });
  it("parseSpatialRelation extracts the boolean", () => {
    expect(parseSpatialRelation(SYNTHETIC_RELATION)).toBe(true);
  });
});

describe("summarizeToolResult", () => {
  it("summarizes geocode and places for the trace", () => {
    expect(summarizeToolResult("geocode_address", SYNTHETIC_GEOCODE)).toMatchObject({
      count: 2,
      resultType: "street",
    });
    expect(summarizeToolResult("search_places", SYNTHETIC_PLACES)).toMatchObject({ count: 2 });
  });

  it("never throws — records parseError instead", () => {
    const s = summarizeToolResult("search_places", { structuredContent: { wat: 1 } });
    expect(s.parseError).toBeDefined();
  });
});
