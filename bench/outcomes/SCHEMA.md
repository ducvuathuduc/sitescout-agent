# Outcomes dataset — `bench/outcomes/outcomes.jsonl`

One line per `(memo id, candidate)` — the ground-truth feedback loop
(spec §2.3, §3.2). The file is append-only; `projectedLow` /
`projectedHigh` are copied from the memo's traffic band at record time,
so the file is self-contained (no need to re-read the memo to judge a
match).

## Fields

| Field | Type | Rule |
|---|---|---|
| `memoId` | string | The memo this outcome belongs to (e.g. `thaodien-coffee`). |
| `candidateId` | string | Candidate in that memo (e.g. `c1`). |
| `candidateLabel` | string? | Human label, copied from the memo. Optional. |
| `decision` | `"signed" \| "opened" \| "passed"` | What the operator did: signed a lease, opened the shop, or passed on the site. |
| `actualDailyCustomersMean` | number \| null | Mean daily customers over the observation window. Null only when `decision` is `"signed"`. |
| `actualTrafficTier` | `"high" \| "medium" \| "low" \| null` | Observed traffic tier. Null only when `decision` is `"signed"`. |
| `measurementMethod` | `"customer-counts" \| "pos-transactions"` | **Required — no outcome is recorded without it.** |
| `projectedLow` | number | Low end of the memo's traffic band, copied at record time. |
| `projectedHigh` | number | High end of the memo's traffic band, copied at record time. Must be `>= projectedLow`. |
| `observedAt` | string (YYYY-MM-DD) | Date the observation was made. |
| `source` | string | Who/where the numbers came from (e.g. `owner-reported counts, week of 2026-11-16`). |
| `_example` | boolean? | Set only on the synthetic demonstration line. Never on real outcomes. |

## Measurement methods (never mixed across pilots)

- `customer-counts` — the operator counts customers (door counts, till
  tallies) over an agreed window and reports the daily mean.
- `pos-transactions` — the mean comes from point-of-sale transaction
  counts over the same window.

Pick one method per pilot and use it for every outcome in that pilot.
The two methods measure different things (browsers vs. buyers); mixing
them makes the match rate incomparable across pilots.

## Signed vs. traffic-match

- `decision: "signed"` with both traffic fields null is a **signed-lease
  proof element**: the memo convinced an operator to sign. It is not a
  traffic-match proof point — the shop is not open yet, so there is
  nothing to match against the band.
- `decision: "opened"` (or `"passed"` with observed traffic at a
  competing site) with a mean and/or tier is a **traffic-match proof
  point**: the calibration report (Task 14) judges it against
  `[projectedLow × 0.8, projectedHigh × 1.2]`.

## Example line

The first line of `outcomes.jsonl` is synthetic (`"_example": true`,
memo id `example-memo`) so the record → report loop is demonstrable
end-to-end. It is never presented as evidence, and it is deleted before
any pilot (Task 15 records this as a pre-pilot step).
