<div align="center">

# 📍 SiteScout

**An MCP-native location-intelligence agent for Ho Chi Minh City.**
**Every number in a report traces back to the exact Geoapify API call that produced it.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Geoapify Batch #2](https://img.shields.io/badge/Geoapify-Open_Geospatial_Program_Batch_2-1976d2.svg)](https://www.geoapify.com/open-geospatial-program/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933.svg)](https://nodejs.org/)

> ✅ **Accepted into the [Geoapify Open Geospatial Program](https://www.geoapify.com/open-geospatial-program/), Batch #2 — *AI × Geospatial*.**
> Scope for this batch: **one city (Ho Chi Minh City), 2–3 example site-selection questions**, due **November 15, 2026**.
> Built with [Geoapify](https://www.geoapify.com/) — geocoding, places, routing and geometry through the Geoapify MCP server.

</div>

---

**"Where should I open my coffee shop in Thao Dien?"** — SiteScout chains
Geoapify's MCP tools (geocode → place search → catchment geometry → route
matrix), scores candidate sites deterministically, and hands you a ranked
shortlist where **every number traces back to the exact API call that
produced it**. No black-box answers. No invented foot traffic. If a claim
can't point at a trace entry, it doesn't ship.

SiteScout is a **platform, not a single tool**: one shared engine (MCP agent
harness, evidence trace, visual report renderer, Vietnamese address
normalization) with **research playbooks** on top. For Batch #2 the flagship
is SME site selection in Ho Chi Minh City; the engine is built to extend to
more cities and playbooks after review.

---

## ✨ What it does

- **MCP-first, no REST fallbacks.** The runtime speaks only to the
  [Geoapify MCP server](https://www.geoapify.com/) (`https://api.geoapify.com/v1/mcp`)
  through its 11 tools. A missing capability becomes public feedback, never a
  silent workaround.
- **Evidence-traced reports.** Every claim cites `[Tn]` entries in a
  sha256-signed JSONL trace. Re-run the trace offline and you get the same
  report — audit the whole chain with `sitescout trace validate`.
- **Deterministic scoring.** Competition, complementary-POI mix, catchment
  richness and accessibility — computed offline from traced evidence, with
  versioned weights. Same evidence, same score, every time.
- **Vietnamese-address aware.** Diacritics, 2025 ward-rename aliases and the
  informal names locals actually use, handled by a tested normalization chain.
- **Visual reports.** Interactive Leaflet map (Geoapify tiles) with candidate
  zones, catchment polygons, competitor/complementary POI markers and the
  ranked shortlist — plus a static export.

---

## 🎬 Demo

> Screenshots and sample reports from live runs land here once the program
> API key is active. The report shape below is the real output format —
> numbers shown are illustrative until the first live run replaces them.

```
# SiteScout report: Specialty coffee shop — Thao Dien, Thu Duc, HCMC

## Ranked shortlist
| Rank | Candidate             | Total  | Evidence        |
| ---- | --------------------- | ------ | --------------- |
| 1    | Xuan Thuy (north end) | **0.71** | [T3] [T9] [T14] |
| 2    | Quoc Huong junction   | 0.58   | [T4] [T10] [T15]|

## Why each site ranks here
### Xuan Thuy (north end) (total 0.71)
- Competition 0.82 — 3 cafes within 800 m [T9]
- Complementarity 0.74 — 31 offices/gyms nearby [T9]
- Catchment 0.66 — 2.01 km² buffer, 41 POIs [T14]
- Accessibility 0.61 — 11 min mean from 3 origins [T15]
```

Every `[Tn]` resolves to one line in `logs/<question>.jsonl`.

---

## ⚡ Quickstart

```sh
git clone https://github.com/ducvuathuduc/sitescout-agent.git
cd sitescout-agent
cp .env.local.example .env.local   # add your GEOAPIFY_API_KEY
npm install && npm run build
```

Run the flagship playbook (Ho Chi Minh City site selection):

```sh
npx sitescout ask --question thaodien-coffee --region hcmc --playbook site-selection
# or: npm run smoke -- --question thaodien-coffee   (asserts the 11-tool surface first)
```

You get:

- `examples/site-selection/thaodien-coffee/report.html` — interactive visual report
- `examples/site-selection/thaodien-coffee/report.md` — ranked shortlist
- `logs/thaodien-coffee.jsonl` — evidence trace (every tool call)

```sh
npm run trace:validate -- logs/thaodien-coffee.jsonl   # audit the trace
npx sitescout report thaodien-coffee                    # re-render offline (no MCP calls)
```

> The API key is read from the `GEOAPIFY_API_KEY` environment variable
> (via `.env.local`, gitignored) — never committed, never in code.
> Missing key → `BLOCKED: missing GEOAPIFY_API_KEY` (never a mocked run).
> Get a key at [geoapify.com](https://www.geoapify.com/) (free tier,
> 3,000 credits/day, no card) or via the Open Geospatial Program.

---

## 🗺️ Playbooks

| Playbook | Status | What it does |
|----------|--------|--------------|
| **1 · SME site selection** (flagship, HCMC) | ✅ must-ship | Ranked shortlist for retail/F&B sites from competitor + POI + accessibility evidence. Batch #2 questions: `thaodien-coffee` + 2 further HCMC questions |
| **2 · Meetup planning** | ✅ engine-ready | Fairest meeting point via route matrix + venue discovery |
| **3 · Coverage analysis** | 📄 docs-only | Delivery/service zones + travel-time SLA gaps |
| **4 · Neighborhood profiling** | 📄 docs-only | Amenities, schools, healthcare, commute scoring |
| **5 · Tourism day-plan** | 📄 docs-only | POI discovery + routing into a realistic day itinerary |

Playbooks 3–5 are documented workflows for post-review extension; the
Batch #2 submission ships playbook 1 (+ playbook 2 engine support).

---

## 🧭 How it works

```mermaid
flowchart LR
    Q[Research question<br/>e.g. coffee shop in Thao Dien] --> P[HeuristicPlanner<br/>deterministic, no LLM]
    P -->|JSON-RPC 2.0<br/>x-api-key| M[Geoapify MCP server<br/>11 tools]
    M --> T[Evidence trace<br/>JSONL, one line per call]
    T --> S[Scoring model<br/>offline · deterministic]
    S --> R[Report<br/>Markdown + visual map, every claim → [Tn]]
    R --> O[Ranked shortlist<br/>auditable end-to-end]
```

**Hard boundaries:**

1. `src/mcp/client.ts` is the *only* module that touches the network, and
   it speaks only MCP. There is no REST fallback anywhere in the runtime.
2. The scoring model and report renderer are pure offline functions over
   traced evidence. A number that didn't come from a trace entry cannot
   appear in a report.

**Shared engine modules:** `src/agent/` (harness: plan → act → trace → score →
render, zod validation, retries with backoff, credit budgeting) ·
`src/geo/vietnam-address.ts` (standalone VN normalization: diacritics, 2025
ward-rename aliases) · `src/report/map.ts` + `src/report/static.ts` (visual
report: interactive Leaflet map + static export) · `bench/vngeobench/`
(public benchmark of Vietnamese geospatial questions).

### The 11 MCP tools, and what each one earns its place doing

| Tool | SiteScout job |
| --- | --- |
| `geocode_address` / `geocode_structured_address` | Resolve candidate seeds & demand origins (diacritics-tolerant) |
| `reverse_geocode_coordinates` | Human-readable labels for raw coordinates |
| `search_places` | Competitor counts + complementary-POI counts per catchment |
| `list_place_categories` | Taxonomy resolution for the scoring model |
| `calculate_route` / `calculate_route_matrix` | Accessibility: travel times from demand origins |
| `transform_geometry` | Buffer a candidate point → catchment polygon |
| `evaluate_spatial_relation` | Which POIs fall inside the catchment |
| `measure_geometry` | Catchment area → the density denominator |
| `combine_geometries` | Merge catchments when candidates cluster |

---

## 🔌 Use it from your own agent (MCP config)

SiteScout's tool surface is the Geoapify MCP server itself — point any
MCP-capable client at it. Example for Claude Code (`.mcp.json`):

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

> Substitute your key (or wire your secret manager). Verify the exact
> header/transport fields against your client's MCP docs — clients differ.

---

## ✅ What the agent can and cannot do

**Can:**

- Chain the Geoapify MCP tools into a multi-step location investigation
  (playbook 1 uses 9 tools; the full 11-tool surface is asserted before
  every run)
- Geocode Vietnamese addresses with diacritics via a tested fallback chain
  (canonical → folded → 2025 ward-alias expanded)
- Score sites on competition, complementary-POI mix, catchment richness
  and accessibility — deterministically, from traced evidence
- Prove every claim: no citation, no claim
- Refuse cleanly: missing key → `BLOCKED` (never mocked); docs-only
  playbooks → explicit error

**Cannot (honestly):**

- **True drive-time isochrones** — the MCP server has no isochrone tool
  (Isoline is REST-only). Catchments are buffer approximations, disclosed
  in every report and filed as [`docs/FEEDBACK.md#1`](docs/FEEDBACK.md).
  We approximate openly; we never silently substitute REST.
- See real-time foot traffic or revenue — POI data is Geoapify's places
  index at query time, not a live census.
- Guarantee business outcomes — this is decision support, not a crystal ball.
- Resolve every informal local name — coverage varies by region and is
  measured, not assumed (`research/smoke/vn-data-quality.md`).

---

## 💬 Geoapify feedback highlights

Building MCP-first surfaced real product feedback, filed in the open at
[`docs/FEEDBACK.md`](docs/FEEDBACK.md):

1. **#1 — No isochrone tool on the MCP server** (confirmed): isochrone parity
   with the REST Isoline API would be the single highest-value addition for
   location-intelligence agents.
2. **#2 — Vietnamese geocoding robustness** (reserved): per-region findings
   for diacritic-heavy vs informal names land here after live runs.
3. **#3 — Route-matrix ergonomics for agents** (reserved): batching and
   error-message quality, from live runs.

---

## 🗺️ Status & roadmap

| Phase | Window | Exit criterion |
| --- | --- | --- |
| ✅ Design + wave 1 | 20/10/2026 | Architecture locked; core implemented; 53/53 tests green (live verification key-blocked) |
| 🔲 Confirm + API key | 21–26/10 | Reply confirming Nov 15 deadline + HCMC scope → program API key arrives |
| 🔲 Live runs | 27/10–02/11 | Smoke runs for the 2–3 HCMC questions; parser shapes verified; ward-alias gate; `vn-data-quality.md` filled |
| 🔲 Calibration | 03–09/11 | Weights calibrated from real densities; FEEDBACK.md #2/#3 filed |
| 🔲 Reports + tutorial | 10–14/11 | Visual reports from real runs; tutorial + screenshots; REVIEW-SIM cold run to zero defects |
| 🎯 **Submit** | **≤ 15/11/2026** | Public MIT repo + README + tutorial + FEEDBACK.md → final review; bonuses judged 22–25/11 |

⛔ **Currently blocked on one thing:** live runs need the Geoapify API key
(program key, arriving after the confirmation reply). Everything else —
schemas, retries, fallback chains, scoring math, trace validation, report
rendering — is implemented and tested (`npm run typecheck`, `npm run lint`,
`npm test` all green).

---

## 🔧 Dependencies & build

- **Runtime deps**: `zod` (validation), `dotenv` (`.env.local`). Every
  non-devDependency is imported by `src/` — no dead weight.
- **Dev deps**: `typescript`, `vitest`, `eslint` + `typescript-eslint`.
- **Build**: `npm run build` → `dist/` (gitignored). `npm run typecheck`
  (`tsc --noEmit`), `npm run lint` (zero warnings), `npm test` (vitest).
- **Node**: ≥20 (`engines` field).

## 🤝 Contributing

Issues and PRs welcome. Ground rules:

- **MCP-first is non-negotiable.** No REST fallbacks in the runtime —
  missing capabilities become `docs/FEEDBACK.md` items.
- Every new claim path needs trace coverage and a `trace validate` fixture.
- Don't commit `.env.local`, `logs/*.jsonl`, or `research/smoke/results/`.
- See [`ARCHITECTURE.md`](ARCHITECTURE.md) before touching the loop.

---

## 📄 License

MIT — see [LICENSE](LICENSE). Built for the Geoapify Open Geospatial Program
Batch #2. SiteScout is an independent project; Geoapify is a trademark of
its respective owner.

## 👤 Author

**Thành Huỳnh Diệu** — final-year IT student, FPT University (GPA 3.5/4.0),
AI engineering focus. Paper accepted at FISAT 2026. GitHub:
[ducvuathuduc](https://github.com/ducvuathuduc).

## 🙏 Acknowledgements

Built with [Geoapify](https://www.geoapify.com/) — geocoding, places,
routing and geometry APIs and MCP server — as part of the
[Geoapify Open Geospatial Program](https://www.geoapify.com/open-geospatial-program/).
