# Edge cases — failure modes and observed behavior

Every edge case names the failure mode AND what SiteScout actually does
(error message / fallback), not just the risk. Key-gated observations are
marked ⏳ PENDING (no key yet — 2026-10-20).

## Geocoding

| Failure | Observed behavior |
|---|---|
| Empty geocode result (all fallback queries) | Candidate marked `unevaluable`; listed in the report's "Excluded from ranking" section with the trace refs of the failed queries. Never silently dropped, never scored. |
| Ambiguous geocode (multiple `result_type`s) | Preference order `amenity/building > street > locality > city` (+ confidence); chosen type + alternative count recorded in the trace summary. |
| Invalid API key (HTTP 401) | Client fails fast — no retry. CLI prints `BLOCKED: missing GEOAPIFY_API_KEY` (unset) or surfaces the 401 message. |
| HTTP 429 / 5xx / timeout | Exponential backoff, 3 attempts, jitter (`src/mcp/client.ts`). Then the error is traced and the run continues/aborts per phase. |

## Places & routing

| Failure | Observed behavior |
|---|---|
| `search_places` returns 0 POIs | Counts are 0 — the scoring model's data-density floor (`INSUFFICIENT_DATA_POI_FLOOR = 5`) then excludes the candidate from ranking instead of scoring "no competition" as good. |
| Route matrix cell unreachable (NaN) | Cell dropped from the mean; if NO cell is finite, `meanAccessDurationS` stays unset → accessibility scores neutral 0.5, disclosed in the trace. |
| `traffic: approximated` vs `free_flow` | Always `approximated` (traffic-aware); query timestamp is in the trace. Times are time-of-day dependent — disclosed in every report's limitations. |

## Geometry

| Failure | Observed behavior |
|---|---|
| Buffer/measure/relation call fails | Catchment area falls back to the analytic circle area (πr²); the trace records the failed call. Report still discloses the buffer approximation. |
| MCP `isError: true` on any call | Recorded in the trace with `isError`, never retried (validation failure). Downstream treats the evidence as missing, not zero. |

## Budget & quota

| Failure | Observed behavior |
|---|---|
| `--budget` cap exceeded during planning | Planning aborts BEFORE the call is sent: `budget exceeded: planned X > cap Y`. No partial spend beyond the cap. |
| Free-tier daily quota (3,000 credits/day) | ⏳ PENDING live observation. Estimated per-question cost ≈ 20–40 credits; the printed ledger lets the operator stay inside quota. |

## Offline / reproducibility

| Failure | Observed behavior |
|---|---|
| `sitescout report <qid>` without trace/manifest | Clear error naming the missing files and the `ask` command that produces them. |
| Corrupted trace file | `trace validate` reports the exact line and failure (bad JSON / schema / seq order). |
| No network at all | Every network call throws through `GeoapifyMcpClient`; nothing is mocked, nothing is faked — the run fails loudly. |
