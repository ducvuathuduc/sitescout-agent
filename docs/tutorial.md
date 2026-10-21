# Tutorial: build an evidence-traced site-selection agent on the Geoapify MCP server

> **Status: full draft (2026-10-20).** All mechanism sections are written from
> the actual codebase; every live-run artifact (terminal captures, screenshots,
> report excerpts) is marked **⏳ PENDING** until a Geoapify API key exists and
> the runs are recorded. Nothing here is fabricated — placeholders say so.
>
> Audience: TypeScript developers who have never touched the Geoapify MCP
> server. Time: ~45 minutes. Outcome: run a real research question and read
> its evidence trace.
>
> Canonical home: this file (`docs/tutorial.md`). Public mirror: ⏳ PENDING
> (dev.to cross-post at launch; this file links it when live).

---

## 0. What you'll build (5 min)

A CLI agent that answers *"Where should I open a specialty coffee shop in
Thảo Điền?"* by chaining Geoapify MCP tools — geocoding → place search →
catchment geometry → route matrix — then scores candidate sites
deterministically and hands you a ranked shortlist where **every number
traces back to the exact API call that produced it**. No black-box answers.
No invented foot traffic. If a claim can't point at a trace entry, it
doesn't ship.

```mermaid
flowchart LR
    Q[Research question<br/>e.g. coffee shop in Thao Dien] --> P[HeuristicPlanner<br/>deterministic, no LLM]
    P -->|JSON-RPC 2.0<br/>x-api-key| M[Geoapify MCP server<br/>11 tools]
    M --> T[Evidence trace<br/>JSONL, one line per call]
    T --> S[Scoring model<br/>offline · deterministic]
    S --> R[Report<br/>Markdown + visual map, every claim → [Tn]]
```

⏳ **PENDING — final report screenshot.** The first real run will produce
`examples/site-selection/thaodien-coffee/report.html` (interactive Leaflet
map + ranked shortlist + evidence-trace side panel). This section shows that
capture when it exists.

**What this tutorial is not:** a hosted demo, a black-box "AI" wrapper, or a
REST-API tutorial in disguise. The agent runtime speaks **only** MCP
(JSON-RPC); there is no REST fallback anywhere in `src/`. The one capability
MCP can't serve — drive-time isochrones — is openly approximated and filed
as [`docs/FEEDBACK.md#1`](FEEDBACK.md#1).

---

## 1. Prerequisites (5 min)

- **Node.js 20+** (`node --version`)
- **A Geoapify API key** — free tier, 3,000 credits/day, no card:
  https://www.geoapify.com/ (⏳ PENDING: author is awaiting key provisioning;
  every run below is reproducible the moment a key exists)
- 45 minutes, a terminal, and a text editor

**The MCP server in one paragraph.** Geoapify exposes its Maps APIs as a
[Model Context Protocol](https://apidocs.geoapify.com/mcp/) server at
`https://api.geoapify.com/v1/mcp`: JSON-RPC 2.0 over HTTPS, authenticated
with an `x-api-key` header. The flow is `initialize` →
`notifications/initialized` → `tools/list` → `tools/call`. Eleven tools —
geocoding, places, routing, and geometry operations — and usage is billed
exactly like the underlying APIs (the MCP server adds no surcharge). One
tool you might expect is **missing**: there is no isochrone tool on MCP
(Isoline is REST-only), which is why this agent's catchments are circular
buffers, disclosed openly.

**The 11 tools and what SiteScout uses each for:**

| Tool | SiteScout job |
| --- | --- |
| `geocode_address` / `geocode_structured_address` | Resolve candidate seeds & demand origins (diacritics-tolerant, with a fallback chain) |
| `reverse_geocode_coordinates` | Human-readable labels for raw coordinates |
| `search_places` | Competitor counts + complementary-POI counts per catchment |
| `list_place_categories` | Taxonomy resolution for the scoring model |
| `calculate_route` / `calculate_route_matrix` | Accessibility: travel times from demand origins |
| `transform_geometry` | Buffer a candidate point → catchment polygon |
| `evaluate_spatial_relation` | Sanity checks (buffer valid, buffer contains candidate) |
| `measure_geometry` | Catchment area → the density denominator |
| `combine_geometries` | (Playbook 3, docs-only) merge catchments when candidates cluster |

---

## 2. Connect: MCP config in 5 minutes

You don't need SiteScout to talk to the Geoapify MCP server — any
MCP-capable client works. Two copy-paste configs:

**Claude Code** — `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "geoapify": {
      "type": "http",
      "url": "https://api.geoapify.com/v1/mcp",
      "headers": { "x-api-key": "YOUR_GEOAPIFY_API_KEY" }
    }
  }
}
```

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "geoapify": {
      "url": "https://api.geoapify.com/v1/mcp",
      "headers": { "x-api-key": "YOUR_GEOAPIFY_API_KEY" }
    }
  }
}
```

> Substitute your key (or wire your secret manager). Verify the exact
> header/transport fields against your client's MCP docs — clients differ.

**Verify the connection.** Ask your assistant to list the Geoapify tools —
you should see exactly the 11 names from the table above.

⏳ **PENDING — screenshots.** Key-scrubbed captures for each client
(config screen with the key field redacted, tool-list response) land in
`docs/client-configs/` during build week 3.

**Troubleshooting (from the real code, `src/mcp/client.ts`):**

| Symptom | Cause | Fix |
| --- | --- | --- |
| HTTP 401 | bad/missing key | re-check `x-api-key`; the client fails fast (no retry) |
| HTTP 429 / 5xx / timeout | rate limit or transient | exponential backoff, 3 attempts, jitter — automatic |
| `result.isError: true` | tool arg validation failed server-side | read the error; the client validates args locally first so this should be rare |
| `Invalid args for <tool>: …` | wrong arg shape | see §3 — the four shapes everyone gets wrong |

---

## 3. The four arg shapes everyone gets wrong (5 min)

Geoapify's MCP schemas are **not** the REST params with different names —
and they reject additional properties. These four mistakes are the ones our
own smoke scripts made before the correction table
(`research/track1-geopify-deepdive.md` §1.1). SiteScout validates all of
them client-side with zod (`src/mcp/schemas.ts`), so a wrong shape fails
fast with a readable error instead of burning a credit.

```ts
// ❌ geocode_address does NOT take "text"
{ "text": "Xuân Thủy, Thảo Điền" }
// ✅
{ "query": "Xuân Thủy, Thảo Điền", "lang": "vi", "limit": 3, "country_codes": ["vn"] }

// ❌ search_places does NOT take categories+filter
{ "categories": "catering.cafe", "filter": "circle:106.7,10.8,1000" }
// ✅ singular category + lat/lon + radius_meters
{ "category": "catering.cafe", "lat": 10.8042, "lon": 106.7337, "radius_meters": 800, "limit": 100 }

// ❌ transform_geometry does NOT take operations:[{type:…}]
{ "operations": [{ "type": "buffer", "distance": 800 }] }
// ✅ operation + distance (units default to kilometers → 0.8 km = 800 m)
{ "operation": "buffer", "geometry": { "type": "Point", "coordinates": [106.7337, 10.8042] }, "distance": 0.8 }

// ❌ route matrix does NOT take {location:[lon,lat]}
{ "sources": [{ "location": [106.6989, 10.7725] }] }
// ✅ {lat, lon} objects; sources × targets ≤ 1000
{ "mode": "drive", "traffic": "approximated",
  "sources": [{ "lat": 10.7725, "lon": 106.6989 }],
  "targets": [{ "lat": 10.8042, "lon": 106.7337 }] }
```

---

## 4. Your first research question (10 min)

```sh
git clone https://github.com/ducvuathuduc/sitescout-agent.git  # ⏳ PENDING: repo created at submission
cd sitescout-agent
cp .env.local.example .env.local   # add your GEOAPIFY_API_KEY
npm install && npm run build
```

One command, one full playbook-1 question, end to end:

```sh
npm run smoke -- --question thaodien-coffee
# (equivalently: npx sitescout ask --question thaodien-coffee --playbook site-selection)
```

What happens, in order:

1. **Plan.** `HeuristicPlanner` emits the phase-1 call sequence — geocode
   each candidate seed and demand origin through the fallback chain
   (canonical → diacritics-folded → 2025 ward-alias expanded), all before
   any network call.
2. **Assert.** The client runs `tools/list` and aborts if the 11-tool
   surface has drifted — no credits spent on a changed API.
3. **Act + trace.** Every `tools/call` is validated (zod), budgeted
   (credits printed per question), executed with retries, and appended to
   `logs/thaodien-coffee.jsonl` — one line per call with a sha256 digest of
   the full result.
4. **Expand.** Per candidate: buffer the catchment (`transform_geometry`),
   measure it (`measure_geometry`), sanity-check it
   (`evaluate_spatial_relation`), sweep competitors + complementary POIs
   (`search_places`), then one route matrix for accessibility
   (`calculate_route_matrix`, `traffic: "approximated"`).
5. **Score.** Pure, deterministic functions over the traced evidence
   (`src/scoring/model.ts`, weights version `0.1.0-heuristic`). Same trace →
   same scores, byte-identical.
6. **Render.** `examples/site-selection/thaodien-coffee/report.md`
   (ranked shortlist, every claim citing `[Tn]`) and `report.html`
   (interactive Leaflet map: catchment polygons, competitor/complementary
   markers, ranked badges, evidence-trace side panel).

⏳ **PENDING — terminal capture.** A real `npm run smoke` transcript lands
here after the key exists. Until then, the report's *shape* is shown in the
README's illustrated walkthrough (labeled illustrative, not real).

**Credit budget for this question:** ≈ 20–40 credits (geocodes ≈ 4,
place sweeps ≈ 14, route matrix ≈ 3, geometry ops 0) — comfortably inside
the free tier's 3,000/day. Every run prints the ledger; `--budget N` aborts
planning before overspend.

---

## 5. Reading the evidence trace (10 min)

Open `logs/thaodien-coffee.jsonl` (⏳ PENDING: generated by the first real
run). Anatomy of one line:

```json
{"seq":7,"ts":"2026-11-02T03:14:22.118Z","questionId":"thaodien-coffee",
 "tool":"search_places",
 "args":{"category":"catering.cafe","lat":10.8042,"lon":106.7337,"radius_meters":800,"limit":100},
 "resultDigest":"sha256:9f2c…","resultSummary":{"rationale":"Competitor sweep (catering.cafe) around \"…\"","count":14},
 "durationMs":341}
```

- `seq` → the `[T7]` citation in the report.
- `resultDigest` → sha256 of the canonicalized full result, cached at
  `research/smoke/results/thaodien-coffee/7.json`. Recompute it yourself to
  verify nothing was edited.
- `resultSummary` → why the call exists + the counts the scorer consumed.

Audit the whole chain without re-calling anything:

```sh
npm run trace:validate -- logs/thaodien-coffee.jsonl   # schema + seq order
npx sitescout report thaodien-coffee                    # re-render from trace (offline)
```

The re-rendered Markdown must be identical to the original — that's the
"reproducible from the trace" guarantee, and it's what makes the scoring
auditable.

---

## 6. Vietnamese addresses: the hard part (5 min)

Three things break naive geocoding in Vietnam; SiteScout handles all three
in `src/geo/vietnam-address.ts` (zero dependencies, tested in
`tests/vietnam-address.test.ts`):

1. **Diacritics.** `fold()` NFD-strips to ASCII for fallback queries
   (`Nguyễn Huệ` → `Nguyen Hue`); `normalize()` keeps diacritics for display.
2. **The 2025 ward reorganization.** Districts were abolished 2025-06-30 and
   wards merged/renamed 2025-07-01. `resolveWardAlias()` maps legacy names
   (`Quận 1` → `Phường Sài Gòn` / `Phường Bến Thành` / …) from a **versioned
   data table** (`ALIASES_VERSION = "2025-07"`). Unknown mappings return
   `unmapped` — never invented.
3. **Informal names.** `candidateQueries()` emits the ordered fallback chain
   the planner executes: canonical → folded → alias-expanded.

⏳ **PENDING — measured results.** `research/smoke/vn-data-quality.md` will
record per-region findings (diacritic fidelity, ward-name resolution,
informal landmarks) from real runs; durable findings graduate to
`docs/FEEDBACK.md`.

---

## 7. Example prompts (5 min)

For the meetup playbook (`npx sitescout ask --question hcmc-meetup --playbook meetup-planning`):

- *"3 friends in Thảo Điền, Bến Thành and Phú Mỹ Hưng — where is the
  fairest café to meet on Saturday afternoon?"* → the agent geocodes all
  three origins, builds the origins×venues route matrix, and picks the
  **min-max** venue: the one that minimizes the *worst* participant's travel
  time. Fairness is stated, not implied.
- Same pattern, Hanoi: `--question hanoi-meetup` (Tây Hồ / Hoàn Kiếm / Mỹ Đình).

For experimentation:

- *"Score a pharmacy site near Mỹ Khê, Da Nang"* →
  `npx sitescout ask --question mykhe-pharmacy`
- *"Where's the fairest restaurant for Tây Hồ, Hoàn Kiếm and Mỹ Đình?"* →
  `npx sitescout ask --question hanoi-meetup --playbook meetup-planning`
- *"Audit the last run"* → `npm run trace:validate -- logs/<question>.jsonl`

⏳ **PENDING:** prompts are verified against real runs when the key exists;
until then they describe intended behavior documented in the playbook
workflow docs (`src/playbooks/*/playbook.ts`, `questions.ts`).

---

## 8. Lessons learned — what worked, what was difficult

**What worked:**

- **Per-tool zod schemas before the first live call.** Writing the schemas
  from the apidocs (not from memory) caught four arg-shape mistakes that
  would otherwise have burned credits on `isError` responses. Client-side
  validation is the cheapest credit-saver there is.
- **The trace as the unit of truth.** Designing the report renderer to
  consume *only* trace entries forced every feature to be evidence-backed —
  there is simply no code path that renders a number without a `[Tn]`.
- **The `tools/list` assertion.** Treating the live tool surface as
  untrusted input (assert 11 tools before spending credits) turned a
  red-team attack (R4.4) into a three-line pre-flight check.

**What was difficult / needed human correction:**

- **Arg shapes are genuinely under-documented for agents.** The MCP docs
  describe each tool, but the REST→MCP param renames (`text`→`query`,
  `categories`+`filter`→`category`+`lat`/`lon`/`radius_meters`) are easy to
  get wrong from REST muscle memory. Our own smoke scripts shipped the
  wrong shapes first; only a correction table against the verified schemas
  fixed them. (Filed as process learning; the tool-surface assertion now
  guards it.)
- **Response shapes are still unverified.** The parsers in
  `src/mcp/results.ts` are defensive by necessity — they try the plausible
  shapes and fail descriptively. The first live run will confirm or correct
  them; the code is written to make that correction cheap.
- **No isochrone on MCP.** The single biggest product limitation, and it's
  Geoapify's, not ours: drive-time catchments need the REST Isoline API.
  We approximate with buffers, disclose it in every report, and filed it as
  [`docs/FEEDBACK.md#1`](FEEDBACK.md#1) — including the concrete ask
  (a `calculate_isochrone` MCP tool).

---

## 9. Reproduce everything

| Artifact | How |
| --- | --- |
| Live smoke (3 regions) | `GEOAPIFY_API_KEY=xxx ./research/smoke/smoke.sh all` |
| One full question | `npm run smoke -- --question thaodien-coffee` |
| Audit a trace | `npm run trace:validate -- logs/<qid>.jsonl` |
| Re-render offline | `npx sitescout report <qid>` |
| Score the bench | `npm run bench` (needs traces from real runs) |
| Static hero image | `npm run static -- <report.html> <out.png>` (needs playwright, else prints the manual procedure) |

Key handling: `.env.local` is gitignored and never committed; committed
example HTML embeds `GEOAPIFY_API_KEY_PLACEHOLDER` (swap in your key to view
tiles locally). Grep the repo for key patterns before publishing — the
pre-submit gate does.

---

*Built for the [Geoapify Open Geospatial Program](https://www.geoapify.com/open-geospatial-program/) Batch #2 — AI × Geospatial. Feedback on the MCP tools themselves: [`docs/FEEDBACK.md`](FEEDBACK.md).*
