# Re-calibration procedure

How an outcome batch moves the model's weights and scales — proposed
with the bench numbers attached, never silently; approved by the
founder, nobody else; version-bumped on every change.

Status: the model ships as interim `2.0.0-unified` (heuristic weights,
no `trafficScale` on either market profile — memo traffic bands are
unavailable until the first bench-driven scale lands). Nothing in this
doc changes that status. The first bench-driven weight change is what
promotes the version to `2.0.0-calibrated`.

## The loop

```
pilot outcome → sitescout outcome record → bench/outcomes/outcomes.jsonl
  → sitescout outcome report → bench/outcomes/CALIBRATION-REPORT.md
  → proposal (bench numbers attached) → founder approval
  → weight/scale change → WEIGHTS_VERSION bump → RESULTS.md entry
  → next memo carries the new version
```

Every step is in the repo; nothing about a calibration change lives
only in chat.

## 1. What a batch can move

Only two things are calibration:

- **Weights** — the five unified factors in `src/scoring/model.ts`
  (`competition, complementarity, catchment, accessibility, cost`).
- **Traffic scales** — `MarketProfile.trafficScale`
  (`customersPerDayAtScore1`, `bandHalfWidth`) per market, which is what
  turns a score into a memo traffic band.

Nothing else moves under this procedure: not the
`INSUFFICIENT_DATA_POI_FLOOR`, not the match rule, not the checklist,
not the model shape. A change to any of those is a design change, not a
calibration, and goes through its own review.

## 2. Proposing a change

The proposer (agent or founder) writes a proposal that states:

1. **The batch** — which outcomes (memo ids, dates) and which bench
   entries, with their counts. State the batch size; v2 sets no fixed
   minimum N, and the founder judges sufficiency case by case. The
   Bangkok bench minimums (≥30 entries, ≥10 closed) are the reference
   for what "enough" looks like for a weight change.
2. **The numbers before** — bench Spearman / top-3 hit rate / dud rate
   (`bench/bangkok-coffee/RESULTS.md`) and outcome match share
   (`bench/outcomes/CALIBRATION-REPORT.md`, ±20% rule, spec §3.2).
3. **The change** — old value → new value for each weight or scale,
   and how it was derived (e.g. for a traffic scale: the median
   actual-mean-per-score over the batch's (score, actual) pairs).
   A scale is fitted from real (score, actual) pairs only — never from
   a single outcome, never from an invented pair.
4. **The numbers after** — the same bench + outcome metrics recomputed
   with the proposed values. A proposal without the after-numbers is
   not a proposal.
5. **Why** — one paragraph: what the batch showed that the old values
   got wrong.

The proposal lives as a commit message + a `RESULTS.md` entry (bench)
and/or a regenerated `CALIBRATION-REPORT.md` (outcomes). A weight or
scale change with no numbers attached is not a calibration — it is a
silent tweak, and it does not land.

## 3. Who approves

The founder (Ung Quan Hy) — and only the founder. The agent proposes;
it never approves its own numbers. Approval is of the exact values in
the proposal (old → new), not of the idea of recalibrating.

## 4. Version bump rule

Every calibration change bumps `WEIGHTS_VERSION` in
`src/scoring/model.ts`, and writes a `RESULTS.md` entry (bench-driven)
and/or regenerates `CALIBRATION-REPORT.md` (outcome-driven):

- **First bench-driven weight change:** `2.0.0-unified` →
  `2.0.0-calibrated`. This is the only change that earns the word
  "calibrated" — and even then, the word is used only with the bench
  numbers attached (spec §2.1 exit gate).
- **Later changes:** bump the patch segment for a scale-only change
  (`2.0.1-calibrated`, …), the minor segment for a weight change
  (`2.1.0-calibrated`, …).
- Past memos are never rewritten. A memo carries the version it was
  generated with; git history is the record of what changed when.

## 5. Pre-pilot step — delete the example line

Before any real pilot, delete the synthetic example line from
`bench/outcomes/outcomes.jsonl` — the line with `"_example": true`,
memo id `example-memo`. Then verify:

```bash
node dist/cli.js outcome report
```

The regenerated `CALIBRATION-REPORT.md` must show zero example rows.
The example line is never presented as evidence — not in the report,
not in a pitch, not in an application. (The Task 14 demo record was
already reverted; the example line is the only synthetic line on file.)

## 6. Measurement methods are never mixed in one aggregate

One method per pilot (`customer-counts` or `pos-transactions`,
recorded per outcome in `measurementMethod`). The two methods measure
different things (browsers vs. buyers); mixing them makes a match
share meaningless.

The current report has a single aggregate because every outcome on
file shares one method (`customer-counts`, the example line). Before
the first aggregate containing mixed methods is published, the report
must be split by `measurementMethod` — one aggregate per method, no
combined share. Until that split exists, a mixed-method batch is
recorded but not aggregated.

## 7. What re-calibration is not

- No silent weight tweaks to make one memo look better.
- No fitting the model to a single outlier outcome.
- No invented bench entries or pilot outcomes — founder-supplied data
  only; if no real entries exist, the bench stays open and the version
  stays `2.0.0-unified`.
- No "calibrated" claim without the bench numbers attached.

## Files

- `src/scoring/model.ts` — `WEIGHTS_VERSION`, weights, `MarketProfile.trafficScale`
- `src/bench/outcomes.ts` — `matchTrafficBand`, `computeCalibrationReport` (pure)
- `src/outcome-cli.ts` — `outcome record` / `outcome report`
- `bench/outcomes/outcomes.jsonl` + `SCHEMA.md` + `CALIBRATION-REPORT.md`
- `bench/bangkok-coffee/` — dataset, runner, `RESULTS.md`
