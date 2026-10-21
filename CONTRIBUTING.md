# Contributing to SiteScout

## Ground rules

- **MCP-first is non-negotiable.** The agent runtime (`src/mcp/`,
  `src/agent/`) speaks only to `https://api.geoapify.com/v1/mcp`. No REST
  fallbacks — a missing capability becomes a `docs/FEEDBACK.md` item.
- **No citation, no claim.** Every new claim path needs trace coverage and a
  `trace validate` fixture. Numbers that didn't come from a trace entry
  don't ship.
- **Never commit** `.env.local`, `logs/*.jsonl`, or
  `research/smoke/results/`. Committed `examples/**/report.html` must embed
  `GEOAPIFY_API_KEY_PLACEHOLDER`, never a real key.

## Layout

- `src/mcp/` — the only network boundary (`client.ts`: handshake, retries,
  per-tool zod validation; `schemas.ts`: the 11 verified arg shapes;
  `results.ts`: defensive response parsers).
- `src/agent/` — plan → act → trace loop (`run.ts`, HeuristicPlanner only),
  evidence trace (`trace.ts`), credit budgeting (`budget.ts`).
- `src/scoring/` — pure, deterministic scoring over traced evidence.
  Weights are versioned (`WEIGHTS_VERSION`); calibration bumps the version.
- `src/geo/` — standalone Vietnamese address normalization library.
- `src/report/` — Markdown renderer, Leaflet visual report, static export.
- `src/playbooks/` — `site-selection` + `meetup-planning` ship runtimes;
  `coverage-analysis`, `neighborhood-profile`, `tourism-dayplan` are
  **docs-only** (workflow + questions, no runtime — red-team cut).
- `src/bench/` — VN-GeoBench scorer; suite data in `bench/vngeobench/`.
- `tests/` — vitest. Parser tests use SYNTHETIC fixtures (labeled, not real
  API responses).

## Checks

```sh
npm run typecheck   # tsc --noEmit, must be clean
npm run lint        # eslint, zero warnings
npm test            # vitest, all green
```

New tools, new arg shapes, or new response shapes: update `src/mcp/schemas.ts`
/ `src/mcp/results.ts` + tests + the correction table in
`research/track1-geopify-deepdive.md` §1.1. Verify against a live
`tools/list` snapshot (`./research/smoke/smoke.sh hcmc`, step 00) before
trusting a shape.
