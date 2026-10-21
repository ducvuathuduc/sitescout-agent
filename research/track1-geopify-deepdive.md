# Track 1 — Geoapify deep-dive (Track 1 research output)

**Date:** 2026-10-20 · **Author:** Track 1 (research) · **Status:** complete except live-key items (marked)
**Scope:** Geoapify MCP Server (11 tools), relevant REST APIs + OpenAPI specs, pricing/rate limits,
unauthenticated smoke evidence, Vietnam data-quality test plan, signup blocker.

> No data below is fabricated. Every numbered fact cites its source URL. Anything not yet
> observed is explicitly labeled PENDING (needs API key).

---

## 1. Geoapify MCP Server — the 11 tools (verified against apidocs)

- MCP docs hub: https://apidocs.geoapify.com/mcp/ (page updated 2026-10-16T13:00:48.280Z)
- Marketing/overview: https://www.geoapify.com/mcp/
- Endpoint (default): `https://api.geoapify.com/v1/mcp`
- Endpoint (EU processing): `https://api-eu.geoapify.com/v1/mcp`
- Auth: `x-api-key` HTTP header (Geoapify API key). MCP protocol version `2025-06-18`
  (optional `MCP-Protocol-Version` header; unsupported versions rejected).
- Flow: `POST` JSON-RPC → `initialize` → `notifications/initialized` (HTTP 202, no body) →
  `tools/list` → `tools/call`.
- Error model: **HTTP 200 does NOT mean success** — tool validation/execution failures return
  `result.isError: true`. Auth failures → HTTP 401; quota/rate → HTTP 429.
  (Source: https://www.geoapify.com/mcp/ § Responses and Errors)
- No MCP surcharge: "Usage is counted only for the underlying Geoapify Maps API requests.
  The MCP server does not add separate charges, extra credits, or additional rate limits."
  (Source: https://www.geoapify.com/mcp/ § FAQ "Does the MCP server cost extra?")
- `list_place_categories` costs **zero credits** (requires API key). (Source: same page)

### 1.1 Tool-by-tool input schemas

| # | Tool | Required params | Optional params | Source |
|---|------|-----------------|-----------------|--------|
| 1 | `geocode_address` | `query` (string, 1–1024 chars) | `limit` (1–10, default 5), `lang` (2-letter, default `en`), `country_codes` (ISO alpha-2, ≤10) | https://apidocs.geoapify.com/docs/mcp/geocode-address/ |
| 2 | `geocode_structured_address` | *at least one of* `name`, `street`, `postcode`, `city`, `state`, `country` (each 1–1024 chars); `housenumber` must pair with `street` | `country_codes`, `limit` (1–10, default 5), `lang` (default `en`) | https://apidocs.geoapify.com/docs/mcp/geocode-structured-address/ |
| 3 | `reverse_geocode_coordinates` | `lat` (−90…90), `lon` (−180…180) | `limit` (1–10, default 1), `lang` (default `en`), `type` (`country\|state\|city\|postcode\|street\|amenity\|locality\|building`), `country_codes` | https://apidocs.geoapify.com/docs/mcp/reverse-geocode/ |
| 4 | `search_places` | `category` (3–64 chars, exact category id e.g. `catering.restaurant`), `lat`, `lon` | `radius_meters` (≥1; omit = nearest without hard limit), `limit` (1–100, default 20), `lang` (default `en`) | https://apidocs.geoapify.com/docs/mcp/search-places/ |
| 5 | `list_place_categories` | *(none — empty arguments object)* | — | https://apidocs.geoapify.com/docs/mcp/list-place-categories/ |
| 6 | `calculate_route` | `waypoints` (array of `{lat, lon}`, ≥2) | `mode` (default `drive`; 17 modes incl. `drive, truck, bus, scooter, motorcycle, bicycle, mountain_bike, road_bike, walk, hike, transit, approximated_transit`), `waypoint_mode` (`stopover\|through_stop\|pass_through`), `type` (`balanced\|short\|less_maneuvers`), `avoid` (≤3 of `tolls, ferries, highways`), `geometry_scope` (`none\|route\|legs\|steps`), `geometry_format` (`geojson\|polyline`), `include_instructions`, `optimize_stops`, `units` (`metric\|imperial`), `lang`, `traffic` (`free_flow\|approximated`) | https://apidocs.geoapify.com/docs/mcp/calculate-route/ |
| 7 | `calculate_route_matrix` | `sources` (1–1000 `{lat, lon}`) | `targets` (default = sources), `mode` (10 modes), `type`, `traffic`, `avoid`, `units`; **sources × targets ≤ 1000** | https://apidocs.geoapify.com/docs/mcp/calculate-route-matrix/ |
| 8 | `combine_geometries` | `operation` (`intersection\|difference\|union\|envelope`), `geometries` (1–100 GeoJSON geometries; intersection/difference/union need ≥2 Polygon/MultiPolygon) | — | https://apidocs.geoapify.com/docs/mcp/combine-geometries/ |
| 9 | `evaluate_spatial_relation` | `operation` (`contains\|crosses\|disjoint\|intersects\|within\|valid\|point_on_line`), `geometry` | `other_geometry` (required except for `valid`; Point+LineString for `point_on_line`) | https://apidocs.geoapify.com/docs/mcp/evaluate-spatial-relation/ |
| 10 | `measure_geometry` | `operation` (`area\|distance\|length\|bbox\|point_to_line_distance\|point_to_polygon_distance\|nearest_point_on_line\|along`), `geometry` | `other_geometry` (distance/point-to-*/nearest ops), `distance` (for `along`), `units` (default `kilometers`; area always m²), `recompute` (bbox) | https://apidocs.geoapify.com/docs/mcp/measure-geometry/ |
| 11 | `transform_geometry` | `operation` (`buffer\|simplify\|rotate\|scale\|translate\|center\|center_mean\|center_median\|center_of_mass`), `geometry` | `distance` (buffer/translate), `units` (default km), `steps` (buffer, 1–128), `tolerance`+`high_quality` (simplify), `angle`+`pivot` (rotate), `factor`+`origin` (scale), `direction`+`z_translation` (translate) | https://apidocs.geoapify.com/docs/mcp/transform-geometry/ |

Schema rules (all tools): **no additional properties allowed** — REST params must not be copied
into tool calls. Geometry tools take GeoJSON **Geometry objects** (not Feature/FeatureCollection);
coordinates are `[longitude, latitude]`. (Source: https://www.geoapify.com/mcp/ § Geometry Inputs)

⚠️ **Correction note for `research/smoke/smoke.sh` (sibling track):** its argument shapes are
best-effort and deviate from the verified schemas above — `geocode_address` uses `text` (should be
`query`); `search_places` uses `categories`+`filter` (should be `category`+`lat`+`lon`+`radius_meters`);
`transform_geometry` uses `operations:[{type:buffer…}]` (should be `operation:"buffer"`+`distance`);
`calculate_route_matrix` uses `sources:[{location:[lon,lat]}]` (should be `sources:[{lat, lon}]`).
The sibling README already flags these as "best-effort until validated against a live key"; the table
above is the correction source. (Build agent: fix before first live run.)

### 1.2 Tool ↔ underlying REST API mapping (for credit accounting)

Per https://www.geoapify.com/mcp/ § API Credits and Rate Limits + FAQ:
- `geocode_address`, `geocode_structured_address` → Geocoding API
- `reverse_geocode_coordinates` → Reverse Geocoding API
- `search_places` → Places API (billed 1 credit per ≤20 places returned; doc example dated 14 Oct 2026)
- `calculate_route` → Routing API
- `calculate_route_matrix` → Route Matrix API
- `combine_geometries`, `evaluate_spatial_relation`, `measure_geometry`, `transform_geometry` →
  local GeoJSON ops (Geometry Operations API family; no per-call REST credit documented for MCP path)

---

## 2. REST APIs + OpenAPI specs relevant to SiteScout

OpenAPI hub (OpenAPI 3.1, JSON, versioned): https://apidocs.geoapify.com/open-api/
Published specs include: Batch, Boundaries, Elevation, Address Autocomplete, Batch Geocoding,
**Forward Geocoding 1.1.2**, **Reverse Geocoding 1.1.2**, Geometry Operations, Geometry, Map Marker.
(Per-API `/openapi/` pages also exist, e.g. https://apidocs.geoapify.com/docs/isolines/isolines/openapi/.)

| API | Key endpoint | Method / notes | Docs |
|-----|--------------|----------------|------|
| Forward Geocoding | `https://api.geoapify.com/v1/geocode/search` | GET, params: `text`, `format=json`, `lang`, `limit`, `apiKey` | https://apidocs.geoapify.com/docs/places/ (hub) · product page https://www.geoapify.com/geocoding-api/ |
| Reverse Geocoding | `https://api.geoapify.com/v1/geocode/reverse` | GET, params: `lat`, `lon`, `format`, `type`, `apiKey` | https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/ |
| Places | `https://api.geoapify.com/v2/places` | GET (`categories`, `filter=circle:lon,lat,r` / `rect:` / `geometry:` / `place:`, `bias=proximity:lon,lat`, `limit` 1–500, `lang`, `name`) or POST (JSON body, `x-api-key` header also accepted; inline GeoJSON polygon/polyline filters) | https://apidocs.geoapify.com/docs/places/ |
| Routing | `https://api.geoapify.com/v1/routing` | GET, `waypoints=lat,lon\|lat,lon`, `mode`, `format=json`, `details=instruction_details\|route_details\|elevation\|admin_areas\|polyline5\|polyline6`, `traffic`, `avoid` | https://apidocs.geoapify.com/docs/routing/ |
| Route Matrix | `https://api.geoapify.com/v1/routematrix` | POST JSON: `{"mode","sources":[{"location":[lon,lat]}],"targets":[…]}`; ≤1000 elements sync (2000 via Batch) | https://www.geoapify.com/route-matrix-api/ |
| **Isoline** | `https://api.geoapify.com/v1/isoline` | GET, `lat`, `lon`, `type=time\|distance`, `mode`, `range` (seconds for time; meters for distance; comma-separated multi-range), `apiKey`. HTTP 200 = GeoJSON FeatureCollection; **HTTP 202 = still computing** (returns `id`; re-fetch by `?id=…` within 24 h). Max 60-min isochrones / 60-km isodistances on paid tiers. | https://apidocs.geoapify.com/docs/isolines/ |

### Isoline is REST-only — the confirmed MCP gap

The MCP tool catalog (11 tools, https://apidocs.geoapify.com/mcp/) contains **no isochrone/isodistance
tool**. The Isoline API exists only as REST (`/v1/isoline`). Consequence for SiteScout's scoring
model: catchments are circular-buffer approximations (`transform_geometry` buffer +
`evaluate_spatial_relation` + `measure_geometry`) — openly approximated, never silently substituted.
Filed as `docs/FEEDBACK.md#1` (program feedback item) and disclosed in every report's limitations.

---

## 3. Pricing, credits, rate limits (official sources)

Pricing page: https://www.geoapify.com/pricing/ · Pricing details per API: linked from each apidocs page.

- **Free plan: 3,000 credits/day**, no credit card. Usable in commercial/production projects within
  quota + attribution (`Powered by Geoapify` link). (https://www.geoapify.com/pricing/ FAQ)
- **1 credit ≈ 1 API request** for simple APIs (Geocoding, Places, Routing baseline).
  (https://www.geoapify.com/pricing/ FAQ "What is one credit?")
- Credit rules per API:
  - Geocoding (forward/reverse): **1 credit = 1 request**; batch geocoding up to 50% cheaper.
    (https://www.geoapify.com/geocoding-api/ § Pricing details)
  - Places: **1 credit per 20 results** (e.g. 115 places = 6 credits); `limit` controls cost.
    (https://apidocs.geoapify.com/docs/places/ § Pricing, updated 2026-10-15)
  - Routing: **1 credit per waypoint pair** baseline; each `avoid` toggle +1; `route_details` +1/pair;
    `elevation` +1/pair; `optimize_stops` with >3 waypoints adds matrix cost; **+1 per 500 km**
    (or part) of route distance. (https://apidocs.geoapify.com/docs/routing/ § Pricing)
  - Route Matrix: `Max(sources, targets) × Min(sources, targets, 10)` credits
    (5×7 = 35; 300×500 = 5000). (https://www.geoapify.com/route-matrix-api/ § How Much Does It Cost?)
  - Isoline: **1 credit per 5 requested minutes** (isochrone; 30 min = 6 credits) or **per 5 km**
    (isodistance; 25 km = 5 credits); fetch-by-id = 1 credit. Free plan caps: **isochrones ≤ 15 min,
    isodistances ≤ 10 km**. (https://apidocs.geoapify.com/docs/isolines/ § Pricing)
- Rate limits (requests/second, per plan):
  - Free: **up to 5 req/s**. Paid: $59 → 12 rps · $109 → 15 rps · $179 → 20 rps · $299 → 25 rps ·
    $609 → 30 rps · Custom (from $860) → unmetered. Geocoding specifically: up to 30 req/s on paid.
    (https://www.geoapify.com/pricing/ · https://www.geoapify.com/geocoding-api/ FAQ)
- **Limits are soft**: "we do not throttle when you go over the limits" generally; sustained
  overage → contact to upgrade; account block only if upgrade emails are ignored.
  (https://www.geoapify.com/pricing/ FAQ)
- MCP adds no surcharge/extra limits (see §1). `list_place_categories` = 0 credits.

**SiteScout budget sketch (free tier, per research question):** geocode seeds (~5) + structured
variants (~3) + reverse checks (~3) ≈ 11 credits; places searches ~5 × (limit 60 → 3 credits) ≈ 15;
route matrices ~4 × (4×4=16) ≈ 64; routing ~10; isoline (REST) 15-min = 3. **≈ 100 credits/question** —
~30 questions/day on the free tier, comfortably inside 3,000/day. Credit budgeting is tracked and
printed per question (see ARCHITECTURE.md § credit budgeting).

---

## 4. Smoke tests — status

### 4.1 Unauthenticated behavior (REAL, observed 2026-10-20)

| Call | Result |
|------|--------|
| `GET /v1/geocode/search?text=Berlin&format=json&apiKey=INVALID_KEY_SMOKE_TEST` | **HTTP 401** — `{"statusCode":401,"error":"Unauthorized","message":"Invalid apiKey"}` → saved as `research/smoke/01-unauthenticated-401.json` |
| `POST /v1/mcp` (initialize, no `x-api-key`) | **HTTP 401** — `{"statusCode":401,"error":"Unauthorized","message":"Invalid apiKey"}` → saved as `research/smoke/02-mcp-unauthenticated.json` |

Auth contract confirmed: REST uses `apiKey` query param (POST Places also accepts `x-api-key`
header); MCP uses `x-api-key` header only.

### 4.2 Ready-to-run scripts (written, NOT run — no API key)

`research/smoke/archive/` (all executable, `bash -n` clean; each sources `GEOAPIFY_API_KEY` from
`~/workspace/sitescout/.env.local` via `_load_key.sh` and exits 2 with a clear message if missing):

| Script (in `research/smoke/archive/`) | What it does | Source endpoint |
|--------|--------------|-----------------|
| `10-geocode-vn.sh` | Geocodes 3 VN addresses: (1) full diacritics `123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh`; (2) informal `Nhà thờ Đức Bà Sài Gòn`; (3) renamed ward `Phường Sài Gòn, TP. Hồ Chí Minh` — all `lang=vi`, `country_codes=vn` | REST `GET /v1/geocode/search` |
| `20-search-places-thaodien.sh` | `catering.cafe` within 2 km of Thảo Điền (10.8490, 106.7483), limit 20, prints name/formatted/distance/categories | REST `GET /v2/places` |
| `30-route.sh` | Drive Thảo Điền → Bến Thành, prints time/distance/steps | REST `GET /v1/routing` |
| `40-route-matrix.sh` | 2×2 drive matrix (Thảo Điền, Bến Thành → 2 candidate points); notes REST `[lon,lat]` order | REST `POST /v1/routematrix` |
| `50-isoline.sh` | Isoline REST check: 15-min (within free cap) then 30-min (over free cap — observes error shape); notes HTTP 202 possibility | REST `GET /v1/isoline` |
| `60-mcp-tools-call.sh` | Full MCP handshake (initialize → 202 notification → tools/list → tools/call `search_places` café/Thảo Điền), carries `Mcp-Session-Id` | MCP `POST /v1/mcp` |
| `smoke.sh` *(sibling track)* | 3-region MCP runner (HCMC/Hanoi/Da Nang), 8 steps/region — see correction note in §1.1 | MCP `POST /v1/mcp` |

**Not run because:** no API key exists (see §6 blocker). No fabricated results anywhere.

### 4.3 VN data-quality test plan (observations strictly from real results)

Run after the key exists; record findings in `research/smoke/vn-data-quality.md` (sibling track owns
that file; Track 1 defines the observation protocol):

1. **Diacritics fidelity** (`10`, step 1): does `formatted` preserve Vietnamese diacritics?
   With `lang=vi`, are `address_line1/2` in Vietnamese? `result_type` for a street address?
2. **Informal landmark resolution** (`10`, step 2): does `Nhà thờ Đức Bà Sài Gòn` resolve to the
   cathedral (name match in response)? Distance between returned coords and known site (~10.7798, 106.6990)?
3. **2025 ward reorganization** (`10`, step 3): does `Phường Sài Gòn` return a sane ward-level result?
   Does the legacy `Quận 1` query still resolve (districts were abolished 2025-06-30)? **Data-freshness signal.**
   Also test `geocode_structured_address` parity (Sài Gòn ward has no district field anymore).
4. **POI density/completeness** (`20`): count of `catering.cafe` in 2 km; spot-check 5 names against
   known Thảo Điền cafés; `%` with `opening_hours`; `datasource` values (expect openstreetmap).
5. **Routing plausibility** (`30`): ~9 km cross-river drive; is time 20–40 min (HCMC traffic)?
   `approximated` vs `free_flow` delta documents traffic realism.
6. **Matrix↔route consistency** (`40` vs `30`): same OD pair in both — do times agree within ~10%?
7. **Isoline limits** (`50`): does range=1800 on free tier error cleanly (expected: plan-limit error)?
   Does any call return HTTP 202 (async) — and does the `id` re-fetch work within 24 h?
8. **MCP↔REST parity** (`60` vs `20`): same café query via MCP `search_places` vs REST `/v2/places` —
   identical result sets? (Validates the "MCP costs = underlying API" claim empirically.)

**What counts as a "VN data-quality finding":** only deltas observed in real responses —
e.g. "legacy `Quận 1` still resolves (stale admin data)" / "ward `Phường Sài Gòn` returns no
result (index not yet updated)" / "X% of café names are ASCII-folded". Hypotheses are labeled as such.

---

## 5. Program facts (verified, for the submission)

- Program: Geoapify Open Geospatial Program Batch #2 — "AI × Geospatial".
  https://www.geoapify.com/open-geospatial-program/
- Application deadline: **23:59 UTC, 20 October 2026** (applications 1–20 Oct 2026). Apply by email
  to projects@geoapify.com with the full template.
- Rewards: **€300 sponsorship** for selected completed projects; **€500 bonus** best tutorial/article;
  **€500 bonus** best app/agent/workflow; extended API access; promotion via Geoapify channels.
  Payouts within **15 calendar days after final review approval** (SEPA preferred).
- Final review: competitive selection; one formal fix round (≤7 days); public repo (GitHub preferred),
  MIT preferred, runnable + README + tutorial + prompts + Geoapify feedback required.
- Geoapify provides an API key for selected projects (demo key may be committed to the public repo).

---

## 6. ⛔ BLOCKED-FOR-PARENT: Account signup + API key creation

**Blocked item:** Create a Geoapify account at **myprojects.geoapify.com** (signup:
https://myprojects.geoapify.com), create one project, copy the auto-generated API key.

**Why blocked:** interactive web signup is not available to a generic subagent (no live browser,
no form submission). This needs a **live-browser task by the parent**.

**Exact parent steps:**
1. Sign up / sign in at https://myprojects.geoapify.com with **huynhthanh@vtechstudio.tech**.
2. Create one project (name suggestion: `sitescout`).
3. Go to **API Keys**, copy the generated key (one key is auto-generated per project).
4. Store it **only** in `~/workspace/sitescout/.env.local` as `GEOAPIFY_API_KEY=<key>`
   (see `.env.local.example`). **Never print the key in any report, log, or file.**
5. Then run: `cd ~/workspace/sitescout && ./research/smoke/smoke.sh all` and the
   REST scripts under `research/smoke/archive/` (`10-` through `60-*.sh`); fill `research/smoke/vn-data-quality.md`.

**Unblocks:** all live smoke tests, VN data-quality findings, scoring-weight calibration,
`tools/list` schema snapshot, credit-budget validation.

---

## 7. Platform implications (added 20/10 — owner platform directive)

- **Nationwide scope:** the 3-region pattern (HCMC/Hanoi/Da Nang, same question template, same
  scoring model) in the sibling `smoke.sh` is the template for nationwide coverage; `questions.ts`
  per playbook carries region definitions (see ARCHITECTURE.md).
- **VN-GeoBench:** the data-quality protocol (§4.3) is the seed for `bench/vngeobench/`
  (questions + expected tool behavior + scored runs).
- **Visual report:** every future smoke/sample run should also produce the Leaflet visual report
  (`src/report/map.ts`) once real results exist — map evidence makes the data-quality findings
  reviewable at a glance.

## Sources (all URLs verified live 2026-10-20)

- https://www.geoapify.com/mcp/ · https://apidocs.geoapify.com/mcp/
- https://apidocs.geoapify.com/docs/mcp/{geocode-address,geocode-structured-address,reverse-geocode,search-places,list-place-categories,calculate-route,calculate-route-matrix,combine-geometries,evaluate-spatial-relation,measure-geometry,transform-geometry}/
- https://apidocs.geoapify.com/open-api/
- https://apidocs.geoapify.com/docs/places/ · https://apidocs.geoapify.com/docs/routing/
- https://apidocs.geoapify.com/docs/isolines/ · https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/
- https://www.geoapify.com/route-matrix-api/ · https://www.geoapify.com/geocoding-api/
- https://www.geoapify.com/pricing/ · https://www.geoapify.com/open-geospatial-program/
- https://www.geoapify.com/maps-api/ · https://www.mapbox.com/maps (design-spec references, §ARCHITECTURE.md)
