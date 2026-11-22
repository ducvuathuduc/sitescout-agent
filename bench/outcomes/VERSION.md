# Outcomes dataset — version

- **version:** 1.0.0
- **date:** 2026-11-22
- **file:** `outcomes.jsonl`
- **entry count:** 1 (counted from the file)
- **entries:** one synthetic example line (`"_example": true`, memo id
  `example-memo`, candidate `c1`, decision `opened`, 150 customers/day
  vs. band 120–180).

The single line on file is the demonstration example. It is deleted
before any real pilot (docs/calibration-procedure.md §5) and is never
presented as evidence. The calibration report currently reads
"no real outcomes yet".

## Version rule

The version bumps on every entry batch: a batch that appends outcomes
bumps the patch segment (`1.0.1`, …); a batch that changes the schema
(new/renamed fields) bumps the minor segment (`1.1.0`, …). Every bump
gets a `CHANGELOG.md` entry and a regenerated
`CALIBRATION-REPORT.md`. The version in this file and the entry count
are updated in the same commit as the dataset change — never in a
separate commit, never from memory.
