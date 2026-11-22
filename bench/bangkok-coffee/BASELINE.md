# SiteScout v2 — Preflight Baseline (v1.2.0, main @ 5778b0a)

Recorded 2026-11-22 on branch `feat/sitescout-v2-upgrade`. Every later
regression guard reads these numbers. Baseline gate
(`npm ci && npm run typecheck && npm run lint && npm test && npm run build`)
was green at this commit: typecheck ✓, lint ✓ (0 warnings), 120 tests
passed (15 files), build ✓.

## Scoring models (two, disagreeing — see spec §0.2)

- REST engine (`src/engine/scout.ts`, line 31–32):
  `0.35 × demand + 0.25 × (1 − competition) + 0.25 × access + 0.15 × walk reach`,
  version `1.0.0-isoline`.
- MCP/agent model (`src/scoring/model.ts`, line 74):
  `0.30 × competition + 0.25 × complementarity + 0.25 × catchment + 0.20 × accessibility + 0 × cost`,
  version `0.2.0-market-aware`.

## Benchmarks and recorded runs

- HCMC address benchmark 48/55 (87%) (`bench/hcmc-addresses/RESULTS.md`, 2026-10-22).
- Recorded run costs: ~91 / ~90 / ~139 credits (three recorded runs, README.md).
- Recorded top scores: 0.66 (Thảo Điền coffee), 0.58 (Bình Thạnh pharmacy),
  0.82 (District 1 lunch).

## Demo proxy budget (`docs/demo-proxy.md`)

- Demo budget 2,400 credits/day, one live run stops at 250 credits,
  180 live calls per visitor per day.

## Insufficient-data floor

- `INSUFFICIENT_DATA_POI_FLOOR = 5` exists in `src/scoring/model.ts` only
  (line 123). The REST engine has no equivalent yet.
