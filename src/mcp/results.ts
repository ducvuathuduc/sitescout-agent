/**
 * Defensive parsers for Geoapify MCP tool-call responses.
 *
 * An MCP `tools/call` result carries `{ content: [...], structuredContent?, isError? }`.
 * Shapes verified against the live server on 2026-10-22: every tool returns a
 * JSON text block AND `structuredContent` (tools/list publishes an
 * outputSchema per tool). Geometry tools wrap results as
 * `{type: "geojson"|"number"|"boolean", data}`. Parsers fail with a
 * descriptive error — never an invented value — when nothing matches.
 *
 * Unit tests use REAL captured responses (tests/fixtures/live/*.json).
 */
import type { ToolCallResult } from "./client.js";

/** Raw JSON payload behind a tools/call result (content blocks + structured). */
interface RawResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
}

/** Get the first text block, parsed as JSON when possible. */
function textJson(raw: unknown): unknown | undefined {
  const r = raw as RawResult;
  const text = r.content?.find((b) => typeof b?.text === "string")?.text;
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Candidate objects that might hold the payload, in priority order. */
function payloads(result: unknown): unknown[] {
  const r = result as RawResult;
  const out: unknown[] = [];
  if (r.structuredContent !== undefined) out.push(r.structuredContent);
  const tj = textJson(r);
  if (tj !== undefined) out.push(tj);
  out.push(result);
  return out;
}

function asArray(x: unknown): unknown[] | undefined {
  return Array.isArray(x) ? x : undefined;
}

function num(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function str(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

/* ------------------------------------------------------------------ */
/* Geocoding                                                           */
/* ------------------------------------------------------------------ */

export interface GeocodedPoint {
  name?: string;
  formatted?: string;
  lat: number;
  lon: number;
  resultType?: string;
  confidence?: number;
}

function pointFromFeature(f: unknown): GeocodedPoint | undefined {
  const o = f as Record<string, unknown>;
  const p = (o.properties ?? o) as Record<string, unknown>;
  // GeoJSON feature shape: geometry.coordinates = [lon, lat]
  const geom = o.geometry as { coordinates?: unknown } | undefined;
  const coords = asArray(geom?.coordinates);
  let lat = num(p.lat);
  let lon = num(p.lon);
  if ((lat === undefined || lon === undefined) && coords && coords.length >= 2) {
    lon = num(coords[0]);
    lat = num(coords[1]);
  }
  if (lat === undefined || lon === undefined) return undefined;
  return {
    name: str(p.name),
    formatted: str(p.formatted),
    lat,
    lon,
    resultType: str(p.result_type) ?? str(p.resultType),
    confidence: num(p.confidence),
  };
}

/** Extract geocoded points from a geocode_address / geocode_structured_address result. */
export function parseGeocodeResults(raw: unknown): GeocodedPoint[] {
  for (const payload of payloads(raw)) {
    const o = payload as Record<string, unknown>;
    const list = asArray(o.results) ?? asArray(o.features);
    if (list) {
      const pts = list
        .map(pointFromFeature)
        .filter((p): p is GeocodedPoint => p !== undefined);
      return pts;
    }
  }
  throw new Error(
    "parseGeocodeResults: unrecognized response shape (no results/features array). " +
      "Verify against live tools/list output — see research/smoke step 00.",
  );
}

/** Extract a human-readable label from reverse_geocode_coordinates. */
export function parseReverseGeocode(raw: unknown): string {
  const pts = (() => {
    try {
      return parseGeocodeResults(raw);
    } catch {
      return [];
    }
  })();
  if (pts.length > 0) return pts[0].formatted ?? pts[0].name ?? "unknown location";
  throw new Error("parseReverseGeocode: no label found in response");
}

/* ------------------------------------------------------------------ */
/* Places                                                              */
/* ------------------------------------------------------------------ */

export interface PlaceHit {
  name?: string;
  formatted?: string;
  lat?: number;
  lon?: number;
  distance?: number;
  categories?: string[];
}

function placeFromItem(item: unknown): PlaceHit {
  const o = item as Record<string, unknown>;
  const p = (o.properties ?? o) as Record<string, unknown>;
  const geom = o.geometry as { coordinates?: unknown } | undefined;
  const coords = asArray(geom?.coordinates);
  return {
    name: str(p.name),
    formatted: str(p.formatted),
    lat: num(p.lat) ?? (coords ? num(coords[1]) : undefined),
    lon: num(p.lon) ?? (coords ? num(coords[0]) : undefined),
    distance: num(p.distance),
    categories: asArray(p.categories)?.filter(
      (c): c is string => typeof c === "string",
    ),
  };
}

/** Extract place hits from a search_places result. */
export function parsePlacesResults(raw: unknown): PlaceHit[] {
  for (const payload of payloads(raw)) {
    const o = payload as Record<string, unknown>;
    const list = asArray(o.results) ?? asArray(o.features);
    if (list) return list.map(placeFromItem);
  }
  throw new Error(
    "parsePlacesResults: unrecognized response shape (no results/features array).",
  );
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Route matrix as durations[si][ti] in seconds.
 * Tries sources_to_targets (REST shape) and common variants.
 */
export function parseRouteMatrixDurations(raw: unknown): number[][] {
  for (const payload of payloads(raw)) {
    const o = payload as Record<string, unknown>;
    const table =
      asArray(o.sources_to_targets) ??
      asArray(o.sourcesToTargets) ??
      asArray(o.durations);
    if (table) {
      return table.map((row) =>
        (asArray(row) ?? []).map((cell) => {
          const c = cell as Record<string, unknown>;
          const t = num(c.time) ?? num(c.duration) ?? num(cell);
          return t ?? NaN;
        }),
      );
    }
  }
  throw new Error(
    "parseRouteMatrixDurations: unrecognized response shape " +
      "(expected sources_to_targets table).",
  );
}

/** Route summary from calculate_route: total time (s) and distance (m). */
export function parseRouteSummary(raw: unknown): { timeS?: number; distanceM?: number } {
  for (const payload of payloads(raw)) {
    const o = payload as Record<string, unknown>;
    const t = num(o.time) ?? num((o.properties as Record<string, unknown> | undefined)?.time);
    const d =
      num(o.distance) ??
      num((o.properties as Record<string, unknown> | undefined)?.distance);
    if (t !== undefined || d !== undefined) return { timeS: t, distanceM: d };
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Extract a GeoJSON geometry from a transform_geometry / combine_geometries result. */
export function parseGeometryResult(raw: unknown): {
  type: string;
  coordinates: unknown;
} {
  for (const payload of payloads(raw)) {
    let o = payload as Record<string, unknown>;
    // Live shape (verified 2026-10-22): {type:"geojson", data: Feature|Geometry}
    if (o && o.type === "geojson" && o.data && typeof o.data === "object") {
      o = o.data as Record<string, unknown>;
    }
    const g = (o.geometry ?? o) as Record<string, unknown>;
    if (typeof g.type === "string" && g.coordinates !== undefined) {
      return { type: g.type, coordinates: g.coordinates };
    }
  }
  throw new Error(
    "parseGeometryResult: no GeoJSON geometry found in response.",
  );
}

/** Extract a numeric measure (e.g. area in m²) from measure_geometry. */
export function parseMeasureValue(raw: unknown): number {
  for (const payload of payloads(raw)) {
    const o = payload as Record<string, unknown>;
    // Live shape (verified 2026-10-22): {type:"number", data: 1997724.89}
    const v =
      (o?.type === "number" ? num(o.data) : undefined) ??
      num(o.value) ?? num(o.area) ?? num(o.result) ?? num(payload);
    if (v !== undefined) return v;
  }
  throw new Error("parseMeasureValue: no numeric value found in response.");
}

/** Extract a boolean from evaluate_spatial_relation. */
export function parseSpatialRelation(raw: unknown): boolean {
  for (const payload of payloads(raw)) {
    const o = payload as Record<string, unknown>;
    // Live shape (verified 2026-10-22): {type:"boolean", data: true}
    if (o?.type === "boolean" && typeof o.data === "boolean") return o.data;
    if (typeof o.result === "boolean") return o.result;
    if (typeof o.value === "boolean") return o.value;
    if (typeof payload === "boolean") return payload;
  }
  throw new Error("parseSpatialRelation: no boolean result found in response.");
}

/** Category list from list_place_categories ({count, categories:[...]}). */
export function parseCategoryCatalog(raw: unknown): string[] {
  for (const payload of payloads(raw)) {
    const cats = asArray((payload as Record<string, unknown> | undefined)?.categories);
    if (cats) return cats.filter((c): c is string => typeof c === "string");
  }
  return [];
}

/** Human-readable summary for the trace's resultSummary field. */
export function summarizeToolResult(tool: string, raw: unknown): Record<string, unknown> {
  try {
    switch (tool) {
      case "geocode_address":
      case "geocode_structured_address": {
        const pts = parseGeocodeResults(raw);
        return {
          count: pts.length,
          top: pts[0]?.formatted ?? pts[0]?.name ?? null,
          resultType: pts[0]?.resultType ?? null,
        };
      }
      case "search_places": {
        const hits = parsePlacesResults(raw);
        return { count: hits.length };
      }
      case "calculate_route_matrix": {
        const m = parseRouteMatrixDurations(raw);
        return { sources: m.length, targets: m[0]?.length ?? 0 };
      }
      case "transform_geometry":
      case "combine_geometries": {
        const g = parseGeometryResult(raw);
        return { geometryType: g.type };
      }
      case "measure_geometry":
        return { value: parseMeasureValue(raw) };
      case "evaluate_spatial_relation":
        return { result: parseSpatialRelation(raw) };
      case "reverse_geocode_coordinates":
        return { label: parseReverseGeocode(raw) };
      case "list_place_categories":
        return { count: parseCategoryCatalog(raw).length };
      case "calculate_route":
        return parseRouteSummary(raw);
      default:
        return {};
    }
  } catch (e) {
    return { parseError: e instanceof Error ? e.message : String(e) };
  }
}

export type { ToolCallResult };
