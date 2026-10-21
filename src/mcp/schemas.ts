/**
 * Per-tool zod input schemas for the 11 Geoapify MCP tools.
 *
 * Verified shapes: research/track1-geopify-deepdive.md §1.1
 * (source: https://apidocs.geoapify.com/docs/mcp/<tool>/).
 * Invalid args fail fast with a readable error — never as a wasted API credit.
 *
 * Hard rule (all tools): no additional properties allowed. Every schema below
 * is `.strict()` so a misspelled or REST-style param (e.g. `text` instead of
 * `query`, `categories` instead of `category`) is rejected client-side before
 * any network call.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

const Lat = z.number().min(-90).max(90);
const Lon = z.number().min(-180).max(180);
const LatLon = z.object({ lat: Lat, lon: Lon }).strict();

/** GeoJSON Geometry object (NOT Feature/FeatureCollection); [lon, lat] order. */
const GeoJsonGeometry = z
  .object({
    type: z.enum(["Point", "LineString", "Polygon", "MultiPolygon"]),
    coordinates: z.array(z.unknown()),
  })
  .strict();

const UnitsKm = z.enum(["kilometers", "meters", "miles"]).optional();

/* ------------------------------------------------------------------ */
/* 1. geocode_address                                                  */
/* ------------------------------------------------------------------ */

export const GeocodeAddressArgs = z
  .object({
    /** Free-text query, 1–1024 chars. NOTE: `query`, NOT `text`. */
    query: z.string().min(1).max(1024),
    limit: z.number().int().min(1).max(10).optional(),
    lang: z.string().length(2).optional(),
    country_codes: z.array(z.string().length(2)).max(10).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* 2. geocode_structured_address                                       */
/* ------------------------------------------------------------------ */

export const GeocodeStructuredAddressArgs = z
  .object({
    name: z.string().min(1).max(1024).optional(),
    street: z.string().min(1).max(1024).optional(),
    housenumber: z.string().min(1).max(1024).optional(),
    postcode: z.string().min(1).max(1024).optional(),
    city: z.string().min(1).max(1024).optional(),
    state: z.string().min(1).max(1024).optional(),
    country: z.string().min(1).max(1024).optional(),
    country_codes: z.array(z.string().length(2)).max(10).optional(),
    limit: z.number().int().min(1).max(10).optional(),
    lang: z.string().length(2).optional(),
  })
  .strict()
  .refine(
    (a) =>
      Boolean(a.name ?? a.street ?? a.postcode ?? a.city ?? a.state ?? a.country),
    { message: "at least one of name|street|postcode|city|state|country is required" },
  );

/* ------------------------------------------------------------------ */
/* 3. reverse_geocode_coordinates                                      */
/* ------------------------------------------------------------------ */

export const ReverseGeocodeCoordinatesArgs = z
  .object({
    lat: Lat,
    lon: Lon,
    limit: z.number().int().min(1).max(10).optional(),
    lang: z.string().length(2).optional(),
    type: z
      .enum([
        "country",
        "state",
        "city",
        "postcode",
        "street",
        "amenity",
        "locality",
        "building",
      ])
      .optional(),
    country_codes: z.array(z.string().length(2)).max(10).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* 4. search_places                                                    */
/* ------------------------------------------------------------------ */

export const SearchPlacesArgs = z
  .object({
    /**
     * Exact category id, e.g. "catering.cafe". NOTE: singular `category`
     * with `lat`/`lon`/`radius_meters` — NOT `categories`+`filter`.
     */
    category: z.string().min(3).max(64),
    lat: Lat,
    lon: Lon,
    /** Omit = nearest without a hard limit. */
    radius_meters: z.number().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    lang: z.string().length(2).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* 5. list_place_categories                                            */
/* ------------------------------------------------------------------ */

/** No required params — empty arguments object. */
export const ListPlaceCategoriesArgs = z.object({}).strict();

/* ------------------------------------------------------------------ */
/* 6. calculate_route                                                  */
/* ------------------------------------------------------------------ */

export const CalculateRouteArgs = z
  .object({
    waypoints: z.array(LatLon).min(2),
    mode: z
      .enum([
        "drive",
        "truck",
        "bus",
        "scooter",
        "motorcycle",
        "bicycle",
        "mountain_bike",
        "road_bike",
        "walk",
        "hike",
        "transit",
        "approximated_transit",
      ])
      .optional(),
    waypoint_mode: z.enum(["stopover", "through_stop", "pass_through"]).optional(),
    type: z.enum(["balanced", "short", "less_maneuvers"]).optional(),
    avoid: z.array(z.enum(["tolls", "ferries", "highways"])).max(3).optional(),
    geometry_scope: z.enum(["none", "route", "legs", "steps"]).optional(),
    geometry_format: z.enum(["geojson", "polyline"]).optional(),
    include_instructions: z.boolean().optional(),
    optimize_stops: z.boolean().optional(),
    units: z.enum(["metric", "imperial"]).optional(),
    lang: z.string().length(2).optional(),
    /** SiteScout default: "approximated" (traffic-aware; see REDTEAM W3.4). */
    traffic: z.enum(["free_flow", "approximated"]).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* 7. calculate_route_matrix                                           */
/* ------------------------------------------------------------------ */

export const CalculateRouteMatrixArgs = z
  .object({
    /**
     * NOTE: array of {lat, lon} objects — NOT {location:[lon,lat]}.
     * Constraint: sources × targets ≤ 1000 (enforced by the server too).
     */
    sources: z.array(LatLon).min(1).max(1000),
    targets: z.array(LatLon).min(1).max(1000).optional(),
    mode: z
      .enum([
        "drive",
        "truck",
        "bus",
        "scooter",
        "motorcycle",
        "bicycle",
        "mountain_bike",
        "road_bike",
        "walk",
        "transit",
      ])
      .optional(),
    type: z.enum(["balanced", "short", "less_maneuvers"]).optional(),
    traffic: z.enum(["free_flow", "approximated"]).optional(),
    avoid: z.array(z.enum(["tolls", "ferries", "highways"])).max(3).optional(),
    units: z.enum(["metric", "imperial"]).optional(),
  })
  .strict()
  .refine(
    (a) => (a.targets?.length ?? a.sources.length) * a.sources.length <= 1000,
    { message: "sources × targets must be ≤ 1000" },
  );

/* ------------------------------------------------------------------ */
/* 8. combine_geometries                                               */
/* ------------------------------------------------------------------ */

export const CombineGeometriesArgs = z
  .object({
    operation: z.enum(["intersection", "difference", "union", "envelope"]),
    geometries: z.array(GeoJsonGeometry).min(1).max(100),
  })
  .strict()
  .refine(
    (a) =>
      a.operation === "envelope" ||
      a.geometries.filter(
        (g) => g.type === "Polygon" || g.type === "MultiPolygon",
      ).length >= 2,
    {
      message:
        "intersection/difference/union require ≥2 Polygon/MultiPolygon inputs",
    },
  );

/* ------------------------------------------------------------------ */
/* 9. evaluate_spatial_relation                                       */
/* ------------------------------------------------------------------ */

export const EvaluateSpatialRelationArgs = z
  .object({
    operation: z.enum([
      "contains",
      "crosses",
      "disjoint",
      "intersects",
      "within",
      "valid",
      "point_on_line",
    ]),
    geometry: GeoJsonGeometry,
    /** Required except for the "valid" operation. */
    other_geometry: GeoJsonGeometry.optional(),
  })
  .strict()
  .refine((a) => a.operation === "valid" || a.other_geometry !== undefined, {
    message: "other_geometry is required for every operation except 'valid'",
  });

/* ------------------------------------------------------------------ */
/* 10. measure_geometry                                                */
/* ------------------------------------------------------------------ */

export const MeasureGeometryArgs = z
  .object({
    operation: z.enum([
      "area",
      "distance",
      "length",
      "bbox",
      "point_to_line_distance",
      "point_to_polygon_distance",
      "nearest_point_on_line",
      "along",
    ]),
    geometry: GeoJsonGeometry,
    other_geometry: GeoJsonGeometry.optional(),
    /** Required for the "along" operation. */
    distance: z.number().optional(),
    units: UnitsKm,
  })
  .strict()
  .refine((a) => a.operation !== "along" || a.distance !== undefined, {
    message: "distance is required for the 'along' operation",
  });

/* ------------------------------------------------------------------ */
/* 11. transform_geometry                                              */
/* ------------------------------------------------------------------ */

export const TransformGeometryArgs = z
  .object({
    /**
     * NOTE: `operation:"buffer"` + `distance` — NOT `operations:[{type:"buffer"}]`.
     */
    operation: z.enum([
      "buffer",
      "simplify",
      "rotate",
      "scale",
      "translate",
      "center",
      "center_mean",
      "center_median",
      "center_of_mass",
    ]),
    geometry: GeoJsonGeometry,
    distance: z.number().optional(),
    /** Distance units; default per Geoapify docs is kilometers. */
    units: UnitsKm,
    steps: z.number().int().min(1).max(128).optional(),
    tolerance: z.number().optional(),
    high_quality: z.boolean().optional(),
    angle: z.number().optional(),
    pivot: z.tuple([z.number(), z.number()]).optional(),
    factor: z.number().optional(),
    origin: z.tuple([z.number(), z.number()]).optional(),
    direction: z.enum(["x", "y", "z"]).optional(),
    z_translation: z.number().optional(),
  })
  .strict()
  .refine(
    (a) =>
      a.operation !== "buffer" ||
      (a.distance !== undefined && a.distance > 0),
    { message: "buffer requires a positive distance" },
  )
  .refine(
    (a) => a.operation !== "translate" || a.distance !== undefined,
    { message: "translate requires a distance" },
  );

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

import type { McpToolName } from "./client.js";

export const TOOL_ARG_SCHEMAS: Record<McpToolName, z.ZodTypeAny> = {
  geocode_address: GeocodeAddressArgs,
  geocode_structured_address: GeocodeStructuredAddressArgs,
  reverse_geocode_coordinates: ReverseGeocodeCoordinatesArgs,
  search_places: SearchPlacesArgs,
  list_place_categories: ListPlaceCategoriesArgs,
  calculate_route: CalculateRouteArgs,
  calculate_route_matrix: CalculateRouteMatrixArgs,
  combine_geometries: CombineGeometriesArgs,
  evaluate_spatial_relation: EvaluateSpatialRelationArgs,
  measure_geometry: MeasureGeometryArgs,
  transform_geometry: TransformGeometryArgs,
};

/** Validate args for a named tool. Throws a readable Error on mismatch. */
export function validateToolArgs(name: McpToolName, args: unknown): unknown {
  const schema = TOOL_ARG_SCHEMAS[name];
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `Invalid args for ${name}: ${parsed.error.issues.length} issue(s); ` +
        `first at "${first.path.join(".") || "(root)"}": ${first.message}. ` +
        `Shapes: research/track1-geopify-deepdive.md §1.1`,
    );
  }
  return parsed.data;
}
