# Bangkok coffee calibration dataset — version

- **version:** 1.0.0
- **date:** 2026-11-22
- **file:** `dataset.json`
- **entry count:** 5 (counted from the file)
- **entries:** `bk-ex-001` … `bk-ex-005`, all in Thonglor; 3 open, 2 closed;
  tiers high / medium / low / unknown / low; all `observed_at` 2026-11-01.

**All 5 entries are EXAMPLE entries — not ground truth.** The file
carries the note `EXAMPLE — not ground truth — replace with real
entries; Phase 1 gate stays open until then`. The Phase 1 gate stays
open until real entries land (minimum 30 entries, ≥10 closed).

## Version rule

The version bumps on every entry batch: a batch that adds, corrects,
or removes entries bumps the patch segment (`1.0.1`, …); a batch that
changes the schema (new/renamed fields) bumps the minor segment
(`1.1.0`, …). Every bump gets a `CHANGELOG.md` entry and a
`RESULTS.md` entry with the bench numbers recomputed. The version in
this file and the entry count are updated in the same commit as the
dataset change — never in a separate commit, never from memory.
