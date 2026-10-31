# Geoapify MCP reference

Checked 2026-10-31 unless a row says otherwise. This page replaces the internal planning notes that lived in `research/`, which the repo no longer contains.

The code is the source of truth for SiteScout's behavior:

- Argument shapes: `src/mcp/schemas.ts`.
- Credit estimates: `src/agent/budget.ts`.

Where the official docs and the code differ, this page says so.

## Status of the checks

- **Tool count.** The MCP product page (https://www.geoapify.com/mcp/) and the tool index (https://apidocs.geoapify.com/assets/openapi/specs/mcp/tools/index.json) list 12 tools on 2026-10-31; the docs page (https://apidocs.geoapify.com/docs/mcp/) still says "eleven tools". The extra one is `get_timezone` (Timezone API). Our recorded `tools/list` of 2026-10-22 had 11. SiteScout uses those 11; `get_timezone` is not in `src/mcp/schemas.ts`, and the agent never calls it.
- **Unauthenticated calls, observed 2026-10-20.** REST and MCP both return HTTP 401 with `{"statusCode":401,"error":"Unauthorized","message":"Invalid apiKey"}` for an invalid key.
- **Live tool calls.** Real responses recorded on 2026-10-22 are in `tests/fixtures/live/` (for example `search_places_cafe.json`, `geocode_address.json`, `transform_geometry_buffer.json`, and the `tools/list` reply). `tests/live-fixtures.test.ts` parses them. The argument shapes below come from the official schemas and the zod code.

## Endpoint and protocol

- Default endpoint: `https://api.geoapify.com/v1/mcp`.
- EU processing endpoint: `https://api-eu.geoapify.com/v1/mcp`.
- Auth: `x-api-key` header.
- Protocol version: `2025-06-18`.
- Call order: `initialize`, then `notifications/initialized` (HTTP 202, no body), then `tools/list`, then `tools/call`.
- HTTP 200 does not mean success. Validation and execution errors return `result.isError: true`. Auth failures return HTTP 401. Quota and rate limit errors return HTTP 429.

Source: https://www.geoapify.com/mcp/ (Responses and Errors).

## Tool argument shapes

Rules for every tool:

- No extra properties. Each SiteScout schema is strict, so a REST-style parameter fails before any network call.
- Geometry inputs are GeoJSON Geometry objects, not Feature or FeatureCollection objects. Coordinates are `[longitude, latitude]`.

| Tool | Required | Main optional |
| --- | --- | --- |
| `geocode_address` | `query` (1 to 1024 chars) | `limit` (1 to 10), `lang` (2 letters), `country_codes` (max 10) |
| `geocode_structured_address` | at least one of `name`, `street`, `postcode`, `city`, `state`, `country` | `housenumber`, `limit`, `lang`, `country_codes` |
| `reverse_geocode_coordinates` | `lat`, `lon` | `limit` (1 to 10), `lang`, `type`, `country_codes` |
| `search_places` | `category`, `lat`, `lon` | `radius_meters` (at least 1), `limit` (1 to 100), `lang` |
| `list_place_categories` | none (empty object) | none |
| `calculate_route` | `waypoints` (at least 2 `{lat, lon}`) | `mode`, `waypoint_mode`, `type`, `avoid` (max 3 of `tolls`, `ferries`, `highways`), `geometry_scope`, `geometry_format`, `include_instructions`, `optimize_stops`, `units`, `lang`, `traffic` |
| `calculate_route_matrix` | `sources` (1 to 1000 `{lat, lon}`) | `targets`, `mode`, `type`, `traffic`, `avoid`, `units`. `sources` × `targets` must be at most 1000 |
| `combine_geometries` | `operation` (`intersection`, `difference`, `union`, `envelope`), `geometries` (1 to 100) | intersection, difference and union need at least 2 Polygon or MultiPolygon inputs |
| `evaluate_spatial_relation` | `operation`, `geometry` | `other_geometry` (required for every operation except `valid`) |
| `measure_geometry` | `operation`, `geometry` | `other_geometry`, `distance` (required for `along`), `units` |
| `transform_geometry` | `operation`, `geometry` | `distance` (required for `buffer` and `translate`), `units`, `steps`, `tolerance`, `high_quality`, `angle`, `pivot`, `factor`, `origin`, `direction`, `z_translation` |

Notes from the code:

- `calculate_route` accepts these modes: `drive`, `truck`, `bus`, `scooter`, `motorcycle`, `bicycle`, `mountain_bike`, `road_bike`, `walk`, `hike`, `transit`, `approximated_transit`.
- `calculate_route_matrix` accepts 10 modes, and `hike` and `approximated_transit` are not among them.
- The zod schema does not check that `housenumber` comes with `street`. The official docs say the two must be used together (research notes, 2026-10-20).
- The MCP server has no isochrone or isodistance tool. Isoline exists only as the REST endpoint `/v1/isoline`. In the `sitescout ask` pipeline, SiteScout approximates catchments with a `transform_geometry` buffer, then `measure_geometry` and `evaluate_spatial_relation`, and labels them as approximations. The product path uses the REST isoline instead ([mcp.md](mcp.md)).

Shapes the client rejects before a call, with the correct form:

| Wrong (REST style or old draft) | Correct |
| --- | --- |
| `geocode_address({ text })` | `geocode_address({ query })` |
| `search_places({ categories, filter })` | `search_places({ category, lat, lon, radius_meters })` |
| `transform_geometry({ operations: [{ type: "buffer" }] })` | `transform_geometry({ operation: "buffer", distance })` |
| `calculate_route_matrix({ sources: [{ location: [lon, lat] }] })` | `calculate_route_matrix({ sources: [{ lat, lon }] })` |

## Credit rules

Source of truth: `estimateCall` and `settleActual` in `src/agent/budget.ts`. The estimate is made before each call. For `search_places`, the actual cost is settled from the number of results returned.

| Tool | Credits in code | Official rule |
| --- | --- | --- |
| `geocode_address`, `geocode_structured_address`, `reverse_geocode_coordinates` | 1 per call | `max(1, ceil(features / 20))` (https://apidocs.geoapify.com/docs/mcp/, Pricing, read 2026-10-31). SiteScout asks for at most 3 results, so this is 1 |
| `search_places` | estimate `max(1, ceil(limit / 20))`, where `limit` defaults to 20. Settled as `max(1, ceil(results / 20))` | 1 credit per up to 20 returned places (https://www.geoapify.com/mcp/, read 2026-10-31) |
| `calculate_route` | `max(1, waypoints - 1) + number of avoid entries` | 1 per waypoint pair, plus 1 per avoid toggle, plus `floor(route_distance_meters / 500000)` (https://apidocs.geoapify.com/docs/routing/, read 2026-10-31) |
| `calculate_route_matrix` | `max(sources, targets) × min(sources, targets, 10)` | Same formula (https://www.geoapify.com/route-matrix-api/, read 2026-10-31). Examples: 5 × 7 = 35, 300 × 500 = 5000 |
| `list_place_categories` | 0 | "costs zero credits" (https://www.geoapify.com/mcp/, read 2026-10-31) |
| `combine_geometries`, `evaluate_spatial_relation`, `measure_geometry`, `transform_geometry` | 1 per call | "Geometry operation pricing, 1 call costs 1 credit" (https://apidocs.geoapify.com/docs/mcp/, Pricing, read 2026-10-31). The product page only says the MCP server adds no charge of its own. Until 2026-10-31 the code counted these as 0. |
| Any other tool | 1 | Conservative fallback in code |

Where the code and the official routing rules differ:

- The code does not model the long-distance surcharge, `floor(route_distance_meters / 500000)`. It only matters for routes of 500 km or more. Inside a city, the surcharge is 0.
- The code does not model `route_details`, `elevation`, or `optimize_stops` extra cost. `budget.ts` assumes SiteScout does not use these. The zod schema still accepts `optimize_stops`, so a call that sets it is underestimated.

Quota and planning:

- The free plan gives 3,000 credits per day and up to 5 requests per second (https://www.geoapify.com/pricing/, read 2026-10-20).
- The plan quota belongs to the Geoapify account. A second key on the same account draws from the same daily quota (Geoapify pricing FAQ, as cited in the 2026-10-20 notes).
- The 2026-10-20 notes estimated about 100 credits per research question. This is a planning estimate, not a measured figure.
- `sitescout ask --budget N` stops planning before the estimated total would exceed N credits.

## Sources

- https://www.geoapify.com/mcp/ (read 2026-10-31)
- https://apidocs.geoapify.com/docs/mcp/ (tool pages, read 2026-10-20)
- https://apidocs.geoapify.com/docs/routing/ (read 2026-10-31)
- https://www.geoapify.com/route-matrix-api/ (read 2026-10-31)
- https://www.geoapify.com/geocoding-api/ (read 2026-10-20)
- https://www.geoapify.com/pricing/ (read 2026-10-20)
