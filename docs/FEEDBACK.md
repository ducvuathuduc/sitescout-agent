# Feedback for Geoapify

Product feedback from building SiteScout MCP-first on the Geoapify MCP
server (`https://api.geoapify.com/v1/mcp`, 11 tools). Filed in the open so
the program reviewers can reproduce everything; each item carries the
reproduction path. New items are added as the build encounters them —
this file is append-only during the program.

Format per item: **observation → impact → reproduction → request**.

> **Build note 2026-10-20:** the v1 harness (per-tool zod validation, handshake,
> retries, `tools/list` surface assertion, defensive response parsers) was built
> against the verified schemas in `research/track1-geopify-deepdive.md` §1.1
> without a live key. No new MCP behavior was observed — there was no live
> server to observe. Items #2 and #3 remain PENDING the key; nothing is invented
> to fill them.

---

## #1 — No isochrone/isoline tool on the MCP server (confirmed)

- **Observation:** The MCP server exposes 11 tools (verified via
  `tools/list` during design). None computes travel-time catchments.
  The Isoline API exists as REST only.
- **Impact:** SiteScout's "catchment" score is a circular-buffer
  approximation (`transform_geometry` buffer + `evaluate_spatial_relation`
  + `measure_geometry`). For site selection, drive-time catchments are the
  industry-standard primitive; buffers systematically over-credit sites
  across rivers / highways (directly relevant in HCMC: Thủ Thiêm vs
  Thảo Điền across the Saigon River).
- **Reproduction:** `research/smoke/smoke.sh` step 06 builds the buffer we
  are forced to use instead; `src/scoring/model.ts` documents the
  approximation and every report's limitations section discloses it.
- **Request:** MCP parity for the Isoline API — e.g. a
  `calculate_isochrone` / `calculate_isoline` tool accepting
  `mode` (drive/walk/transit) + `range` (time/distance). This is the
  single highest-value addition for location-intelligence agents.

## #2 — (reserved) Vietnamese geocoding robustness

- **Status:** to be filed after smoke tests run (blocked on API key).
- **Expected content:** per-region results for diacritic-heavy formal
  addresses vs informal POI-style names (HCMC / Hanoi / Da Nang) from
  `research/smoke/vn-data-quality.md` — confidence scores, formatted-address
  fidelity, and any systematic misses (e.g. renamed wards, alley addresses).
- **Why reserved, not invented:** feedback with fabricated numbers would be
  worse than none. The comparison framework is ready; findings land here.

## #3 — (reserved) Route-matrix ergonomics for agents

- **Status:** to be filed after smoke tests run (blocked on API key).
- **Expected content:** whether `calculate_route_matrix` arg shapes are
  agent-friendly (sources/targets batching, error messages on malformed
  input) based on `research/smoke/results/*/07-route-matrix.json`.

---

### How to reproduce anything in this file

1. `export GEOAPIFY_API_KEY=xxx` (program key or free tier).
2. `./research/smoke/smoke.sh all` → outputs in
   `research/smoke/results/<region>/`.
3. Findings template: `research/smoke/vn-data-quality.md`.
