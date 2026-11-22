# Outcomes dataset — provenance

How this dataset was (and will be) collected — spec §2.4, §3.2.

## Collection method

Real outcomes are operator-reported, recorded with
`sitescout outcome record` by the founder after a pilot decision:

- **Daily customer counts** (`measurementMethod: "customer-counts"`) —
  the operator counts customers over the first 30 trading days and
  reports the daily mean.
- **POS transactions** (`measurementMethod: "pos-transactions"`) — the
  mean comes from point-of-sale transaction counts over the same
  30-day window.

One method per pilot, recorded per outcome, never mixed in one
aggregate (docs/calibration-procedure.md §6). A `decision: "signed"`
row with no traffic yet is a signed-lease proof element, not a
traffic-match proof point (spec §3.2).

## No invented outcomes

An outcome is recorded only from the operator's own report, with a
`source` naming where the numbers came from and an `observedAt` date.
No outcome is estimated, modelled, or back-filled by the agent. The
`projectedLow` / `projectedHigh` on each line are copied from the
memo's traffic band at record time, so the file is self-contained.

## Confidentiality

Operator data is confidential by default (spec §3.4). Nothing
operator-identifying goes in the public repo without the operator's
written consent. The outcome schema has no operator-name or contact
fields (`memoId, candidateId, candidateLabel?, decision,
actualDailyCustomersMean, actualTrafficTier, measurementMethod,
projectedLow, projectedHigh, observedAt, source`), so a row cannot
carry an operator's name, phone, or email by accident. The `source`
field is a free-text description of where the numbers came from
(e.g. "owner-reported counts, week of 2026-11-16") — never a contact.
The public repo carries the schema and the aggregate calibration
report; rows that would identify an operator stay out unless that
operator consents in writing.

The one line on file is the synthetic example (`example-memo`) — no
real operator is named in it.
