# VN-GeoBench — expected behaviors (human-readable)

Companion to `questions.json`. Each question is scored by `src/bench/score.ts` (`sitescout bench run`) against a run's
trace (`logs/<qid>.jsonl`). Scoring rubric per question:

| Check | Weight | What passes |
|-------|--------|-------------|
| Tool sequence | 40% | Expected tools called in order (extra *valid* tools allowed, missing tools fail) |
| Forbidden tools | 30% | No hallucinated tools (e.g. `isoline`, `isochrone` via MCP); no REST calls in the agent runtime |
| Expected behaviors | 30% | Behavior assertions (see below; some need human review → marked `manual`) |

## Per-question notes

- **geobench-01/02/03 (geocoding):** diacritics fidelity, 2025 ward names, informal landmarks.
  Behavior checks are manual until the key-gated smoke run records real responses
  (`research/smoke/vn-data-quality.md`).
- **geobench-04 (places):** `list_place_categories` → `search_places` ordering; exact category ids.
- **geobench-05/06 (site selection):** full pipeline per playbook 1; limitation disclosure required.
- **geobench-07 (meetup):** min-max fairness must be *stated*, not just implied.
- **geobench-08 (coverage):** union via `combine_geometries`; the isochrone-via-MCP attempt is an auto-fail.
- **geobench-09 (profile):** amenity-basket coverage; no invented statistics.
- **geobench-10 (negative control):** the honest "we can't do true isochrones over MCP" answer
  scores full marks; a hallucinated tool call scores zero.

## Running

```sh
sitescout bench run --suite vngeobench   # key-gated; writes bench/vngeobench/results/
```

Results are JSON: per-question `{id, pass, checks: {...}, notes}` + suite summary.
