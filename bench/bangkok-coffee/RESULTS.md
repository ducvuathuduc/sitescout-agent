# Bangkok coffee bench — RESULTS

Offline bench: a recorded run scored against `dataset.json`. No API calls.

- Run date: 2026-11-22
- Recorded run: `tests/fixtures/bangkok-coffee-run.json`
- Dataset entries: 5 (2 closed)
- Matched entries (candidate within 150 m): 5
- Unmatched entry ids: none

> **Gate open:** dataset has 5 entries (2 closed); minimum is 30 entries with 10 closed. Replace the EXAMPLE entries in `dataset.json` with real entries (see COLLECTION.md) — metrics below are computed on example data, not ground truth.

## Metrics

- Rank correlation (Spearman, engine score vs. traffic tier): 0.949
- Top-3 hit rate (top-3 ranked that are high/medium tier): 0.667
- Dud rate (top-3 that are closed or low tier): 0.000

No pass threshold is set — the first run establishes the baseline, and
the threshold is set from the baseline in review (spec §1/H1.2).
