# Smoke tests — Geoapify MCP, Vietnam nationwide (HCMC · Hanoi · Da Nang)

> ### ⛔ BLOCKED-FOR-PARENT: no Geoapify API key yet
> None of the scripts below have been run. Everything under
> `research/smoke/results/` is **pending**. To unblock:
> 1. Get a key — Geoapify free tier at https://www.geoapify.com/ (or the
>    Open Geospatial Program Batch #2 key once the proposal is selected).
> 2. `export GEOAPIFY_API_KEY=xxx` (or copy `.env.local.example` → `.env.local`).
> 3. From the repo root: `./research/smoke/smoke.sh all`
> 4. Fill in `research/smoke/vn-data-quality.md` from the outputs.
>
> Until then, **do not present any Geoapify result as real** — the README's
> sample outputs are illustrative only and labeled as such.

## What the smoke tests prove

The agent runtime talks to Geoapify **only** through the 11 MCP tools
(`src/mcp/client.ts`). These smoke tests exercise that exact path — raw
JSON-RPC over `https://api.geoapify.com/v1/mcp` with the `x-api-key` header —
so a green smoke run means the runtime's network boundary works, and the
`vn-data-quality.md` comparison tells us how far we can trust Vietnamese
data per region before we calibrate scoring weights.

## The pattern (identical in every region)

| Step | MCP tool | What it validates |
| --- | --- | --- |
| 00 | `tools/list` | Live tool schema snapshot — the arg-shape source of truth |
| 01 | `geocode_address` | Diacritic-heavy formal address → confidence, formatted match |
| 02 | `geocode_address` | Informal / POI-style name → does it resolve at all? |
| 03 | `geocode_structured_address` | Structured variant of step 01 → parity check |
| 04 | `search_places` | `catering.cafe` in a 1 km circle → POI count (comparable across regions) |
| 05 | `list_place_categories` | Taxonomy available for the scoring model |
| 06 | `transform_geometry` | 800 m buffer around candidate → catchment primitive |
| 07 | `calculate_route_matrix` | 2 demand origins → 1 candidate → accessibility primitive |

Step 06 is chained **manually** in this script: take the buffer polygon from
`06-transform-buffer-800m.json` and feed it to `measure_geometry` and
`evaluate_spatial_relation` (with the POIs from step 04) via one-off
`tools/call` payloads — see the worked example below. (The agent runtime
`src/agent/run.ts` automates this chaining in phase 2 of every
`sitescout ask` run; the manual version here is the protocol reference.)

## Regions & test addresses

| Region | Diacritic-heavy (01/03) | Informal (02) | Candidate seed |
| --- | --- | --- | --- |
| HCMC | Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh | Phố đi bộ Bùi Viện, Quận 1 | Thao Dien specialty-coffee |
| Hanoi | Tràng Tiền, Hoàn Kiếm, Hà Nội | Phố bia Tạ Hiện, Hoàn Kiếm | Tay Ho specialty-coffee |
| Da Nang | Bạch Đằng, Hải Châu, Đà Nẵng | Cầu Rồng, Hải Châu | My Khe specialty-coffee |

Seed coordinates in `smoke.sh` are **approximate** — refine from the step-01
geocode output before quoting any number. Using `catering.cafe` + 1 km in all
three regions is deliberate: it makes POI density directly comparable.

Arg shapes in `smoke.sh` follow the **verified** schemas
(`research/track1-geopify-deepdive.md` §1.1): `query` (not `text`),
`category`+`lat`+`lon`+`radius_meters` (not `categories`+`filter`),
`operation:"buffer"`+`distance` (not `operations:[{type…}]`),
`sources:[{lat,lon}]` (not `{location:[lon,lat]}`). Step 00 asserts the live
`tools/list` surface matches before any credit is spent.

## Running

```sh
chmod +x research/smoke/smoke.sh
GEOAPIFY_API_KEY=xxx ./research/smoke/smoke.sh all   # or hcmc | hanoi | danang
```

Results: `research/smoke/results/<region>/NN-<name>.json` (gitignored).
If a tool rejects an argument shape, open `00-tools-list.json` first — it is
the live source of truth and the script aborts when the surface drifts.

## Worked example — chaining step 06 (manual, until the agent automates it)

```sh
# 1. Extract the buffer polygon from step 06 (any JSON viewer works):
#    research/smoke/results/hcmc/06-transform-buffer-800m.json
# 2. Measure its area:
curl -s -X POST https://api.geoapify.com/v1/mcp \
  -H 'content-type: application/json' -H "x-api-key: $GEOAPIFY_API_KEY" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call",
           "params":{"name":"measure_geometry","arguments":{"geometry": <PASTE_POLYGON> }}}'
# 3. Count cafes inside it with evaluate_spatial_relation against step-04 POIs.
```

## After the run

1. Fill `vn-data-quality.md` (per-region findings + comparison matrix).
2. Promote durable findings: data gaps → `docs/FEEDBACK.md`,
   method notes → `docs/tutorial.md`, comparison summary → `RESEARCH.md`.
3. Calibrate `src/scoring/model.ts` weights from real densities
   (replaces the v0 heuristics).
