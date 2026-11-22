# SiteScout v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SiteScout v1.2.0 to v2 — one unified, bench-calibrated scoring model with per-market profiles, a decision-grade memo (bands, street-level checklist, freshness, expiry), a ground-truth feedback loop, a versioned data edge, and a chain dashboard — so three paid pilots can prove the investable bar.

**Architecture:** Keep the existing two-path engine (REST isoline engine in `src/engine/scout.ts`, MCP/agent path through `src/scoring/model.ts`) but make both consume one scoring implementation in `src/scoring/model.ts`; add a file-based Bangkok calibration bench and outcomes dataset under `bench/`; extend the existing memo renderers (`src/engine/render.ts`, `src/report/render.ts`) and the Worker scope (`web/worker/index.ts`, prepared only, never deployed by the implementer).

**Tech Stack:** TypeScript (strict), Node ≥ 20, vitest, zod, Geoapify REST + MCP, Cloudflare Workers (Wrangler 4.157.0, D1), Leaflet browser app in `web/src/`.

**Spec:** `~/workspace/sitescout-v2/UPGRADE-SPEC.md` (400 lines, binding authority; repo `github.com/ducvuathuduc/sitescout-agent`, `main` @ `5778b0a`, v1.2.0). This plan will be committed into the repo later as `docs/superpowers/plans/2026-11-22-sitescout-v2.md`.

## Global Constraints

- ONE branch for the whole build: `feat/sitescout-v2-upgrade` (parent-coordinator ruling — overrides spec §2.0 "one branch per phase"). Phases are sequential task groups on that branch. ONE PR at the end. The implementer never merges; the founder merges.
- Each phase ends CI-green (`npm run typecheck && npm run lint && npm test && npm run build`); a phase gate (§2.6 of the spec) is checked off with evidence before the next phase begins.
- TypeScript strict (`strict: true` in `tsconfig.json`); no `any`, no `!`, no `ts-ignore` in v2 code. Note: repo `eslint.config.mjs` currently sets `@typescript-eslint/no-explicit-any` to `warn` — but `npm run lint` uses `--max-warnings 0`, so a warning already fails lint; keep it that way.
- Every number in any user-facing output cites a trace entry (existing repo rule).
- No secrets in code, bundles, or knowledge sources. Geoapify key via env / Worker secret only.
- If a check has not been run, write UNVERIFIED — never write "verified" from a summary.
- Never delete or skip a failing test to make CI green. A failing test is fixed or the change is reverted.
- Verify every package exists (name, maintenance, download history) before adding it. No new dependency is expected; if one becomes necessary, the task that adds it must name it and its verification.
- Worker deploy is human-gated. The implementer prepares the Worker change + deploy instructions and never runs `npm run demo:deploy`.
- The word "calibrated" must not appear in any memo, pitch, or user-facing output until the Phase 1 bench is measured. The unified model therefore ships under the interim version `2.0.0-unified` and is bumped to `2.0.0-calibrated` only when the first bench-driven weight change lands (spec §2.1).
- No weight/scale value changes without a `RESULTS.md` entry and a version bump.
- No price appears in code, memo, or dashboard copy except as a clearly-marked pilot-test value.
- No claim of parity with Placer.ai or Buxton anywhere — positioning only.
- Scope cuts (spec §4 — a phase PR adding any of these is rejected): (1) no telco mobility data; (2) no scraping of Grab, Foodpanda, or any delivery/travel service — operator-reported / human-observed signals only; (3) no rent or revenue prediction as a point number — bands with uncertainty only; (4) no foot-traffic sensors, hardware, or real-time feeds; (5) no new cities beyond Bangkok and HCMC; (6) no B2C acquisition motion (ads, referral, solo-founder onboarding funnel); (7) no broker / lease-signing integration; (8) no LLM-generated numbers without trace citations; (9) no pricing finalized in v2; (10) no production Worker deploy by the implementer; (11) no re-architecture of the demo proxy beyond the Bangkok scope + per-market budget in Phase 2; (12) no parity claim with Placer.ai/Buxton.
- Assumptions are marked `[ASSUMPTION]` in code comments and docs where the spec marks them (spec §5: A1–A12); never invent metrics, prices, or validation claims. Dataset traffic tiers are never invented — `unknown` is allowed and counted.
- Founder-supplied data only: the Bangkok dataset entries and pilot outcomes are collected by the founder (public listings, owner conversations, on-foot observation). The implementer builds schema, runner, and validation — it never invents entries. If no real entries exist yet, ship a 5-entry `EXAMPLE` file clearly marked `EXAMPLE — not ground truth` and the Phase 1 gate stays open until real entries land.

## Review Focus

- A question naming a place outside both markets, or a Bangkok address the geocoder resolves outside the 40 km radius (registry bbox misclassification, e.g. Johor Bahru → SG): the engine must reject it with a clear out-of-scope error, never silently score a wrong city. (Test added to Task 2.)
- Every Geoapify Isoline call failing for all candidates (quota/429/network): the engine falls back to a 600 m disk per candidate, scores must still compute, and the memo must disclose the fallback. (Test added to Task 2.)
- A `--checklist` file that is malformed JSON, fails zod validation, or references a candidate id that does not exist in the run: the command must fail loudly naming the file and the problem, never silently render everything UNVERIFIED. (Test added to Task 7.)
- An outcome recorded for a memo id with no matching memo on file, or with no traffic band on file: the record command must refuse, never create an orphan outcome the calibration report cannot match. (Test added to Task 14.)
- The chain dashboard rendering when the memo index is empty, or when an outcome references a memo id absent from the index: it must render an empty state / an "unknown memo" row, never crash or drop the outcome silently. (Test added to Task 18.)

---

## File structure

**Create:**
- `bench/bangkok-coffee/BASELINE.md` — Phase 0 baseline numbers (Task 1)
- `bench/bangkok-coffee/dataset.json` — ground-truth entries, schema in spec §1/H1.2 (Task 4)
- `bench/bangkok-coffee/dataset.example.json` — 5-entry file, marked `EXAMPLE — not ground truth` (Task 4)
- `bench/bangkok-coffee/COLLECTION.md` — collection protocol (Task 4)
- `bench/bangkok-coffee/run.mjs` — offline runner, follows `bench/hcmc-addresses/run.mjs` (Task 4)
- `bench/bangkok-coffee/RESULTS.md` — written by the runner: run date + rank correlation + top-3 hit rate + dud rate (Task 4)
- `bench/bangkok-coffee/VERSION.md`, `bench/bangkok-coffee/CHANGELOG.md`, `bench/bangkok-coffee/PROVENANCE.md` — dataset versioning (Task 16)
- `bench/outcomes/outcomes.jsonl` — one line per (memo, candidate, outcome) (Task 13)
- `bench/outcomes/SCHEMA.md`, `bench/outcomes/CALIBRATION-REPORT.md` — schema + published error rate (Tasks 13–14)
- `bench/outcomes/VERSION.md`, `bench/outcomes/CHANGELOG.md`, `bench/outcomes/PROVENANCE.md` — versioning (Task 16)
- `src/bench/bangkok.ts` — pure bench metrics (Spearman rank correlation, top-3 hit rate, dud rate) + dataset validation (Task 4)
- `src/bench/outcomes.ts` — outcome schema (zod), `matchTrafficBand()`, calibration-report computation (Tasks 13–14)
- `src/engine/checklist.ts` — micro-feature checklist types + zod input schema + verdict rule (Task 7)
- `src/engine/freshness.ts` — `FRESHNESS_THRESHOLD_DAYS = 90`, `MEMO_VALID_DAYS = 30`, staleness/expiry predicates (Tasks 7–9)
- `src/engine/signals.ts` — local-signals input schema (Task 17)
- `src/outcome-cli.ts` — `outcome record` / `outcome report` commands (Task 14)
- `web/src/dashboard.ts` — chain dashboard view (Task 18)
- `scripts/build-memo-index.mjs` — builds `web/src/memos-index.json` from `examples/*/result.json` + `bench/outcomes/outcomes.jsonl` (Task 18)
- `docs/calibration-procedure.md` — re-calibration procedure (Task 15)
- `web/worker/migrations/001-market-budgets.sql` — D1 migration adding the market column (Task 10)

**Modify:**
- `src/scoring/model.ts` — single unified model, `WEIGHTS_VERSION = "2.0.0-unified"`, `VN_HCMC_PROFILE` + `TH_BANGKOK_PROFILE` `MarketProfile` instances, optional `trafficScale` (Task 2)
- `src/engine/scout.ts` — consume `scoreCandidate()`; REST insufficient-data floor; `excluded` on `ScoutResult`; `placeId` on `CandidateResult["pois"]`; ghost-POI filter; checklist/signals inputs (Tasks 2, 3, 7, 9)
- `src/engine/profile.ts` — Bangkok area aliases only where the bench needs them, each documented (Task 5)
- `src/engine/render.ts` — memo v2 md + html (Task 8)
- `src/report/render.ts` — memo v2 sections on the MCP path (Task 8)
- `src/cli.ts` — `bench run --suite bangkok-coffee`, `outcome` dispatch, help text (Tasks 5, 14)
- `src/scout-cli.ts` — `--checklist` / `--signals` flags (Task 7)
- `src/agent/run.ts` — MCP path passes the market profile to `scoreCandidate()` (Task 2; call sites to be located in-task — see Task 2 note)
- `src/bench/score.ts` — only if the bench runner needs a shared helper; otherwise untouched (Task 4)
- `web/worker/index.ts` — `scopeError()` admits Bangkok; `tileInHcmc` → per-market tile scope (Task 10)
- `web/worker/budget.ts` — per-market caps + `marketOf(lat, lon)` (Task 10)
- `web/worker/schema.sql` — market column (via the migration file above) (Task 10)
- `web/src/app.ts` — `METRICS`/`WEIGHTS` updated to unified sub-scores; `exportPdf()` renders v2 sections; dashboard wiring (Tasks 2, 11, 18)
- `docs/demo-proxy.md` — Bangkok scope + per-market budget + deploy instructions (Task 10)
- `docs/assets/sample-report.pdf` — regenerated from a v2 memo (Task 11)
- `tests/scoring.test.ts`, `tests/engine.test.ts`, `tests/worker-budget.test.ts`, `tests/country-profiles.test.ts` — extended per task
- `tests/fixtures/` — new fixture entries for ghost-POI and thin-data cases (Tasks 3, 9)

---

## Phase 0 — Preflight

### Task 1: Preflight — one branch, green baseline, recorded numbers

**Files:**
- Create: `bench/bangkok-coffee/BASELINE.md`
- Modify: none (no feature code)

**Interfaces:**
- Consumes: repo at `main` @ `5778b0a`, v1.2.0
- Produces: branch `feat/sitescout-v2-upgrade`; `BASELINE.md` with the v1 numbers every later regression guard reads

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/sitescout-v2-upgrade
```

- [ ] **Step 2: Run the baseline gate and record the result**

Run: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green. If anything is red, fix it first on this branch and say so in the PR — do not build on a red baseline.

- [ ] **Step 3: Write `bench/bangkok-coffee/BASELINE.md`**

Record verbatim: REST weights `0.35 × demand + 0.25 × (1 − competition) + 0.25 × access + 0.15 × walk reach`, version `1.0.0-isoline`; MCP weights `0.30 × competition + 0.25 × complementarity + 0.25 × catchment + 0.20 × accessibility + 0 × cost`, version `0.2.0-market-aware`; HCMC address benchmark 48/55 (87%) (`bench/hcmc-addresses/RESULTS.md`, 2026-10-22); recorded run costs ~91 / ~90 / ~139 credits; recorded top scores 0.66 (Thảo Điền coffee), 0.58 (Bình Thạnh pharmacy), 0.82 (District 1 lunch); demo budget 2,400 credits/day, one live run stops at 250 credits, 180 live calls per visitor per day (`docs/demo-proxy.md`); `INSUFFICIENT_DATA_POI_FLOOR = 5` exists in `src/scoring/model.ts` only.

- [ ] **Step 4: Commit**

```bash
git add bench/bangkok-coffee/BASELINE.md
git commit -m "chore: preflight baseline for sitescout v2 on feat/sitescout-v2-upgrade"
```

---

## Phase 1 — Calibration bench (the foundation)

### Task 2: Unify the scoring models into one `2.0.0-unified` model

**Files:**
- Modify: `src/scoring/model.ts`, `src/engine/scout.ts`, `src/engine/render.ts`, `src/agent/run.ts`, `web/src/app.ts`
- Test: `tests/scoring.test.ts`, `tests/engine.test.ts`

**Interfaces:**
- Consumes: `EvidenceBundle`, `MarketProfile`, `scoreCandidate()`, `rankCandidates()`, `INSUFFICIENT_DATA_POI_FLOOR` from `src/scoring/model.ts`; `runScout()` / `ScoutResult` / `CandidateResult` from `src/engine/scout.ts`
- Produces: `VN_HCMC_PROFILE: MarketProfile`, `TH_BANGKOK_PROFILE: MarketProfile`, `WEIGHTS_VERSION = "2.0.0-unified"`; `scoreCandidate(ev, profile, evidenceRefs)` as the single scoring entry point for both paths; `CandidateResult.scores: SubScores` (the five unified factors `competition, complementarity, catchment, accessibility, cost`) and `CandidateResult.total` from that function; `trafficBandFor(total: number, profile: MarketProfile): { low: number; high: number } | null` (null while `profile.trafficScale` is unset — no invented band)

Decisions locked here (spec is silent or ambiguous — see Task 6 notes): the unified sub-score set is the MCP model's five factors; the REST model's separate `reach` factor is dropped as a weight and folded into `catchment` (POIs per km² already divides by isoline area). The interim version string is `2.0.0-unified`, not `2.0.0-calibrated` (Global Constraints). `MarketProfile` gains an optional `trafficScale: { customersPerDayAtScore1: number; bandHalfWidth: number } | null` (default `null`); the band is `[total × customersPerDayAtScore1 × (1 − bandHalfWidth), total × customersPerDayAtScore1 × (1 + bandHalfWidth)]` and is rendered only when the scale is set. The `vn-hcmc` and `th-bangkok` profiles' initial weights/scales reproduce current MCP behaviour exactly (same values as `DEFAULT_MARKET_PROFILE`); the REST path's behaviour changes by construction, so the regression guard below pins ranking order, not exact totals (spec §2.1 "score identically" cannot hold for both disagreeing v1 models — flagged in Task 6).

- [ ] **Step 1: Write the failing test in `tests/scoring.test.ts`**

```typescript
it("vn-hcmc and th-bangkok profiles reproduce the default scores exactly", () => {
  const s0 = scoreCandidate(base, DEFAULT_MARKET_PROFILE);
  expect(scoreCandidate(base, VN_HCMC_PROFILE)).toEqual(s0);
  expect(scoreCandidate(base, TH_BANGKOK_PROFILE)).toEqual(s0);
});
it("traffic band is null while the profile has no trafficScale", () => {
  expect(trafficBandFor(0.66, VN_HCMC_PROFILE)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scoring.test.ts`
Expected: FAIL with `VN_HCMC_PROFILE is not defined` / `trafficBandFor is not defined`.

- [ ] **Step 3: Implement the profiles, the interim version, and `trafficBandFor()` in `src/scoring/model.ts`**

Set `WEIGHTS_VERSION = "2.0.0-unified"`. Add `VN_HCMC_PROFILE` and `TH_BANGKOK_PROFILE` with `id` `"vn-hcmc"` / `"th-bangkok"`, weights and scales copied from `DEFAULT_MARKET_PROFILE`, `trafficScale: null`. Keep `DEFAULT_MARKET_PROFILE` and the bare-weight-vector overload of `scoreCandidate()` untouched for backward compatibility.

- [ ] **Step 4: Rewire `runScout()` in `src/engine/scout.ts` to score via `scoreCandidate()`**

Delete the step-12 min-max block (`minMax`, `WEIGHTS`, `nDemand`, `nComp`, `nReach`, `nDrive`) and the `WEIGHTS` / `WEIGHTS_VERSION = "1.0.0-isoline"` exports (update every importer). Build an `EvidenceBundle` per candidate: `competitorCount = c.competitors`, `complementaryPoiCount = c.demandTotal`, `catchmentRadiusM = plan.walkMinutes * 80` (walk speed assumption — mark `[ASSUMPTION]` in a comment), `catchmentAreaM2 = c.isolineAreaM2`, `meanAccessDurationS = meanDriveMin === null ? undefined : meanDriveMin * 60`. Select the profile from `opts.profile?.id` (`"th-bangkok"` → `TH_BANGKOK_PROFILE`, else `VN_HCMC_PROFILE`). Set `ScoutResult.weightsVersion` to the unified version and `CandidateResult.scores` to the returned `SubScores`. Keep the `why` string and `rank` assignment; update the limitations line that embeds the old version to the unified version (keep the "heuristic and not calibrated" wording until the bench lands).

- [ ] **Step 5: Update the MCP path in `src/agent/run.ts`**

Locate every `scoreCandidate()` call site (this file was not read during planning — find them, do not assume) and pass the market profile for the question's market instead of the default. No behaviour change: with the initial profiles the scores are identical.

- [ ] **Step 6: Update the renderers and the web app to the unified factors**

In `src/engine/render.ts` replace the score-formula line (`0.35·demand…`) with the unified formula and the five sub-scores; in `src/report/render.ts` the ranked table already uses the five factors — update its `WEIGHTS_VERSION` reference. In `web/src/app.ts` replace `METRICS` (`demand/competition/access/reach` with `WEIGHTS` from `scout.ts`) with the five unified factors and their profile weights; the `cost` row renders only when its weight is non-zero.

- [ ] **Step 7: Add the regression + Review Focus tests in `tests/engine.test.ts`**

Extend the existing fake-fetch `runScout` test: assert the 7 candidates rank in the same order as recorded in `BASELINE.md` for the fake city (record the order first, then pin it), each `total` in [0, 1], each `refs.length > 2`. Add: (a) out-of-scope question — a Bangkok-profile run whose anchor resolves outside the 40 km radius rejects with an error naming the market (Review Focus 1); (b) isoline failure for every candidate (fake fetch returning 404 on `/v1/isoline`) — all candidates still rank, each uses the 600 m disk area (`isolineAreaM2` equals `π × 600²` within rounding), and `limitations` contains the isoline-failure line (Review Focus 2).

- [ ] **Step 8: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green; the three recorded example reports' top scores (0.66 / 0.58 / 0.82) are NOT asserted — see Task 6.

- [ ] **Step 9: Commit**

```bash
git add src tests web/src
git commit -m "feat: unify scoring into one 2.0.0-unified model with vn-hcmc and th-bangkok profiles"
```

### Task 3: Insufficient-data floor in the REST engine + data-coverage score

**Files:**
- Modify: `src/engine/scout.ts`, `src/engine/render.ts`
- Test: `tests/engine.test.ts`, `tests/fixtures/` (thin-data fixture if the fake fetch needs one)

**Interfaces:**
- Consumes: `INSUFFICIENT_DATA_POI_FLOOR = 5` from `src/scoring/model.ts`; `CandidateResult`, `ScoutResult` from `src/engine/scout.ts`
- Produces: `ScoutResult.excluded: Array<{ id: string; label: string; reason: string; refs: number[] }>`; `CandidateResult.coverage: number` in [0, 1]; `dataCoverageScore(totalPois: number, profile: MarketProfile): number` (pure, in `src/scoring/model.ts`)

Decision: coverage = `clamp01(totalPois / (scales.competitorK + scales.complementaryK))` — POIs found vs. the expected count implied by the market profile scales (spec §1/H1.4: "expected value from the market profile scale, not invented per run"). A candidate's total POIs = `competitors + demandTotal` across all sweeps for that candidate.

- [ ] **Step 1: Write the failing test in `tests/engine.test.ts`**

```typescript
it("excludes a candidate below the POI floor instead of ranking it", async () => {
  const r = await runScout("coffee in Thảo Điền", heuristicPlan("coffee in Thảo Điền"), { api: thinDataApi() });
  expect(r.candidates.every((c) => c.competitors + c.demandTotal >= 5)).toBe(true);
  expect(r.excluded.length).toBeGreaterThan(0);
  expect(r.excluded[0].reason).toMatch(/insufficient data/i);
});
it("coverage score is 0 with no POIs and 1 at the profile expectation", () => {
  expect(dataCoverageScore(0, VN_HCMC_PROFILE)).toBe(0);
  expect(dataCoverageScore(33, VN_HCMC_PROFILE)).toBe(1); // 8 + 25
});
```

`thinDataApi()` is a variant of the existing `fakeFetch()` in the same file that returns 1 café and 0 demand POIs for one candidate's isoline. Add it in this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine.test.ts -t "insufficient data"`
Expected: FAIL — `r.excluded` is undefined / `dataCoverageScore is not defined`.

- [ ] **Step 3: Implement the floor in `src/engine/scout.ts`**

After the per-candidate POI count (step 7) and before scoring: candidates with `competitors + demandTotal < INSUFFICIENT_DATA_POI_FLOOR` move to `excluded` with reason `"insufficient data: N POIs across all sweeps (floor 5)"` and their `refs`; they never enter `scored`, never receive a rank, and never affect the winner route/drive-5 steps. Set `coverage` on every ranked candidate via `dataCoverageScore()`.

- [ ] **Step 4: Render the exclusion in `src/engine/render.ts`**

`renderMarkdown()` gains an `## Excluded — insufficient data` section (same shape as `src/report/render.ts` "Excluded from ranking") and a `Coverage` column in the shortlist table. `renderHtml()` gains the same section. The MCP path already renders exclusions — do not change it.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: insufficient-data floor (5 POIs) in the REST engine with per-candidate coverage score"
```

### Task 4: Bangkok calibration bench — dataset, runner, metrics, RESULTS.md

**Files:**
- Create: `bench/bangkok-coffee/dataset.json`, `bench/bangkok-coffee/dataset.example.json`, `bench/bangkok-coffee/COLLECTION.md`, `bench/bangkok-coffee/run.mjs`, `bench/bangkok-coffee/RESULTS.md`, `src/bench/bangkok.ts`
- Test: `tests/bench-bangkok.test.ts` (new file — vitest; name the file `tests/bangkok-bench.test.ts`)

**Interfaces:**
- Consumes: recorded engine output (a `ScoutResult`-shaped JSON fixture with candidates carrying `lat`, `lon`, `total`) + `bench/bangkok-coffee/dataset.json`
- Produces: `validateDataset(entries: unknown): { ok: boolean; errors: string[] }`, `spearmanRankCorrelation(xs: number[], ys: number[]): number`, `top3HitRate(ranked: Array<{ tier: string }>): number`, `dudRate(top3: Array<{ status: string; tier: string }>): number`, `runBench(datasetPath: string, runPath: string): BenchMetrics` in `src/bench/bangkok.ts`; `bench/bangkok-coffee/run.mjs` writes `RESULTS.md`

Decisions (spec silent — mark `[ASSUMPTION]` in code + RESULTS.md): dataset entry tier ordinal for correlation is `high = 3, medium = 2, low = 1, unknown = excluded from correlation, closed = 0`; a dataset entry matches a ranked candidate when the candidate lies within 150 m of the entry (haversine, `src/geo/grid.ts`); entries with no candidate within 150 m are reported as `unmatched` and excluded from the three metrics; top-3 hit rate = share of the top-3 ranked candidates whose matched entry is `high`/`medium`; dud rate = share of the top-3 that are `closed` or `low`. The runner is offline: it scores a recorded run, never calls Geoapify. The recorded run it scores by default is `tests/fixtures/bangkok-coffee-run.json` (synthetic, clearly marked, created in this task) until a real recorded Bangkok run exists.

- [ ] **Step 1: Write the failing test in `tests/bangkok-bench.test.ts`**

```typescript
it("rejects a dataset with fewer than 30 entries or fewer than 10 closed", () => {
  expect(validateDataset(makeEntries(29, 10)).ok).toBe(false);
  expect(validateDataset(makeEntries(30, 9)).ok).toBe(false);
  expect(validateDataset(makeEntries(30, 10)).ok).toBe(true);
});
it("rejects an invented traffic tier", () => {
  expect(validateDataset([{ ...validEntry(), traffic_tier: "booming" }]).ok).toBe(false);
});
it("computes the three metrics on the synthetic fixture", () => {
  const m = runBench("tests/fixtures/bangkok-coffee-dataset.json", "tests/fixtures/bangkok-coffee-run.json");
  expect(m.rankCorrelation).toBeGreaterThanOrEqual(-1);
  expect(m.rankCorrelation).toBeLessThanOrEqual(1);
  expect(m.top3HitRate).toBeGreaterThanOrEqual(0);
  expect(m.dudRate).toBeGreaterThanOrEqual(0);
});
```

Dataset schema (spec §1/H1.2, verbatim field names): `{ id, label, lat, lon, area, status: "open" | "closed", opened_approx, closed_approx | null, traffic_tier: "high" | "medium" | "low" | "unknown", tier_source, observed_at }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bangkok-bench.test.ts`
Expected: FAIL — module `../src/bench/bangkok.js` does not exist.

- [ ] **Step 3: Implement `src/bench/bangkok.ts`**

Pure functions only, no I/O, no network: zod schema for one entry (reuse the field list above; `observed_at` must be an ISO date string; `closed_approx` must be non-null when `status` is `"closed"`); `validateDataset()` enforces ≥30 entries, ≥10 `closed`, unique `id`s; Spearman via rank-with-average-ties; the two rates as defined above; `runBench()` reads the two JSON files (node:fs), matches entries to candidates within 150 m, returns `{ runDate, nEntries, nClosed, nMatched, rankCorrelation, top3HitRate, dudRate, unmatchedIds }`. No pass threshold is set anywhere — the first run establishes the baseline (spec §1/H1.2).

- [ ] **Step 4: Write the dataset files and the collection protocol**

`bench/bangkok-coffee/dataset.example.json`: 5 entries, first line `"EXAMPLE — not ground truth"` as a `_note` field on the file object (entries in an `entries` array — the runner accepts both `{ entries: [...] }` and a bare array). `bench/bangkok-coffee/dataset.json`: if the founder has supplied real entries, use them; otherwise copy the example file and add `"_note": "EXAMPLE — not ground truth — replace with real entries; Phase 1 gate stays open until then"`. `COLLECTION.md`: protocol from spec §1/H1.2 + A5 — public listings, owner conversations, on-foot observation; tiers are operator-observed or owner-reported, never model output; `unknown` allowed and counted; no operator-identifying fields in the public file.

- [ ] **Step 5: Write `bench/bangkok-coffee/run.mjs` following `bench/hcmc-addresses/run.mjs`**

Node script, no API calls: imports the compiled `dist/bench/bangkok.js`, runs `runBench()` on `dataset.json` + the recorded-run path passed as `argv[2]` (default `tests/fixtures/bangkok-coffee-run.json`), writes `RESULTS.md` with run date, entry counts, unmatched ids, and the three metrics, and prints the same to stdout. Create the synthetic recorded-run fixture `tests/fixtures/bangkok-coffee-run.json` (7 candidates with lat/lon/total around Thonglor, marked synthetic) in this step.

- [ ] **Step 6: Run the bench end-to-end**

Run: `npm run build && node bench/bangkok-coffee/run.mjs`
Expected: exit 0, `bench/bangkok-coffee/RESULTS.md` exists with a run date and all three metrics.

- [ ] **Step 7: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/bench tests bench/bangkok-coffee
git commit -m "feat: Bangkok calibration bench — dataset schema, offline runner, RESULTS.md"
```

### Task 5: Bench CLI wiring + Bangkok area aliases

**Files:**
- Modify: `src/cli.ts`, `src/engine/profile.ts`
- Test: `tests/country-profiles.test.ts` (existing file — confirm the name; if the alias tests live in `tests/country-profile.test.ts`, extend that one instead)

**Interfaces:**
- Consumes: `runSuite()` pattern in `src/cli.ts` (`cmdBench`); `TH_AREA_ALIASES` in `src/engine/profile.ts`
- Produces: `sitescout bench run --suite bangkok-coffee` (spawns the bench runner and prints its RESULTS.md path); documented alias additions in `TH_AREA_ALIASES`

- [ ] **Step 1: Write the failing test**

In the country-profile test file, for each alias added in Step 3, assert `TH_BANGKOK_PROFILE.areaAliases.some((a) => a.match.test("<area text>"))` is `true`. For the CLI, add a test that `cmdBench(["run", "--suite", "bangkok-coffee"])` does not throw `unknown suite` — if `cmdBench` is not exported for testing, assert via the help text containing `bangkok-coffee` instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/country-profiles.test.ts`
Expected: FAIL on the new alias assertions.

- [ ] **Step 3: Extend `TH_BANGKOK_PROFILE.areaAliases` only where the bench needs them**

Each addition gets a one-line comment naming the bench entry or area that needs it (e.g. `// bench/bangkok-coffee entry bk-014: Ari`). No speculative aliases. If the bench needs none, add none and say so in the commit message.

- [ ] **Step 4: Wire `bench run --suite bangkok-coffee` in `src/cli.ts`**

Extend `cmdBench()`: `suite === "bangkok-coffee"` spawns `node bench/bangkok-coffee/run.mjs` (same `spawnSync` pattern as the `static` command) and forwards its exit code. Update `help()` to list the suite and the spec's verification command `npm run build && node dist/cli.js bench`. Keep `vngeobench` untouched.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build && node dist/cli.js bench run --suite bangkok-coffee`
Expected: green; the bench command prints the RESULTS.md path.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: bench run --suite bangkok-coffee; Bangkok area aliases the bench needs"
```

### Task 6: Phase 1 gate — baseline run, version rule, spec-tension note

**Files:**
- Modify: `bench/bangkok-coffee/RESULTS.md` (runner output), `bench/bangkok-coffee/BASELINE.md` (append)
- Test: none new — this task verifies the phase

**Interfaces:**
- Consumes: Tasks 2–5
- Produces: a committed first baseline run; a written record of the two spec tensions for the founder

- [ ] **Step 1: Run the full gate with evidence**

Run: `npm run typecheck && npm run lint && npm test && npm run build && node dist/cli.js bench run --suite bangkok-coffee`
Expected: green; RESULTS.md committed with run date and the three metrics.

- [ ] **Step 2: Record the two spec tensions in `BASELINE.md`**

(a) Spec §2.1 acceptance ("the three recorded HCMC runs score identically to v1.2.0") cannot hold exactly for a single unified model because the two v1 models disagree — the guard applied is identical ranking order on the recorded runs and on the fake-fetch regression test (Task 2, Step 7); if the founder requires exact totals, the REST and MCP models cannot be unified and the spec needs a decision. (b) No weight value has changed in Phase 1: `WEIGHTS_VERSION` stays `2.0.0-unified`; the bump to `2.0.0-calibrated` happens only on the first bench-driven weight change, with a RESULTS.md entry. The phrase "calibrated" appears nowhere in user-facing output yet.

- [ ] **Step 3: Re-check the scope cuts (§4)**

Grep the diff for the cut list (telco, Grab/Foodpanda scraping, point-number rent/revenue, B2C acquisition, pricing, parity claims). Record the grep commands and their (empty) results in the PR description. If anything on the cut list was added, remove it before proceeding.

- [ ] **Step 4: Commit**

```bash
git add bench/bangkok-coffee
git commit -m "docs: phase 1 gate — first bench baseline run, no weight change yet"
```

---

## Phase 2 — Memo generator v2 (the product)

### Task 7: Memo v2 data model — checklist, verdict rule, freshness, expiry, bands

**Files:**
- Create: `src/engine/checklist.ts`, `src/engine/freshness.ts`
- Modify: `src/engine/scout.ts`, `src/scout-cli.ts`
- Test: `tests/engine.test.ts` (new describe block), `tests/checklist.test.ts` (new)

**Interfaces:**
- Consumes: `ScoutResult` / `CandidateResult` from `src/engine/scout.ts`; `MarketProfile.trafficScale` from Task 2
- Produces: `MicroFactor = "walkability" | "curbAppeal" | "construction" | "morningShade" | "motorcycleParking" | "alleyLighting"`; `ChecklistStatus = "VERIFIED" | "UNVERIFIED" | "N/A"`; `MicroChecklist = Record<MicroFactor, { status: ChecklistStatus; source?: string; observedAt?: string }>`; `verdictFor(checklist: MicroChecklist, rank: number): "recommend" | "verify on foot before deciding"`; `CandidateResult.checklist: MicroChecklist`, `CandidateResult.verdict`, `CandidateResult.trafficBand: { low: number; high: number } | null`, `CandidateResult.coverage` (Task 3); `ScoutResult.dataAsOf: string`, `ScoutResult.expiresAt: string`; `FRESHNESS_THRESHOLD_DAYS = 90`, `MEMO_VALID_DAYS = 30`, `isStale(asOf: string, now?: Date): boolean`, `isExpired(expiresAt: string, now?: Date): boolean` in `src/engine/freshness.ts`; CLI flags: `--checklist <file>` here; `--signals <file>` in Task 17, which owns the signals schema.

Rules (spec §1/H1.1, verbatim): a factor is VERIFIED only by a named source — a dated site visit, a dated Street View / map imagery check (capture date recorded), or operator confirmation; never inferred from POI density. UNVERIFIED is valid and publishable. A candidate with ≥2 UNVERIFIED factors in its top 3 cannot be ranked #1 with a "recommend" verdict — the memo must say "verify on foot before deciding". "Top 3" means the candidate's rank is 1–3. `alleyLighting` may be `"N/A"` (non-soi candidates); the other five factors never take `"N/A"`.

- [ ] **Step 1: Write the failing test in `tests/checklist.test.ts`**

```typescript
it("a top-3 candidate with 2+ UNVERIFIED factors cannot be recommended", () => {
  const c = allVerified();
  c.walkability.status = "UNVERIFIED";
  c.motorcycleParking.status = "UNVERIFIED";
  expect(verdictFor(c, 1)).toBe("verify on foot before deciding");
  expect(verdictFor(c, 4)).toBe("recommend");
});
it("a malformed checklist file fails loudly", () => {
  expect(() => parseChecklistFile("tests/fixtures/bad-checklist.json")).toThrow(/checklist/i);
});
it("a checklist naming an unknown candidate id fails loudly", () => {
  expect(() => applyChecklists(resultWithIds(["c1"]), { c9: allVerified() })).toThrow(/c9/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/checklist.test.ts`
Expected: FAIL — module `../src/engine/checklist.js` does not exist.

- [ ] **Step 3: Implement `src/engine/checklist.ts` and `src/engine/freshness.ts`**

zod schemas for one factor entry (`status` enum; `source` required when `status` is `"VERIFIED"`; `observedAt` an ISO date when present) and for the file shape (`{ candidates: Record<candidateId, MicroChecklist> }`). `parseChecklistFile(path)` reads + validates and throws an `Error` naming the file and the first zod issue — never returns a partial checklist. `applyChecklists(result, parsed)` throws naming any candidate id in the file that is not in the run. Absent file → every factor UNVERIFIED (no source). `verdictFor()` implements the ≥2-UNVERIFIED-in-top-3 rule; `"N/A"` never counts toward the 2. Freshness module: `FRESHNESS_THRESHOLD_DAYS = 90`, `MEMO_VALID_DAYS = 30`; `isStale(asOf, now)` is true when `now − asOf > 90 days`; `isExpired(expiresAt, now)` compares ISO dates.

- [ ] **Step 4: Wire the inputs into `runScout()` and `cmdScout()`**

`ScoutOptions` gains `checklist?: Record<string, MicroChecklist>`; `runScout()` applies it after ranking, sets `verdict` per candidate, sets `trafficBand` via `trafficBandFor()` (Task 2), sets `dataAsOf` to the run's `generatedAt` date and `expiresAt` to `dataAsOf + 30 days`. `src/scout-cli.ts` gains `--checklist <file>` (parsed with `parseChecklistFile()`; a bad file aborts the command before any API call). `as_of`/`source` per count: every count rendered in the memo carries the run's `dataAsOf` and its source string (`"Geoapify Places"` / `"Geoapify Isoline"` / `"operator-reported"` / `"observed"` — the source of the underlying call, from the trace; if `CallRecord` carries no fetch timestamp, add `fetchedAt: string` to `CallRecord` in `src/engine/geoapify.ts` in this step and use it — verify the field first, do not assume it exists).

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: memo v2 data model — micro-checklist, verdict rule, freshness, expiry, traffic bands"
```

### Task 8: Memo v2 rendering — md, html, and the MCP path

**Files:**
- Modify: `src/engine/render.ts`, `src/report/render.ts`
- Test: `tests/engine.test.ts` (snapshot-style assertions on a generated memo), `tests/report-render.test.ts` (new, or extend the existing render test if one exists — check `tests/results.test.ts` first)

**Interfaces:**
- Consumes: Task 7 types (`MicroChecklist`, verdict, `trafficBand`, `dataAsOf`, `expiresAt`, coverage, `excluded`)
- Produces: memo v2 in md + html with identical numbers, checklist, and sections across formats

Sections (spec §2.2 + §1/H1.1, H1.5, H2.1, H2.4, H3.2), in order: header with "Data as of" date + 30-day expiry notice on page one; one-page executive summary (top-3 filter workflow: the three candidates, their bands, their verdicts — forwardable by a franchise director); ranked shortlist (7 candidates, as today) with detailed comparison of the top 3; every projection as a band with explicit uncertainty — never a point number (when `trafficBand` is null, render "traffic projection unavailable — no calibration data yet", never an invented band); micro-feature checklist per candidate (six factors × status + source + date); data-coverage score per candidate; "What this model cannot see" section (the five street-level factors + construction + shade, with per-candidate verification status); per-count `as_of` + `source`; stale records flagged; "Excluded — insufficient data" section; the sentence "Visit the site before signing a lease." next to the top recommendation (moved out of Limitations); Limitations (kept, including the heuristic-weights line until calibration).

- [ ] **Step 1: Write the failing test**

```typescript
it("memo v2 renders the checklist, the band, and the expiry notice in md and html", () => {
  const md = renderMarkdown(memoV2Result());
  const html = renderHtml(memoV2Result());
  for (const out of [md, html]) {
    expect(out).toContain("What this model cannot see");
    expect(out).toContain("Data as of");
    expect(out).toContain("verify on foot before deciding");
    expect(out).toContain("Visit the site before signing a lease.");
    expect(out).not.toMatch(/calibrated/i);
  }
  expect(md).toContain("120–180"); // band fixture value, never a point projection
});
```

`memoV2Result()` is a fixture built in the test file from the fake-fetch `runScout` result plus a checklist with 2 UNVERIFIED factors on the #1 candidate. The `not.toMatch(/calibrated/i)` assertion enforces the Global Constraints ban (the version string is `2.0.0-unified`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine.test.ts -t "memo v2"`
Expected: FAIL — "What this model cannot see" absent.

- [ ] **Step 3: Implement the v2 sections in `src/engine/render.ts`**

Add the sections in the order above to `renderMarkdown()` and the same sections, same numbers, to `renderHtml()`. Keep every `[Tn]` citation; the checklist statuses cite the checklist source string (operator/visit/imagery + date), not a trace seq. The executive summary is the first section after the header. No price, no "calibrated".

- [ ] **Step 4: Mirror the sections in `src/report/render.ts` (MCP path)**

Add to `renderReport()`: executive summary, per-candidate checklist (from the same `MicroChecklist` type — the MCP path receives checklists via its own input, same file shape as Task 7), traffic band (from `trafficBandFor()`), "What this model cannot see", "Data as of" + expiry. The MCP renderer already has "Excluded from ranking" and the limitations block — keep them, update the weights line to the unified version.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green; md and html from the same result contain the same scores, bands, and checklist statuses (assert by comparing the extracted numbers in the test, not by eye).

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: memo v2 rendering — bands, checklist, blindspot section, expiry, executive summary"
```

### Task 9: Freshness on every number + ghost-POI filter

**Files:**
- Modify: `src/engine/scout.ts`, `src/engine/render.ts`
- Test: `tests/engine.test.ts`, `tests/fixtures/` (ghost-POI fixture)

**Interfaces:**
- Consumes: `GeoapifyApi.placeDetails()` (existing call, used at step 11 for the winner — verify its signature in `src/engine/geoapify.ts` in-task); `CandidateResult.pois` from `src/engine/scout.ts`
- Produces: `ScoutResult.unconfirmed: Array<{ name: string; lat: number; lon: number; category: string; reason: string; refs: number[] }>`; competitor counts that exclude unconfirmed POIs; stale flags on counts older than `FRESHNESS_THRESHOLD_DAYS`

Decisions: the ghost check runs at memo-generation time inside `runScout()` step 7, per competitor POI: `api.placeDetails({ id: placeId, features: ["details"], lang })` — a competitor that returns no result, a 404, or a `closed`/`delisted` marker is moved to `unconfirmed` with reason `"unconfirmed — verify on foot"` and removed from `competitors` and from the score inputs. To do this, `CandidateResult["pois"]` entries gain `placeId?: string` (from `Feature.properties.place_id` in `placesMulti()`). Cost note: one Place Details call per competitor POI — record the added credit cost in the PR (Place Details is 1 credit per call per `web/worker/budget.ts`). Staleness: a count is `stale` when its source data is older than 90 days — in practice the run's own data is fresh; the stale flag bites on re-rendered/recorded runs whose `dataAsOf` is older than 90 days, and on competitor records carried from an old run. The memo flags those rows.

- [ ] **Step 1: Write the failing test**

```typescript
it("moves a known-closed competitor out of the count into unconfirmed", async () => {
  const r = await runScout("coffee in Thảo Điền", heuristicPlan("coffee in Thảo Điền"), { api: ghostApi() });
  expect(r.unconfirmed.map((u) => u.name)).toContain("Ghost Cafe");
  expect(r.candidates.flatMap((c) => c.pois.map((p) => p.name))).not.toContain("Ghost Cafe");
});
it("flags counts older than 90 days as stale", () => {
  expect(isStale("2026-08-01", new Date("2026-11-22"))).toBe(true);
  expect(isStale("2026-11-01", new Date("2026-11-22"))).toBe(false);
});
```

`ghostApi()` is a `fakeFetch()` variant whose `/v2/place-details` returns a closed marker for place id `ghost-1` and whose `/v2/places` includes a competitor named "Ghost Cafe" with that place id. Add a `tests/fixtures/ghost-poi.json` entry documenting the fixture (do not call live APIs in tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine.test.ts -t "Ghost Cafe"`
Expected: FAIL — `r.unconfirmed` is undefined.

- [ ] **Step 3: Implement the ghost filter in `src/engine/scout.ts`**

Add `placeId` to the `pois` entries built in step 7. After the per-candidate POI loop, cross-check each competitor POI with `placeDetails()` (features `["details"]` only — no isochrone features, to keep it at 1 credit); on unconfirmed, push to `result.unconfirmed`, decrement the candidate's `competitors`, and drop the POI from `c.pois` before scoring. A Place Details failure (network/429) does NOT move the POI to unconfirmed — it stays counted and a limitation line is added ("ghost check incomplete for N competitors"). Never silently inflate or deflate the score.

- [ ] **Step 4: Render unconfirmed + stale flags in `src/engine/render.ts`**

`renderMarkdown()` / `renderHtml()` gain an `## Unconfirmed competitors — verify on foot` section and a `stale` marker next to any count whose `as_of` is older than 90 days. The header "Data as of" date is the run's `dataAsOf`.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: ghost-POI filter via Place Details; staleness flags on every count"
```

### Task 10: Demo proxy — Bangkok scope + per-market daily budget (prepared, NOT deployed)

**Files:**
- Create: `web/worker/migrations/001-market-budgets.sql`
- Modify: `web/worker/index.ts`, `web/worker/budget.ts`, `web/worker/schema.sql`, `docs/demo-proxy.md`
- Test: `tests/worker-budget.test.ts`

**Interfaces:**
- Consumes: `scopeError()`, `BBOX`, `tileInHcmc()`, `caps()` in `web/worker/index.ts`; `checkCaps()`, `spent()`, `DEFAULT_DAILY_CAP = 2400` in `web/worker/budget.ts`; `totals` table in `web/worker/schema.sql`
- Produces: `marketOf(lat: number, lon: number): "hcmc" | "bangkok" | null` in `web/worker/budget.ts` (pure, unit-tested); per-market caps from env `DAILY_CREDIT_CAP_HCMC` / `DAILY_CREDIT_CAP_BANGKOK`; `/api/status` reporting per-market spend

Decisions (spec silent — mark `[ASSUMPTION]`): the Bangkok demo area mirrors `TH_BANGKOK_PROFILE.boundaryCheck` — inside the Thailand national bbox `TH_BBOX` ([97.344, 5.613, 105.637, 20.465]) AND within 40 km of the Bangkok bias point [100.5018, 13.7563]. The 2,400-credit daily budget splits 1,200 / 1,200 per market by default (env-overridable); Bangkok runs cannot eat the HCMC budget and vice versa. The `totals` table gains a `market TEXT NOT NULL DEFAULT 'hcmc'` column via the migration file (D1 has no `CREATE TABLE IF NOT EXISTS` column-adding path — the migration is an `ALTER TABLE totals ADD COLUMN market TEXT NOT NULL DEFAULT 'hcmc'` plus a unique-index change; the `usage()`/`bump()` helpers take a market parameter). Tiles: `tileInHcmc()` becomes a per-market check admitting both bboxes. The 429 fallback body gains the market (`{ error, fallback: true, used, cap, market }`).

- [ ] **Step 1: Write the failing test in `tests/worker-budget.test.ts`**

```typescript
it("classifies Bangkok and HCMC points into their markets, and neither into the other", () => {
  expect(marketOf(13.7563, 100.5018)).toBe("bangkok");
  expect(marketOf(10.7769, 106.7009)).toBe("hcmc");
  expect(marketOf(1.3521, 103.8198)).toBeNull(); // Singapore: out of scope
});
it("a Bangkok run cannot spend the HCMC budget", () => {
  const u = { credits: 1200, tiles: 0, ipCalls: 0 };
  expect(checkCaps(u, { daily: 1200, perIp: 180 }).ok).toBe(false);
  expect(checkCaps({ credits: 0, tiles: 0, ipCalls: 0 }, { daily: 1200, perIp: 180 }).ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/worker-budget.test.ts`
Expected: FAIL — `marketOf is not defined`.

- [ ] **Step 3: Implement per-market budgets in `web/worker/budget.ts` and `web/worker/index.ts`**

Add `marketOf()` (pure; Bangkok = in `TH_BBOX` + < 40 km from the bias point, using the same haversine as `src/geo/grid.ts` — port the formula, do not import Node code into the Worker). Thread a market through `scopeError()` (reject coordinates outside both markets with `"coordinates outside Ho Chi Minh City and Bangkok"`), `proxyGeo()` / `proxyTile()` (cap check against the request's market cap), `usage()` / `bump()` (market parameter), and `/api/status` (per-market `spent`/`creditCap`). `caps()` reads `DAILY_CREDIT_CAP_HCMC` / `DAILY_CREDIT_CAP_BANGKOK`, each defaulting to 1200. Keep the shared 180-per-visitor cap and the 2,500-tile cap unchanged.

- [ ] **Step 4: Write the migration + deploy instructions (no deploy)**

`web/worker/migrations/001-market-budgets.sql` with the `ALTER TABLE` + a comment that it runs via `wrangler d1 execute ... --file`. Update `docs/demo-proxy.md` §3/§7 with the Bangkok scope, the 1,200/1,200 split, the new env vars, and the exact deploy commands the founder runs (`npm run demo:migrate` then `npm run demo:deploy`). Do NOT run `demo:deploy`, `demo:migrate`, or any wrangler command against the remote database.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run demo:dry-run`
Expected: green; dry-run only (builds and checks the bundle without uploading).

- [ ] **Step 6: Commit**

```bash
git add web tests docs
git commit -m "feat: demo proxy admits Bangkok with a separate per-market daily budget (deploy pending)"
```

### Task 11: PDF export to v2 + regenerated sample report

**Files:**
- Modify: `web/src/app.ts`, `docs/assets/sample-report.pdf`
- Test: manual verification only (browser print path) + existing suite

**Interfaces:**
- Consumes: `exportPdf()` in `web/src/app.ts` (builds the print DOM from `ScoutResult`); memo v2 fields from Task 7
- Produces: `exportPdf()` output containing the executive summary, checklist, "What this model cannot see", "Data as of" + expiry, and the same numbers as md/html; `docs/assets/sample-report.pdf` regenerated from a v2 memo

- [ ] **Step 1: Extend `exportPdf()` in `web/src/app.ts`**

Add to the print DOM, in the same order as Task 8: the "Data as of" + expiry line, the one-page executive summary (top 3 + bands + verdicts), the checklist table per candidate, the "What this model cannot see" section, the "Excluded — insufficient data" section. Keep the evidence table and limitations. No price, no "calibrated".

- [ ] **Step 2: Regenerate the sample report**

Generate a v2 memo for the Thảo Điền coffee question (`sitescout scout` with a checklist file if one exists for it, else all-UNVERIFIED), render its `report.html`, print to PDF from the browser, and replace `docs/assets/sample-report.pdf`. Record the exact procedure used in the commit message — the repo pins no generation procedure for this file (planning gap; do not invent a prior procedure).

- [ ] **Step 3: Verify md / html / PDF parity by inspection**

Open the regenerated `report.md`, `report.html`, and the new PDF; confirm the same scores, bands, checklist statuses, and "Data as of" date in all three. Record the check as done (with date) in the commit message — or UNVERIFIED if the browser step could not be run.

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add web/src docs/assets
git commit -m "feat: PDF export to memo v2; sample report regenerated"
```

### Task 12: Phase 2 gate — founder review of one Bangkok + one HCMC memo

**Files:**
- Modify: none (verification task; memos are evidence, not commits — unless the founder asks for the reviewed memos to be committed under `examples/`)

**Interfaces:**
- Consumes: Tasks 7–11
- Produces: a written gate record (PR description section) with the review evidence

- [ ] **Step 1: Generate the two review memos**

Run the Bangkok coffee memo and the HCMC coffee memo through `sitescout scout` (live run if a key is available, else the recorded-run path) and confirm: the thin-data memo shows the insufficient-data exclusion (H1.4); a memo with an unverified top-3 candidate shows "verify on foot", not "recommend"; no count lacks `as_of` + `source`; no projection is a point number; md/html/PDF agree.

- [ ] **Step 2: Run the full gate with evidence**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 3: Scope + copy re-check**

Grep product copy for currency amounts (`grep -rn '\$[0-9]\|€[0-9]\|[0-9] VND\|USD' src/ web/src/ --include='*.ts'`) — expect no price outside a clearly-marked pilot-test value. Grep for `calibrat` in `src/engine/render.ts`, `src/report/render.ts`, `web/src/` — expect no match in user-facing copy. Re-check the §4 cut list against the Phase 2 diff.

- [ ] **Step 4: Commit (only if a file changed; otherwise record the gate in the PR description)**

```bash
git status --short
```

---

## Phase 3 — Ground-truth feedback loop (the moat)

### Task 13: Outcomes dataset + schema

**Files:**
- Create: `bench/outcomes/outcomes.jsonl`, `bench/outcomes/SCHEMA.md`, `src/bench/outcomes.ts`
- Test: `tests/outcomes.test.ts` (new)

**Interfaces:**
- Consumes: memo ids + traffic bands from `examples/<id>/result.json` (Task 7 fields)
- Produces: `OutcomeSchema` (zod), `parseOutcomeLine(line: string): Outcome`, `Outcome` type; `bench/outcomes/outcomes.jsonl` (one line per outcome); `SCHEMA.md`

Schema (spec §2.3): one line per `(memo id, candidate, decision, actual traffic tier/counts, observed_at, source)`. Fields: `{ memoId, candidateId, candidateLabel?, decision: "signed" | "opened" | "passed", actualDailyCustomersMean: number | null, actualTrafficTier: "high" | "medium" | "low" | null, measurementMethod: "customer-counts" | "pos-transactions", projectedLow: number, projectedHigh: number, observedAt: string (ISO date), source: string }`. Rules: `measurementMethod` is required — no outcome is recorded without it; `actualDailyCustomersMean` and `actualTrafficTier` may both be null only when `decision` is `"signed"` (lease signed, shop not open yet — counts as a signed-lease proof element, not a traffic-match proof point, spec §3.2); `projectedLow`/`projectedHigh` are copied from the memo's band at record time so the outcomes file is self-contained.

- [ ] **Step 1: Write the failing test in `tests/outcomes.test.ts`**

```typescript
it("rejects an outcome without a measurement method", () => {
  expect(() => parseOutcomeLine(JSON.stringify({ ...validOutcome(), measurementMethod: undefined }))).toThrow(/measurementMethod/);
});
it("accepts a signed-lease outcome with no traffic yet", () => {
  expect(parseOutcomeLine(JSON.stringify(signedOnlyOutcome())).decision).toBe("signed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/outcomes.test.ts`
Expected: FAIL — module `../src/bench/outcomes.js` does not exist.

- [ ] **Step 3: Implement `src/bench/outcomes.ts` + `SCHEMA.md`**

zod schema with the fields and rules above; `parseOutcomeLine()` throws naming the field. `SCHEMA.md` documents every field, the two measurement methods (never mixed across pilots), and the signed-vs-traffic-match distinction from spec §3.2.

- [ ] **Step 4: Create `bench/outcomes/outcomes.jsonl`**

One synthetic-but-clearly-marked example line (`"_example": true`, memo id `example-memo`, never presented as evidence) so the loop is demonstrable end-to-end. The example is deleted before any pilot (Task 15 records this as a pre-pilot step).

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/bench tests bench/outcomes
git commit -m "feat: outcomes dataset schema + one clearly-marked example line"
```

### Task 14: Outcome record CLI + calibration report

**Files:**
- Create: `src/outcome-cli.ts`
- Modify: `src/cli.ts`
- Test: `tests/outcomes.test.ts`

**Interfaces:**
- Consumes: `OutcomeSchema`, `parseOutcomeLine()` from Task 13; `trafficBandFor()` semantics from Task 2
- Produces: `sitescout outcome record --memo <id> --candidate <id> --decision <signed|opened|passed> --method <customer-counts|pos-transactions> --band-low <n> --band-high <n> [--actual-mean <n>] [--tier <high|medium|low>] [--observed-at <date>] [--source <text>]`; `sitescout outcome report [--out bench/outcomes/CALIBRATION-REPORT.md]`; `matchTrafficBand(low: number, high: number, actualMean: number): boolean` (pure, in `src/bench/outcomes.ts`)

Match rule (spec §3.2, verbatim): actual 30-day mean falls within the memo's projected band widened by ±20% — within `[low × 0.8, high × 1.2]`. The calibration report publishes, for every outcome on file: memo id, candidate, decision, projected band, actual mean, method, and match true/false, plus the aggregate error rate (share within ±20%). Command names are fixed by this plan — the spec left them "to be proposed in the phase PR".

- [ ] **Step 1: Write the failing test in `tests/outcomes.test.ts`**

```typescript
it("the ±20% match rule widens the band, it does not widen the actual", () => {
  expect(matchTrafficBand(120, 180, 144)).toBe(true);   // inside [96, 216]
  expect(matchTrafficBand(120, 180, 95)).toBe(false);   // below 120 × 0.8
  expect(matchTrafficBand(120, 180, 217)).toBe(false);  // above 180 × 1.2
});
it("record refuses an outcome for a memo with no band on file", () => {
  expect(() => recordOutcome({ memoId: "no-such-memo", bandLow: 0, bandHigh: 0 })).toThrow(/no-such-memo/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/outcomes.test.ts -t "match rule"`
Expected: FAIL — `matchTrafficBand is not defined`.

- [ ] **Step 3: Implement `matchTrafficBand()` + the report computation in `src/bench/outcomes.ts`**

Pure functions; the report function takes parsed outcomes and returns the per-outcome rows + aggregate share. No I/O in this module.

- [ ] **Step 4: Implement `src/outcome-cli.ts` and wire it in `src/cli.ts`**

`outcome record`: validates flags with the zod schema; refuses when the memo id has no matching memo on file (checks `examples/<memoId>/result.json` exists OR the band flags were supplied from a memo the implementer can cite — the refusal rule: without `--band-low`/`--band-high` AND without a matching `result.json`, refuse; Review Focus 4). Appends exactly one JSONL line to `bench/outcomes/outcomes.jsonl`. `outcome report`: reads the file, computes the report, writes `bench/outcomes/CALIBRATION-REPORT.md` (default path) and prints the aggregate. Update `help()` in `src/cli.ts` with both commands. Follow the existing CLI pattern in `src/scout-cli.ts` (flag parsing via the local `flag()` helper).

- [ ] **Step 5: Run the loop end-to-end**

Run: `npm run build && node dist/cli.js outcome record --memo example-memo --candidate c1 --decision opened --method customer-counts --band-low 120 --band-high 180 --actual-mean 144 --observed-at 2026-11-22 --source "operator report" && node dist/cli.js outcome report`
Expected: exit 0; `CALIBRATION-REPORT.md` shows the example outcome and a match of true. Then revert the appended line (the example line from Task 13 stays the only example; do not leave a duplicate).

- [ ] **Step 6: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src tests bench/outcomes
git commit -m "feat: outcome record + calibration report CLI (±20% match rule)"
```

### Task 15: Re-calibration procedure doc + Phase 3 gate

**Files:**
- Create: `docs/calibration-procedure.md`
- Modify: none

**Interfaces:**
- Consumes: Tasks 13–14, spec §2.3 work item 4
- Produces: the procedure doc; the Phase 3 gate record

- [ ] **Step 1: Write `docs/calibration-procedure.md`**

How an outcome batch moves weights/scales (propose the change with the bench numbers attached, never silently); who approves (founder); version bump rule (every calibration change bumps `WEIGHTS_VERSION` and writes a RESULTS.md entry); the pre-pilot step (delete the synthetic example outcome line from `bench/outcomes/outcomes.jsonl` before any real pilot — never present it as evidence); the rule that different measurement methods are never mixed in one aggregate.

- [ ] **Step 2: Run the full gate with evidence**

Run: `npm run typecheck && npm run lint && npm test && npm run build && node dist/cli.js outcome report`
Expected: green; the report shows the example outcome end-to-end (record → stored → shown).

- [ ] **Step 3: Scope re-check (§4) + commit**

```bash
git add docs bench/outcomes
git commit -m "docs: re-calibration procedure; phase 3 gate"
```

---

## Phase 4 — Data-edge layer (the proprietary part)

### Task 16: Version + package the owned datasets

**Files:**
- Create: `bench/bangkok-coffee/VERSION.md`, `bench/bangkok-coffee/CHANGELOG.md`, `bench/bangkok-coffee/PROVENANCE.md`, `bench/outcomes/VERSION.md`, `bench/outcomes/CHANGELOG.md`, `bench/outcomes/PROVENANCE.md`
- Modify: none (docs only)

**Interfaces:**
- Consumes: `bench/bangkok-coffee/dataset.json`, `bench/outcomes/outcomes.jsonl`
- Produces: version files (`version`, `date`, `entry count`, `changes since last version`); provenance notes ("how this was collected", per spec §2.4)

- [ ] **Step 1: Write the version + provenance files**

`VERSION.md` per dataset: `version: 1.0.0`, date, entry count (counted from the file, not asserted from memory), and the rule that a version bumps on every entry batch. `CHANGELOG.md`: one entry per version. `PROVENANCE.md`: collection method (founder: public listings, owner conversations, on-foot observation), the "no invented tiers" rule, and the confidentiality rule — operator-identifying rows stay out of the public repo unless the operator consents in writing (spec §2.4 / §3.4); the schema has no operator-name/contact fields, so a row cannot carry them by accident.

- [ ] **Step 2: Verify the confidentiality rule by grep**

Run: `grep -rn "operatorName\|operator_name\|contact\|phone\|email" bench/bangkok-coffee/dataset.json bench/outcomes/outcomes.jsonl`
Expected: no matches (the example outcome's `source` field is a free-text description, not a contact — keep it that way).

- [ ] **Step 3: Commit**

```bash
git add bench/bangkok-coffee bench/outcomes
git commit -m "docs: versioned datasets with provenance notes"
```

### Task 17: Local-signals intake (human-observed / operator-reported only) + Phase 4 gate

**Files:**
- Create: `src/engine/signals.ts`
- Modify: `src/engine/scout.ts`, `src/scout-cli.ts`, `src/engine/render.ts`
- Test: `tests/engine.test.ts` (signals describe block)

**Interfaces:**
- Consumes: `ScoutResult` / `CandidateResult` from `src/engine/scout.ts`
- Produces: `LocalSignal = { kind: "delivery-presence" | "new-competitor" | "closure"; street: string; observedBy: string; observedAt: string; note?: string }`; zod schema in `src/engine/signals.ts`; `--signals <file>` flag on `sitescout scout`; memo rendering of signals with observer + date; `ScoutResult.signals: LocalSignal[]`

- [ ] **Step 1: Write the failing test**

```typescript
it("renders an operator-reported signal with observer and date", () => {
  const md = renderMarkdown(resultWithSignal({ kind: "closure", street: "Soi 55", observedBy: "operator", observedAt: "2026-11-20" }));
  expect(md).toContain("Soi 55");
  expect(md).toContain("2026-11-20");
});
it("rejects a signal without observer or date", () => {
  expect(() => parseSignalsFile("tests/fixtures/bad-signals.json")).toThrow(/observedBy|observedAt/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine.test.ts -t "operator-reported signal"`
Expected: FAIL — `parseSignalsFile is not defined`.

- [ ] **Step 3: Implement `src/engine/signals.ts` + wire `--signals`**

zod schema (kind enum above; `observedBy` and `observedAt` required; `street` required). `parseSignalsFile()` throws naming the file and the first issue. `ScoutOptions` gains `signals?: LocalSignal[]`; `runScout()` attaches them to the result; `cmdScout()` gains `--signals <file>`.

- [ ] **Step 4: Render signals in the memo**

`renderMarkdown()` / `renderHtml()` gain a `## Local signals (operator-reported)` section: one row per signal (kind, street, observer, date, note). Signals never alter a score — they are displayed evidence only (spec §2.4: "local signals" means operator-reported inputs only).

- [ ] **Step 5: Prove no scraping code exists + run the gate**

Run: `grep -rn -i "grab\|foodpanda\|telco" src/ web/worker/ web/src/ || true`
Expected: matches only in docs/comments stating the rule (this plan's Task 17 comment + spec references) — no fetching, scraping, or SDK code. Then run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: operator-reported local signals intake + memo rendering; phase 4 gate"
```

---

## Phase 5 — Chain dashboard (the subscription product)

### Task 18: Chain dashboard — pipeline view + metering hooks

**Files:**
- Create: `web/src/dashboard.ts`, `scripts/build-memo-index.mjs`
- Modify: `web/src/app.ts`
- Test: `tests/dashboard.test.ts` (new — vitest, tests the index builder + status derivation as pure functions; if the builder is `.mjs`, test it via `node --test`? No — put the pure logic in `scripts/build-memo-index.mjs` as exported functions and import it in the vitest file, same pattern as `bench/hcmc-addresses/run.mjs` being plain node)

**Interfaces:**
- Consumes: `examples/*/result.json` (memo id, city/market, business, candidates, verdicts, bands), `bench/outcomes/outcomes.jsonl` (decisions + actuals)
- Produces: `web/src/memos-index.json` (generated, committed): `{ generatedAt, memos: Array<{ memoId, market, business, status, topCandidate, band, outcome? }>, metering: { memosGenerated, marketsUsed, outcomesRecorded } }`; `renderDashboard(index): string` in `web/src/dashboard.ts`

Status derivation (spec §2.5: `draft / delivered / decided / outcome-recorded`): `delivered` when a memo exists; `decided` when an outcome line exists for the memo with a `decision`; `outcome-recorded` when that outcome also carries actual traffic (`actualDailyCustomersMean` or `actualTrafficTier` non-null). `draft` is a valid status in the type but no v2 source produces it — record that in the index file's `_note`. Metering (spec §2.5/H3.3: hooks for future pricing, not pricing itself): aggregate counts only — `memosGenerated`, `marketsUsed`, `outcomesRecorded`. Per-account metering is NOT built: v2 has no accounts or auth, so there is no account key to meter by; the index schema reserves `accountId: string | null` (always null in v2) for the later pricing work. No price is displayed anywhere.

- [ ] **Step 1: Write the failing test in `tests/dashboard.test.ts`**

```typescript
it("derives decided then outcome-recorded from the outcomes file", () => {
  const idx = buildMemoIndex([memoFixture()], [signedOutcome(), openedOutcome()]);
  expect(idx.memos.find((m) => m.memoId === "signed-only")!.status).toBe("decided");
  expect(idx.memos.find((m) => m.memoId === "opened")!.status).toBe("outcome-recorded");
});
it("renders an empty state when the index has no memos", () => {
  expect(renderDashboard({ generatedAt: "", memos: [], metering: { memosGenerated: 0, marketsUsed: [], outcomesRecorded: 0 } })).toContain("No memos yet");
});
it("renders an outcome whose memo is missing from the index as an unknown-memo row", () => {
  const html = renderDashboard(indexWithOrphanOutcome());
  expect(html).toContain("unknown memo");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard.test.ts`
Expected: FAIL — module `../web/src/dashboard.js` / `../scripts/build-memo-index.mjs` does not exist.

- [ ] **Step 3: Implement `scripts/build-memo-index.mjs` + `web/src/dashboard.ts`**

The script reads `examples/*/result.json` + `bench/outcomes/outcomes.jsonl`, derives statuses per the rules above, computes metering, writes `web/src/memos-index.json` (with `_note` explaining `draft` and the null `accountId`). `dashboard.ts` exports `renderDashboard(index)` — a read-only pipeline view: every memo (city, business type, status, top-3 filter workflow per decision, lease decisions and their outcomes, calibration status of each market from `bench/bangkok-coffee/RESULTS.md` values passed in as `calibration: { market, version, runDate }`). No in-dashboard editing of memos (spec §2.5).

- [ ] **Step 4: Wire the dashboard into `web/src/app.ts`**

Add a dashboard view (route/tab alongside Ranking/Compare/Evidence — follow the existing tab pattern) that fetches `memos-index.json` and calls `renderDashboard()`. The dashboard lists memos from the committed index (recorded runs), not live data.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build && node scripts/build-memo-index.mjs`
Expected: green; the generated index matches the fixtures' expectations.

- [ ] **Step 6: Commit**

```bash
git add web scripts tests
git commit -m "feat: chain dashboard — memo pipeline, statuses, metering hooks (read-only)"
```

### Task 19: Chain-facing copy + final PR (one PR, no merge)

**Files:**
- Modify: `web/src/app.ts`, `web/src/dashboard.ts`, `src/engine/render.ts` (copy only)
- Test: existing suite (copy assertions)

**Interfaces:**
- Consumes: Tasks 1–18
- Produces: the single PR `feat/sitescout-v2-upgrade` with per-phase sections, bench numbers, and verification commands

- [ ] **Step 1: Apply the positioning copy**

Chain-facing copy (memo executive summary, dashboard header, pilot letter template reference in docs) uses "Placer.ai for Southeast Asia" consistently. Add a test asserting no parity claim appears:

```typescript
it("chain-facing copy never claims parity with Placer.ai or Buxton", () => {
  const copy = [renderDashboard(sampleIndex()), renderMarkdown(memoV2Result())].join("\n");
  expect(copy).not.toMatch(/as accurate as|same (data|features) as|parity with/i);
  expect(copy).toMatch(/Placer\.ai for Southeast Asia/);
});
```

- [ ] **Step 2: Run the final full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build && node dist/cli.js bench run --suite bangkok-coffee && node dist/cli.js outcome report`
Expected: all green; bench RESULTS.md and CALIBRATION-REPORT.md current.

- [ ] **Step 3: Re-check every scope cut and every §6 definition-of-done item**

Check off spec §6 items 1–7 against evidence (unified model + profiles; bench RESULTS.md published; memo v2 in md/html/PDF; loop recorded ≥1 outcome end-to-end; versioned datasets, no scraping code; dashboard renders pipeline; CI green, PR unmerged). Item 8 (first pilot conversation started) is the founder's work — mark it as such, not as done. Re-run the §4 cut grep from Task 6.

- [ ] **Step 4: Push the branch and open the ONE PR (do not merge)**

```bash
git push -u origin feat/sitescout-v2-upgrade
```

PR body: what changed per phase, the bench numbers (rank correlation, top-3 hit rate, dud rate), the calibration-report aggregate, and the verification commands run. The founder merges. The Worker change from Task 10 is listed in the PR as "prepared, NOT deployed — founder deploys".

---

## Self-review (run by the plan writer, 2026-11-22)

1. **Spec coverage.** §0 (ground truth) → Task 1 baseline. H0 (value prop) → no feature, memo quality via Tasks 7–8. H1.1 checklist → Task 7 (+ render Task 8). H1.2 bench → Task 4 (+ CLI Task 5). H1.3 unification → Task 2. H1.4 floor → Task 3. H1.5 blindspot → Task 8. H2.1 freshness → Tasks 7 + 9. H2.2 ghost filter → Task 9. H2.3 feedback loop → Tasks 13–14. H2.4 expiry → Task 7 (+ render Task 8). H3.1 B2B-first → enforced by §4 re-checks at every gate (Tasks 6, 12, 15, 17, 19); no B2C feature exists in any task. H3.2 memo as sales asset → Tasks 8 + 18. H3.3 pricing not set → Global Constraints + Task 12 grep + Task 18 metering-without-price. H4.1 pilots → §3 is founder's work; product enablers are Tasks 7, 13–14, 18. H4.2 data edge → Tasks 16–17. H4.3 positioning → Task 19. §2.0 preflight → Task 1. §2.1–2.5 → Phases 1–5. §2.6 gates → folded into Tasks 6, 12, 15, 17, 19. §3 pilot protocol → referenced, not built (founder's work; the ±20% definition is implemented in Task 14). §4 cuts → Global Constraints + gate re-checks. §5 assumptions → marked `[ASSUMPTION]` where the plan adds values (walk speed 80 m/min, 150 m match radius, tier ordinals, 1,200/1,200 split, interim version string). §6 done → Task 19 Step 3. Gaps found during review: (a) the "score identically" tension — recorded in Task 6, guard is ranking order; (b) the traffic-band source — resolved as optional `trafficScale`, null until calibration sets it, memo renders "unavailable" rather than inventing a band; (c) per-account metering has no accounts to key on — aggregate metering + reserved `accountId: null`, recorded in Task 18.
2. **Step scan.** Fixed during writing: the `--signals` flag was initially assigned to Task 7 and moved to its owning Task 17; the Phase 2 gate's "commit" step was changed to a status check since a pure-verification task may change no file; `cmdBench`'s test was changed from calling an unexported function to asserting on help text.
3. **Type consistency.** `SubScores` (five factors) is used identically in Tasks 2, 3, 8; `MarketProfile` gains `trafficScale` in Task 2 and every later task reads that spelling; `MicroChecklist` / `verdictFor` / `FRESHNESS_THRESHOLD_DAYS` / `MEMO_VALID_DAYS` are defined once in Task 7 and reused in Tasks 8–9; `matchTrafficBand(low, high, actual)` keeps one argument order in Tasks 13–14; status strings `draft / delivered / decided / outcome-recorded` are spelled identically in Tasks 13 and 18.
4. **Review Focus.** Five classes listed above; each has its test added to the owning task (Tasks 2, 2, 7, 14, 18).
5. **Proportion.** Spec is 400 lines; this plan is longer because it pins exact files, signatures, and test assertions for five phases across two engines, a Worker, and a web app — but no step carries a function body the signature and tests already determine, and algorithms appear only where the spec leaves a choice (coverage formula, band formula, match radius, status derivation). No transcript sections remain.
