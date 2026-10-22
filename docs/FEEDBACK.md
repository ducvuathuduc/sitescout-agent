# Feedback for Geoapify

Product feedback from building SiteScout on Geoapify (REST APIs in the product path, MCP server for the
legacy pipeline). Every item has a reproduction you can run with any key; numbers come from runs on
**2026-10-22** and the raw data is committed. Format: **observation → impact → reproduction → suggestion**.

What worked very well is listed first, because it shaped the product.

---

## ✅ What worked well

- **Isoline → Places by `filter=geometry:<isoline id>`.** Drawing a 10-minute walk isoline and counting POIs
  *inside it* with the returned id is the core of SiteScout and costs one request per category. No polygon
  upload, no client-side point-in-polygon. This is a genuinely agent-friendly primitive.
- **Agent-readable errors.** An unsupported category returns a 400 whose message tells the caller to call
  `list_place_categories` and pick one. Our MCP host used exactly that to self-correct.
- **New (post-July-2025) ward names are already in the data.** When a query uses the new ward name, the result
  names the expected new ward in 8/8 test addresses (`bench/hcmc-addresses/RESULTS.md`). That is ahead of many
  local data sources.
- **Autocomplete is robust to messy Vietnamese.** It resolved landmark names with diacritics damaged by an LLM
  (`agent/transcripts/01-…jsonl`) and reached 86% top-1 accuracy on 29 formal landmark names.
- **MCP server tools declare `outputSchema`** (11 tools, `tests/fixtures/live/mcp_tools_list_2026-10-22.sse.txt`).

---

## #1 — No isoline tool on the MCP server

- **Observation:** `tools/list` on `https://api.geoapify.com/v1/mcp` returns 11 tools (geocoding ×3, places ×2,
  routing ×2, geometry ×4). None computes a travel-time area. Re-checked 2026-10-22.
- **Impact:** an MCP-only agent has to approximate catchments with circular buffers, which over-count across
  rivers and highways (Thảo Điền ↔ Thủ Thiêm across the Saigon River is the textbook case). This is why
  SiteScout's product path moved to the REST Isoline API.
- **Reproduction:** `curl -X POST https://api.geoapify.com/v1/mcp -H 'x-api-key: KEY' -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'` (after `initialize`).
- **Suggestion:** a `calculate_isoline` tool (mode, type time/distance, range) that returns the isoline id as well,
  so `search_places` can take `filter=geometry:<id>` the way the REST API does.

## #2 — Vietnamese addresses after the July-2025 reform: `city` says "Thành phố Thủ Đức" for central HCMC

- **Observation:** Viet Nam removed the district level on 1 July 2025 (HCMC is now city → ward; Resolution
  1685/NQ-UBTVQH15). In our 55-query benchmark, **56% (search) and 58% (autocomplete) of results** carry
  "Thành phố Thủ Đức" in the label for places that were never in Thủ Đức, e.g.
  `Chợ Bến Thành, Lê Lợi, Phường Bến Thành, Thành phố Thủ Đức, 71009` and
  `Bệnh viện Chợ Rẫy, 201B Đường Nguyễn Chí Thanh, Phường Chợ Lớn, Thành phố Thủ Đức`.
  The ward is correct; the level above it is a stale unit (Thủ Đức city was itself dissolved) and is wrong for
  these locations. Other results for neighbouring buildings say "Thành phố Hồ Chí Minh" instead, so the field is
  inconsistent between neighbouring features.
- **Impact:** apps that print `formatted` show a wrong city to Vietnamese users; apps that group or filter by
  `city`/`county` silently put central HCMC into Thủ Đức. For an agent, "Phường Sài Gòn, Thành phố Thủ Đức" is a
  contradiction it may try to "fix" in the wrong direction.
- **Reproduction:** `bench/hcmc-addresses/run.mjs` (≈4 credits/query), summary in
  `bench/hcmc-addresses/RESULTS.md`; single call:
  `GET /v1/geocode/search?text=Chợ Bến Thành, Thành phố Hồ Chí Minh&lang=vi&filter=countrycode:vn`.
- **Suggestion:** for VN after 2025-07-01 emit `city = Thành phố Hồ Chí Minh` and leave the district level empty
  (or expose the old district as a separate, clearly-named legacy field). We are happy to share the 55-query set
  as a regression test.

## #3 — Pre-2025 numbered wards ("Phường 12, Quận 5") are matched against alley numbers

- **Observation:** most people and many databases still write old addresses. Queries with an old numbered ward
  resolve far worse than the same street address with the new ward name (sitescout v1.0 resolver: 2/8 vs 7/8 within
  300 m; raw `/geocode/search`: 4/8 vs 6/8). The failure mode is specific: the number of an old ward is matched
  to an alley (`hẻm`) number:
  - `201B Nguyễn Chí Thanh, Phường 12, Quận 5` → `175/12 Đường Nguyễn Tri Phương` (1.0 km off)
  - `720A Điện Biên Phủ, Phường 22, Quận Bình Thạnh` → `149/22 Đường Nguyễn Tri Phương` (7.3 km off)
  - `57A Tháp Mười, Phường 2, Quận 6` → `175/2 Đường Nguyễn Tri Phương` (2.1 km off)
- **Impact:** old-format addresses are the norm in existing customer lists, so batch geocoding them gives
  plausible-looking but wrong points.
- **Our workaround (documented, open-source):** drop `Phường <number>`, `Quận …` and `TP Thủ Đức` before calling the
  geocoder and match tokens as whole words. Old-ward accuracy went 25% → 75% with no extra calls
  (`src/engine/scout.ts` `resolvePlace`, test `tests/resolve-place.test.ts`).
- **Suggestion:** treat `Phường \d+` / `Quận \d+` as administrative tokens (never as house or alley numbers), and
  ideally map pre-2025 wards to their successors (the official mapping is public in Resolution 1685).

## #4 — Free-text search on landmark names drifts by kilometres while autocomplete is right

- **Observation:** on 29 well-known HCMC landmarks (reference: Wikidata coordinates), `/v1/geocode/search` was within
  tolerance for 19 (66%) vs **25 (86%) for `/v1/geocode/autocomplete`** with identical text and bias. Typical misses:
  "Bảo tàng Chứng tích chiến tranh" 5.3 km, "Nhà thờ Tân Định" 4.3 km, "Chợ Bà Chiểu" 4.1 km off; the unaccented
  "buu dien thanh pho" returned a point **175 km** away.
- **Impact:** developers reasonably use `search` for "find this place"; for Vietnamese POI names the quieter
  endpoint is the better one, which is not obvious from the docs.
- **Reproduction:** `bench/hcmc-addresses/RESULTS.md` → "Every query" table (per-query distances for both endpoints).
- **Suggestion:** either rank POI name matches higher in `search` for VN, or add a doc note recommending
  autocomplete for POI-name lookups.

## #5 — Places: a comma-separated `categories` list did not behave as a union in our tests

- **Observation (same circle, 800 m around Thảo Điền, `limit=200`):**

  | `categories=` | features |
  |---|---|
  | `catering.cafe` | 26 |
  | `office` | 5 |
  | `catering.cafe,office` | **26** (expected up to 31) |
  | `office.company` | 3 |
  | `office.coworking` | 0 |
  | `office.company,office.coworking` | **0** (expected 3) |

- **Impact:** a multi-category request silently returns fewer places than its parts; counts look plausible, so the
  bug is hard to notice. SiteScout now sends one request per category (`placesMulti`).
- **Reproduction:** `GET /v2/places?categories=office.company,office.coworking&filter=circle:106.7317,10.8040,800&limit=200`.
- **Question:** is this expected (e.g. intersection semantics for some combinations)? If so, a doc line would help.

## #6 — Boundaries: no ward-level polygon at Hàng Xanh (Bình Thạnh)

- **Observation:** `/v1/boundaries/part-of?lat=10.801436&lon=106.7113199` returns only
  `Khu phố 21 (admin_level 9) ⊂ Thành phố Hồ Chí Minh (4) ⊂ Việt Nam (2)`, no ward, while reverse geocoding the same
  point names "Phường Thạnh Mỹ Tây". At Phường Sài Gòn and Phường An Khánh the ward level is present.
- **Impact:** a "within this ward" analysis has no polygon to clip to; SiteScout falls back to a disc and says so in
  the report's limitations.
- **Note:** this may be an OpenStreetMap data gap rather than a Geoapify issue; reporting it so the boundary
  import can be checked.

---

### Reproducing everything

```bash
npm ci && npm run build
export GEOAPIFY_API_KEY=…            # free tier is enough
node bench/hcmc-addresses/run.mjs     # ~230 credits, writes results.jsonl
python3 bench/hcmc-addresses/summarize.py
```
