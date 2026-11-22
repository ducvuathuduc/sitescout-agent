# Bangkok coffee bench — collection protocol

Ground-truth dataset for `bench/bangkok-coffee/dataset.json`: real Bangkok
coffee-shop locations with known outcomes, scored against the engine's
ranking. This is what turns heuristic weights into calibrated weights
(spec §1/H1.2). The founder collects the entries; the implementer never
invents them.

## Minimum size

- ≥30 entries, ≥10 `closed` (failures teach more than successes).
  Enforced by `validateDataset()` in `src/bench/bangkok.ts`.
- Until real entries land, `dataset.json` is a copy of the 5-entry
  `dataset.example.json`, marked `EXAMPLE — not ground truth`, and the
  Phase 1 gate stays open.

## Sources (founder only)

- Public listings (e.g. a shop's public page showing it is open or closed).
- Owner conversations (the operator reports their own traffic tier).
- On-foot observation (the collector visits the street and records what
  they see).

## Rules

- `traffic_tier` is operator-observed or owner-reported, never a model
  output. When the tier is not known, use `"unknown"` — it is allowed
  and counted (excluded from the rank correlation, never a hit or a dud).
- `tier_source` names how the tier was learned
  (`operator-reported`, `owner-reported`, `public listing`,
  `on-foot observation`) — free text, no operator-identifying fields.
- `closed_approx` must be non-null when `status` is `"closed"`.
- `observed_at` is the date the entry was last verified (ISO `YYYY-MM-DD`).
- No operator names, contacts, phone numbers, or emails in the public
  file. The schema has no fields for them; keep it that way (spec §2.4).
- `opened_approx` / `closed_approx` are approximate months (`YYYY-MM`) —
  the exact day is rarely public and is not needed for the bench.

## How the bench scores

- An entry matches a ranked candidate when the candidate lies within
  150 m of the entry (haversine). Entries with no candidate that close
  are reported as `unmatched` and excluded from the three metrics.
- Metrics (reported in `RESULTS.md`): rank correlation between engine
  score and traffic tier (ordinals high = 3, medium = 2, low = 1,
  closed = 0, unknown excluded); top-3 hit rate (share of the top-3
  ranked candidates whose matched entry is `high`/`medium`); dud rate
  (share of the top-3 that are `closed` or `low`).
- No pass threshold is set — the first run establishes the baseline, and
  the threshold is set from the baseline in review.

## Running it

```bash
npm run build && node bench/bangkok-coffee/run.mjs [recorded-run.json]
```

Default recorded run: `tests/fixtures/bangkok-coffee-run.json`
(synthetic). Or via the CLI: `node dist/cli.js bench run --suite bangkok-coffee`.
