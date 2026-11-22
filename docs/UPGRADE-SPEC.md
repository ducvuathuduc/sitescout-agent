# SiteScout v2 — Upgrade Spec: Closing Every Hole in Poke's 22/11 Review

- **Status:** Draft for Devin Bot execution. Not approved until the founder signs off on §5 (assumptions) and §4 (scope cuts).
- **Date:** 2026-11-22
- **Repo:** `github.com/ducvuathuduc/sitescout-agent` (public, `main`, HEAD `5778b0a`, PR #8 `feat/bangkok-expansion` merged). Version 1.2.0.
- **Live demo:** `https://sitescout.huynhthanh.workers.dev`
- **Source of this spec:** Poke's (Devin/Cognition) iMessage review of SiteScout, 22/11/2026 — the "good", the three hard parts, and the investable bar — plus a line-by-line read of the live repo at the commit above. Every repo claim below cites a file. Nothing in this spec invents a metric, a price, or a validation result.
- **How to read it:** `[ASSUMPTION]` marks anything not yet measured or agreed. `[POKE]` marks a claim that comes from Poke's review, not from our data. `[GROUNDED]` marks a claim verified against the repo in this session. If a line has no marker, it is a decision this spec makes — challenge it in review.

## 0. Ground truth: what v1.2.0 actually is

Read this first. Half of Poke's risks exist because v1 is honest about its limits, and the other half exist because two parts of v1 disagree with each other.

### 0.1 What the engine does today [GROUNDED]

- Ask a question in English or Vietnamese; the engine resolves the area (Autocomplete, Geocoding, Boundaries), samples candidate points, draws walking isolines, counts competitors and demand places inside the catchments, measures drive times with Route Matrix, scores candidates, and writes a report + trace. (`README.md`, `src/engine/scout.ts`)
- The deliverable ("memo" v1) is `report.md` + `report.html` + `result.json` + `trace.jsonl` + `map.jpg`, with sections: Plan, Ranked shortlist, Why each site ranks, Limitations, Evidence trace. (`examples/thaodien-coffee/report.md`)
- Recorded runs (2026-10-22): 7 candidates per question; top site scores 0.66 (Thảo Điền coffee), 0.58 (Bình Thạnh pharmacy), 0.82 (District 1 lunch). Scores are normalized **within a run** and compare its candidates only.
- Measured Geoapify cost per run under the corrected credit rules: ~91, ~90, ~139 credits for the three recorded runs. (`README.md`)
- Demo proxy budget: 2,400 credits/day shared between API calls and tiles; one live run stops at 250 credits; 180 live calls per visitor per day. Geoapify free plan is 3,000 credits/day. (`docs/demo-proxy.md`)
- Address benchmark (HCMC, 55 queries, independent Wikidata coordinates): `resolvePlace` v1.1 within tolerance 48/55 (87%). This measures **coordinate matching**, not store performance. (`bench/hcmc-addresses/RESULTS.md`)
- VN-GeoBench (`bench/vngeobench/`) scores **tool behaviour** against expected sequences. It is not an accuracy result.
- The repo has zero payment / monetization code. No Stripe, no checkout, no subscription, no paywall. Monetization is currently $0 built. (grep over `src/`, `web/worker/`)

### 0.2 The two scoring models disagree — fix this first

There are **two** scoring models in the repo, with different weights, different factors, and different version strings:

| | REST engine (`src/engine/scout.ts`) | MCP/agent model (`src/scoring/model.ts`) |
|---|---|---|
| Score | `0.35 × demand + 0.25 × (1 − competition) + 0.25 × access + 0.15 × walk reach` | `0.30 × competition + 0.25 × complementarity + 0.25 × catchment + 0.20 × accessibility + 0 × cost` |
| Version | `1.0.0-isoline` (`WEIGHTS_VERSION`, line 32) | `0.2.0-market-aware` |
| Status | Heuristic, uncalibrated (line 433 embeds this warning in every report) | "v0 heuristics, to be calibrated against smoke-test evidence once a Geoapify API key is available" (header comment) |

A `MarketProfile` interface exists (`src/scoring/model.ts`, line 89: per-market weights + normalizer scales), but only **one** instance exists: `DEFAULT_MARKET_PROFILE` (id `"default"`). There is no `vn-hcmc` profile and no `th-bangkok` profile. The "MarketProfile refactor" in the Devin for Startups application means: finish this — one model, per-market instances, weights set by bench evidence.

### 0.3 Correction: the "Bangkok calibration" is a profile, not a calibration

This matters because the pitch leans on it. What exists for Bangkok [GROUNDED]:

- `TH_BANGKOK_PROFILE` in `src/engine/profile.ts` (line 169): geocoder profile — bias point, area aliases (Thonglor, Sukhumvit, Silom, Siam), 40 km boundary radius, Thai/English planner prompt. It makes Bangkok *answerable*, not *calibrated*.
- Country registry `src/geo/profiles/registry.ts`: SG / VN / TH / MY / ID / PH, bbox detection only, with documented misclassifications (e.g. Johor Bahru resolves to SG).
- One VN-GeoBench question (`geobench-11`): coffee in Thonglor/Sukhumvit, testing tool behaviour only.

What does **not** exist: any dataset of real Bangkok (or HCMC) shops with known outcomes, any measurement of the scorer against store performance, any foot-traffic or revenue data anywhere in the engine. `bench/` contains only `hcmc-addresses/` and `vngeobench/`. **Phase 1 of this spec builds the calibration bench from zero. Until it exists, no claim of "calibrated" may appear in any memo, pitch, or application.**

### 0.4 What v1 does not do — the README's own Limits section [GROUNDED]

Verbatim substance from `README.md` → Limits, plus the memo's Limitations section (`examples/thaodien-coffee/report.md`):

- Does not measure foot traffic, rent, revenue, or reliable opening hours.
- Candidate points are places to investigate, not confirmed available premises.
- Scoring weights are heuristic and have not been calibrated against store outcomes.
- POI coverage varies by street and can miss businesses in alleys. Counts are relative signals, not market sizes.
- Question packs and the public demo proxy cover Ho Chi Minh City only. The Worker (`web/worker/index.ts`, `scopeError`) rejects coordinates outside a Greater HCMC bounding box. Bangkok is **not** servable from the public demo today.
- Every number in a report must cite a trace entry; the memo already states "Decision support only — visit the site before signing a lease."

These limits are the spec's starting line, not a footnote. Poke's three hard parts map onto them almost exactly.

---

## 1. Hole-by-hole fix plan

Each row: Poke's risk → the exact v2 change → acceptance criteria → how it is verified. "Verified by" is a command, a bench number, or pilot evidence — never a claim in a doc.

### H0 — The good, part 1: location failure is real and expensive [POKE]

> "If you save someone from a $50k mistake, charging $500 to $2k for a report is an easy sell."

- **What v2 does with it:** this is the value proposition, not a feature. It only holds if the memo is decision-grade. The fixes in H1–H2 are what make the price defensible. No v2 feature is built "because Poke said $500–$2k" — the price itself is **not** set in v2 (see H3.3).
- **Acceptance:** the v2 memo can state, with evidence, what it checked, what it could not check, and how stale its data is. If it cannot, it must say so on page one.
- **Verified by:** Phase 2 acceptance tests (§2.2).

### H0 — The good, part 2: chains pay for geospatial intelligence [POKE]

> "Chains and franchises have real budget. Enterprise franchise ops pay big money for geospatial intelligence (like Buxton or Placer.ai in the US)."

- **What v2 does with it:** B2B-first positioning (H3) and the chain dashboard (Phase 5). The product is positioned as "Placer.ai for Southeast Asia" for regional franchise directors — that positioning is adopted in §3.3, and every v2 feature is judged against whether a franchise director would pay for it.
- **Acceptance:** a franchise director can look at the chain dashboard and see their whole expansion pipeline; a single memo can be read by a non-technical operator in under 5 minutes. [ASSUMPTION: "under 5 minutes" is a usability target set by this spec, not a measured result.]
- **Verified by:** pilot interviews in §3 (ask operators directly; record the answer).

### H1 — Hard part 1: the "soi" problem (hyper-local micro-geography) [POKE]

> "In Bangkok or HCMC, 50 meters changes everything. A spot on Sukhumvit vs 20 steps down an unlit soi with no motorcycle parking is the difference between $1k/day and going bankrupt. Global geo APIs only see broad coordinates and rough POI density; they don't see street walkability, curb appeal, construction, or which side of the street gets morning shade. If your model recommends a dud because of micro-blindspots, word travels fast."

The model is blind to exactly the five factors Poke names. v2 does not pretend otherwise. It does three things: measure what it can, verify the rest by hand, and say so in the memo.

**H1.1 — Micro-feature checklist in the memo (Phase 2).**
Every candidate in a v2 memo carries a street-level checklist, one row per factor, each with a status:

| Factor | Statuses allowed |
|---|---|
| Walkability of the approach (pavement, crossing, slope) | VERIFIED / UNVERIFIED |
| Curb appeal (visibility from the street, signage line-of-sight) | VERIFIED / UNVERIFIED |
| Active construction on the street/block | VERIFIED / UNVERIFIED |
| Morning-shade side of the street | VERIFIED / UNVERIFIED |
| Motorcycle parking within 50 m | VERIFIED / UNVERIFIED |
| Alley lighting after dark (soi candidates) | VERIFIED / UNVERIFIED / N/A |

- Rules: a factor is VERIFIED only by a named source — a dated site visit by the operator, a dated Street View / map imagery check (with capture date recorded), or operator confirmation. It is never inferred from POI density. UNVERIFIED is a valid, publishable state. A candidate with ≥2 UNVERIFIED factors in its top 3 cannot be ranked #1 with a "recommend" verdict; the memo must say "verify on foot before deciding".
- **Acceptance:** every v2 memo renders the checklist for every ranked candidate; no candidate ships with a factor silently missing.
- **Verified by:** `npm test` (checklist rendering + verdict rule), plus a manual review of one Bangkok and one HCMC memo.

**H1.2 — Street-level calibration bench (Phase 1).**
Build `bench/bangkok-coffee/`: a ground-truth dataset of real Bangkok coffee-shop locations with known outcomes, and a runner that scores the engine's ranking against it. This is the single most important build in v2 — it is what turns "heuristic weights" into "calibrated weights".
- Dataset schema (new file `bench/bangkok-coffee/dataset.json`): each entry = `{ id, label, lat, lon, area, status: open | closed, opened_approx, closed_approx | null, traffic_tier: high | medium | low | unknown, tier_source, observed_at }`. `traffic_tier` is an operator-observed or owner-reported tier, never a model output. [ASSUMPTION: traffic tiers will be collected by the founder from public listings, owner conversations, and on-foot observation. No tier may be invented; `unknown` is allowed and counted.]
- Bench metrics (reported in `bench/bangkok-coffee/RESULTS.md`): rank correlation between engine score and traffic tier; top-3 hit rate (share of top-3 ranked candidates that are `high`/`medium` tier); dud rate (share of top-3 that are `closed` or `low`). No pass threshold is set in this spec — the first run establishes the baseline, and the threshold is set from the baseline in review. [ASSUMPTION: a first baseline run is the deliverable; the bar is set after seeing it, not before.]
- **Acceptance:** dataset ≥30 entries with ≥10 `closed` (failures teach more than successes) [ASSUMPTION: 30 is the minimum viable size set by this spec; larger is better]; runner executes end-to-end offline against recorded evidence; RESULTS.md is committed with the run date.
- **Verified by:** `npm run build && node dist/cli.js bench` (command name to be added in Phase 1; must be documented in the phase PR) + RESULTS.md in the repo.

**H1.3 — One scoring model, per-market profiles (Phase 1).**
- Merge the REST model (`1.0.0-isoline`) and the MCP model (`0.2.0-market-aware`) into a single versioned model `2.0.0-calibrated`, implemented once in `src/scoring/model.ts` and consumed by both `src/engine/scout.ts` and the MCP path.
- Add real `MarketProfile` instances: `vn-hcmc` and `th-bangkok` (weights + scales). Their initial values reproduce current behaviour exactly (no silent change); calibration (H1.2) then moves them, with a version bump on every change.
- **Acceptance:** `npm test` passes with identical scores on the three recorded HCMC runs before calibration; after calibration, weights change only with a RESULTS.md entry and a version bump.
- **Verified by:** existing `tests/scoring.test.ts` + `tests/engine.test.ts` (extended), CI green.

**H1.4 — Dud-guard: the insufficient-data floor in both engines (Phase 1).**
- The MCP model already has it: `INSUFFICIENT_DATA_POI_FLOOR = 5` — a candidate with fewer than 5 POIs across all sweeps is flagged `insufficient-data` and EXCLUDED from ranking ("no data must never read as no competition"). The REST engine has no equivalent. Add it to `src/engine/scout.ts` with the same semantics.
- The memo shows a **data-coverage score per candidate** (POIs found vs. expected for the area — expected value from the market profile scale, not invented per run).
- **Acceptance:** a candidate below the floor never appears in a ranked list; it appears in a separate "excluded — insufficient data" section with the reason.
- **Verified by:** unit tests in `tests/scoring.test.ts` + `tests/engine.test.ts`; a memo generated from a thin-data area shows the exclusion.

**H1.5 — Micro-blindspot disclosure (Phase 2).**
- Every v2 memo has a "What this model cannot see" section listing the five street-level factors from H1.1 plus construction and shade, with the per-candidate verification status next to each. The memo's top recommendation carries the sentence: "Visit the site before signing a lease." (already in v1 — keep it, move it next to the recommendation, not buried in Limitations).
- **Acceptance:** the section exists in every memo format (md, html, PDF).
- **Verified by:** snapshot test on a generated memo.

### H2 — Hard part 2: data freshness & ground truth [POKE]

> "SEA retail opens and dies in 6 months. OpenStreetMap and public feeds lag by quarters or years. If you're pulling stale competitor density, a founder opens next to three ghost coffee shops that already failed or two new competitors that haven't shown up on maps yet."

**H2.1 — Freshness on every number (Phase 2).**
- Every count in the memo carries `as_of` (date the underlying data was fetched) and `source` (Geoapify Places / OSM / operator-reported / observed). The memo header shows a single "Data as of" date.
- **Staleness rule:** a competitor record is `stale` when its source data is older than the freshness threshold. Threshold default: 90 days. [ASSUMPTION: 90 days is a starting value set by this spec; Phase 3 evidence may move it.] Stale records are flagged in the memo.
- **Acceptance:** no count in a memo lacks `as_of` + `source`.
- **Verified by:** unit tests on the report renderer; manual review of one memo.

**H2.2 — Ghost-POI filter (Phase 2).**
- Competitors are cross-checked via Place Details at memo-generation time. A competitor that cannot be confirmed (closed, delisted, or no longer returned) is moved out of the competition count into a separate "unconfirmed — verify on foot" list. It never silently inflates or deflates the score.
- **Acceptance:** a run against an area with a known-closed competitor shows it in the unconfirmed list, not in the count.
- **Verified by:** a test with a recorded fixture (add `tests/fixtures/` entry; do not call live APIs in tests).

**H2.3 — Ground-truth feedback loop (Phase 3).**
- After a pilot signs a lease and opens, the operator reports actual traffic (see §3.2 for the measurement method). The outcome is stored in a versioned dataset `bench/outcomes/outcomes.jsonl` — one line per (memo, candidate, outcome) — plus a CLI command to record it. The loop's job: compare memo projection vs. actual, publish the error rate, and feed it into the next calibration round (H1.2).
- **Acceptance:** one recorded outcome end-to-end (record → stored → shown in the calibration report); the calibration report publishes the projection error for every outcome on file.
- **Verified by:** the CLI command + the calibration report output.

**H2.4 — Memo expiry and re-run policy (Phase 2).**
- Every memo is valid for 30 days from its "Data as of" date, printed on page one. [ASSUMPTION: 30 days is set by this spec from the 6-month churn Poke cites — a memo should be a fraction of a shop's lifetime, not a quarter of it.] After expiry the memo says "re-run before deciding". Re-running refreshes all data (no cached counts older than the freshness threshold are reused).
- **Acceptance:** an expired memo renders the expiry notice; a re-run produces a new "Data as of" date.
- **Verified by:** unit tests on the expiry logic.

### H3 — Hard part 3: sales friction with solo founders [POKE]

> "Mom-and-pop founders are cheap until they bleed. Convincing an indie coffee shop owner to drop $500 on an AI memo before they sign is a brutal B2C sales grind. You'll burn all your cash trying to acquire them."

**H3.1 — B2B-first, in the product and in the plan (all phases).**
- Solo founders are the **wedge**, not the market: the self-serve memo (pay-per-memo) stays available with zero acquisition spend. No v2 build effort and no outbound effort targets solo B2C acquisition.
- All v2 GTM effort targets: 2–5-unit F&B chains, commercial brokers, landlords, regional franchise directors. The chain dashboard (Phase 5) is built for them, not for solo founders.
- **Acceptance:** no v2 phase contains a B2C acquisition feature (ads, referral, solo-founder onboarding funnel).
- **Verified by:** scope review at each phase gate (§2.6).

**H3.2 — The memo is the sales asset (Phase 2 + Phase 5).**
- The chain-facing memo adds: a one-page executive summary a franchise director can forward; a "top 3 spots" filter workflow (the exact workflow Poke's bar describes); a pipeline view in the dashboard showing every memo, its status, and its outcome.
- **Acceptance:** the one-page summary exists in the memo output; the dashboard shows memo status per site.
- **Verified by:** pilot interviews (§3) — ask operators if they would forward it internally; record the answer.

**H3.3 — Pricing is not set in v2.**
- Poke's "$500 to $2k for a report is an easy sell" is a **hypothesis** [POKE], not a price. v2 does not hard-code any price. The pilot protocol (§3) tests willingness to pay; the price is set from what the first three pilots actually pay.
- Chain subscription pricing is likewise TBD from pilots. The dashboard must be built so that pricing can be attached later without a rebuild (usage metering hooks: memos generated per account, markets used).
- **Acceptance:** no price appears in code, memo, or dashboard copy except as a clearly-marked pilot-test value.
- **Verified by:** grep for currency amounts in product copy during the Phase 2 review.

### H4 — The investable bar (Poke's three proof points) [POKE]

> "3 paid pilot letters or signed leases from real operators (even small 2-to-5-unit chains) saying: 'we used SiteScout to filter our top 3 spots, signed one, and foot traffic matched the memo's projection within 20%' — a proprietary data edge: blending Geoapify with something local and hard to scrape (Grab/Foodpanda density trends, local telco mobility data, or a verified ground-truth feedback loop) — ditching the indie-founder distraction early and positioning straight as 'Placer.ai for Southeast Asia' targeted at regional franchise directors. If you have those 3 customer proof points, you're not pitching an AI toy anymore, you're pitching mission-critical enterprise infra for SEA retail."

Each proof point is a workstream in this spec, not a slogan:

**H4.1 — Proof point 1: 3 paid pilots.** Full plan in §3. The spec's job: define what counts, how it is measured, and what the product must do to make it possible (memo bands, outcome capture, pilot letter template).

**H4.2 — Proof point 2: proprietary data edge.** The v2 edge is defined as two layers, in priority order (Phase 4):
1. **The ground-truth feedback loop (own data, compounding).** Every pilot outcome makes the next memo better. This is the moat: no competitor gets it without doing the same pilots. Built in Phase 3, exploited in Phase 4.
2. **The Bangkok calibration dataset (own data).** The bench dataset from H1.2 is itself proprietary — street-level outcomes no public feed has.
3. **Local signals (external data, gated).** Delivery-density trends (Grab/Foodpanda) and telco mobility data are Poke's suggestions, not v2 commitments. Rules: no scraping of any service without a ToS / legal review first; no partnership is assumed to exist. In v2, "local signals" means **operator-reported and human-observed** inputs only (e.g. a pilot operator confirms delivery-app presence on their street; the memo records who observed it and when). If a data partnership becomes real, it lands in a later version with its own spec.
- **Acceptance:** the data-edge layer exists as versioned, owned datasets in the repo (bench + outcomes); no scraped data enters v2 without a written ToS check.
- **Verified by:** the datasets exist in the repo; a review confirms no unlicensed scraping code.

**H4.3 — Proof point 3: "Placer.ai for Southeast Asia" positioning.**
- Adopted as the positioning for all chain-facing copy (memo summary, dashboard, pilot letter). It is a positioning statement, not a claim of parity with Placer.ai — the memo must never claim feature parity, data parity, or comparable accuracy.
- **Acceptance:** chain-facing copy uses the positioning consistently; no parity claim appears anywhere.
- **Verified by:** copy review at the Phase 5 gate.

---

## 2. Build scope for the Devin Bot (phased)

### 2.0 Preflight (Phase 0) — before any feature work

- **Goal:** a green, known baseline the Bot can build on without guessing.
- **Steps:**
  1. Clone `main`, run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Record the results. If anything is red, fix it first and say so in the PR — do not build on a red baseline.
  2. Record the baseline numbers in `bench/bangkok-coffee/BASELINE.md` (to be created in Phase 1): current weights for both models, HCMC address benchmark 48/55 (87%), recorded run costs ~91 / ~90 / ~139 credits.
  3. Create a feature branch per phase (`v2/phase-1-calibration`, etc.). Never commit directly to `main`. Every phase ends in a PR that states what changed, the bench numbers, and the verification commands run.
- **Exit gate:** CI green on the branch; baseline recorded. No feature code yet.
- **Execution constraints (apply to all phases):**
  - TypeScript strict; no `any`, no `!`, no `ts-ignore` (repo convention — verify in `tsconfig.json` / `eslint.config.mjs` at preflight; if the repo allows them, this spec overrides for v2 code).
  - Every number in any user-facing output cites a trace entry (existing repo rule — keep it).
  - No secrets in code, bundles, or knowledge sources. Geoapify key via env / Worker secret only.
  - If a check has not been run, write UNVERIFIED — never write "verified" from a summary.
  - Never delete or skip a failing test to make CI green. A failing test is fixed or the change is reverted.
  - Verify every package exists (name, maintenance, download history) before adding it.
  - **Worker deploy is human-gated.** The Bot may prepare the Worker change (Phase 2/5 scope extension) but must not deploy to production — Cloudflare credentials are not the Bot's to use. The Bot delivers the change + deploy instructions; the founder deploys.

### 2.1 Phase 1 — Calibration bench (the foundation)

- **Goal:** the scorer stops being a guess. One model, per-market profiles, a real ground-truth bench.
- **Credit budget:** ~$100 of the $300 ask. [ASSUMPTION: per the 22/11 revised ask breakdown — calibration ~$100. The Bot does not need to know Devin's internal credit pricing; the mapping is the founder's allocation, and the phase must be completable inside it. If the Bot's session budget runs short, it stops at a green phase boundary and reports what is done — it never leaves the repo red.]
- **Work:**
  1. Unify the scoring models (H1.3): single implementation in `src/scoring/model.ts`, consumed by `src/engine/scout.ts` and the MCP path. Add `MarketProfile` instances `vn-hcmc` and `th-bangkok` reproducing current behaviour exactly. Bump to `2.0.0-calibrated` only when the first bench-driven weight change lands.
  2. Add the insufficient-data floor to the REST engine (H1.4), same semantics as `src/scoring/model.ts` (`INSUFFICIENT_DATA_POI_FLOOR = 5`).
  3. Build `bench/bangkok-coffee/` (H1.2): `dataset.json` (schema in §1/H1.2), collection protocol doc, runner, `RESULTS.md`. Minimum 30 entries, ≥10 closed. [ASSUMPTION: dataset entries are collected by the founder from public listings, owner conversations, and on-foot observation; the Bot builds the schema, runner, and validation — it does not invent entries. If the founder has not supplied entries yet, the Bot ships the schema + runner + a 5-entry *example* file clearly marked `EXAMPLE — not ground truth`, and the phase gate stays open until real entries land.]
  4. Extend `src/bench/score.ts` (or add `bench/bangkok-coffee/run.mjs`, following the existing `bench/hcmc-addresses/run.mjs` pattern) to report rank correlation, top-3 hit rate, and dud rate.
  5. Extend `TH_BANGKOK_PROFILE` area aliases only where the bench needs them (document each addition).
- **Deliverables:** unified model + two profiles; floor in both engines; bench dataset + runner + RESULTS.md with the first baseline run; `bench/bangkok-coffee/BASELINE.md`.
- **Acceptance criteria:**
  - `npm run typecheck && npm run lint && npm test && npm run build` green.
  - The three recorded HCMC runs score identically to v1.2.0 before any calibration change (regression guard).
  - Bench runner executes end-to-end; RESULTS.md committed with run date and the three metrics.
  - No weight value changes without a RESULTS.md entry and a version bump.
- **Exit gate:** PR merged with baseline numbers in the repo. The phrase "calibrated" may now be used only with the bench numbers attached.

### 2.2 Phase 2 — Memo generator v2 (the product)

- **Goal:** the memo becomes a decision document a franchise director can act on — bands not points, verified street facts, freshness on every number.
- **Credit budget:** ~$100 of the $300 ask, shared with Phase 3 (memo engine + feedback loop ~$100). [ASSUMPTION: per the 22/11 revised ask breakdown.]
- **Work:**
  1. Memo format v2 (extend `src/report/`, `web/src/`): ranked shortlist (7 candidates, as today) with detailed comparison of the top 3; every projection as a **band with explicit uncertainty** (never a point number — see §3.2 for why); micro-feature checklist (H1.1) per candidate; data-coverage score per candidate; "What this model cannot see" section (H1.5); "Data as of" date + per-count source (H2.1); 30-day expiry notice (H2.4); one-page executive summary for forwarding (H3.2).
  2. Ghost-POI filter (H2.2): Place Details cross-check at generation time; unconfirmed competitors listed separately, excluded from the count.
  3. Demo proxy scope: extend `web/worker/index.ts` `scopeError` to admit the Bangkok study area alongside HCMC, with a **separate per-market daily budget** so Bangkok runs cannot eat the HCMC budget. Prepare the change + deploy instructions; do **not** deploy (human-gated, §2.0).
  4. PDF export updated to the v2 format (sample regenerated; `docs/assets/sample-report.pdf` replaced).
- **Deliverables:** memo v2 in md/html/PDF; ghost filter; Worker scope change (prepared, not deployed); updated sample report.
- **Acceptance criteria:**
  - All Phase 1 gates still green.
  - A memo generated from a thin-data area shows the insufficient-data exclusion (H1.4).
  - A memo with an unverified top-3 candidate shows the "verify on foot" verdict, not a "recommend".
  - No count lacks `as_of` + `source`; no projection is a point number.
  - Memo renders identically in md, html, and PDF (same numbers, same checklist).
- **Exit gate:** PR merged; one Bangkok memo and one HCMC memo reviewed by the founder against the checklist.

### 2.3 Phase 3 — Ground-truth feedback loop (the moat)

- **Goal:** every pilot outcome makes the next memo better, and the improvement is published.
- **Credit budget:** shared with Phase 2 (~$100 combined). [ASSUMPTION: per the 22/11 revised ask breakdown.]
- **Work:**
  1. Outcome dataset `bench/outcomes/outcomes.jsonl` + schema doc: one line per (memo id, candidate, decision, actual traffic tier/counts, observed_at, source). Traffic is operator-reported (daily customer counts or POS transactions — see §3.2); the schema records the measurement method per outcome so different methods are never mixed silently.
  2. CLI command to record an outcome (following the existing CLI pattern in `src/scout-cli.ts`; exact command name to be proposed in the phase PR and documented).
  3. Calibration report: a command that compares every memo projection against its recorded outcome and publishes the error rate (share within ±20% of band — §3.2 definition). The report is committed alongside the outcomes file.
  4. Re-calibration procedure doc: how an outcome batch moves weights/scales, who approves, version bump rule.
- **Deliverables:** outcomes dataset + schema + CLI + calibration report + procedure doc.
- **Acceptance criteria:**
  - One synthetic-but-clearly-marked example outcome flows end-to-end (record → stored → calibration report shows it). Real outcomes replace it; the example is deleted before any pilot, never presented as evidence.
  - The calibration report computes the ±20% match exactly as defined in §3.2.
  - No outcome is recorded without its measurement method.
- **Exit gate:** PR merged; the loop is demonstrable with the example, ready for the first real pilot outcome.

### 2.4 Phase 4 — Data-edge layer (the proprietary part)

- **Goal:** the owned datasets become a versioned asset; external local signals are added only where they are legal and real.
- **Credit budget:** ~$100 of the $300 ask, shared with Phase 5 (data edge + chain dashboard ~$100). [ASSUMPTION: per the 22/11 revised ask breakdown.]
- **Work:**
  1. Version and package the owned datasets (Bangkok calibration set + outcomes) as the data edge: `bench/bangkok-coffee/` and `bench/outcomes/` get version files, changelogs, and a "how this was collected" provenance note each. These are the proprietary assets — treat them as such (no public dump of operator-confidential rows; the public repo carries the schema + aggregate metrics, operator-identifying rows stay out unless the operator consents in writing — see §3.4).
  2. Local-signals intake (human-observed / operator-reported only): a structured input for signals the model cannot fetch — e.g. delivery-app presence observed on the street, a new competitor the operator saw open, a closure the operator confirms. Each signal records observer, date, and street. No scraping.
  3. **Explicitly not in this phase:** Grab/Foodpanda scraping (no ToS review exists — do not build it), telco mobility data (partnership-gated, no partnership exists). If either becomes real, it gets its own spec and its own legal check.
- **Deliverables:** versioned datasets + provenance notes; local-signals intake (schema + memo rendering).
- **Acceptance criteria:**
  - Datasets versioned; provenance notes committed.
  - A memo can display an operator-reported local signal with observer + date.
  - No scraping code exists in the repo; a grep for the delivery/telco provider names in `src/` returns only docs/comments stating the rule.
- **Exit gate:** PR merged; data-edge layer demonstrable in a memo.

### 2.5 Phase 5 — Chain dashboard (the subscription product)

- **Goal:** the thing chains pay a subscription for — their whole expansion pipeline in one place.
- **Credit budget:** shared with Phase 4 (~$100 combined). [ASSUMPTION: per the 22/11 revised ask breakdown.]
- **Work:**
  1. Dashboard (extend `web/src/`): per-account view listing every memo (city, business type, status: draft / delivered / decided / outcome-recorded), the top-3 filter workflow per decision, lease decisions and their outcomes, and the calibration status of each market. Read-only in v2 (no in-dashboard editing of memos).
  2. Usage metering hooks (for future pricing, not pricing itself): memos generated per account, markets used, outcomes recorded. No price is displayed (§1/H3.3).
  3. Chain-facing copy uses the "Placer.ai for Southeast Asia" positioning (H4.3) with no parity claim.
- **Deliverables:** dashboard UI + metering hooks + positioning copy.
- **Acceptance criteria:**
  - Dashboard renders a pipeline of memos with statuses and outcomes from the datasets built in Phases 1–3.
  - No price appears in product copy.
  - All previous gates still green.
- **Exit gate:** PR merged; founder walks one pilot operator through the dashboard (or a recorded walkthrough) and records their feedback.

### 2.6 Phase gates (all phases)

At the end of every phase, before the next begins:
1. `npm run typecheck && npm run lint && npm test && npm run build` green.
2. The phase's acceptance criteria (§2.1–2.5) are checked off with evidence (command output, bench file, or memo), not asserted.
3. The scope cuts (§4) are re-checked — if a phase added something on the cut list, it is removed before merge.
4. The founder reviews the PR. The Bot does not merge its own PRs.
5. If the credit/session budget runs out mid-phase, the Bot stops at the last green boundary, commits, and reports exactly what is done and what remains. A half-finished phase is never pushed as "done".

---

## 3. The three proof points — how to get 3 paid pilots

This is the founder's work, not the Bot's. The spec defines it so the product work and the pilot work meet at the right moment.

### 3.1 Who counts as a pilot

- **Target profile:** a real operator — 2-to-5-unit F&B chain, commercial broker, landlord, or regional franchise director — actively deciding on a site in Bangkok or HCMC (signing a lease within ~90 days of the memo). [ASSUMPTION: the ~90-day window is set by this spec; a pilot with no live decision cannot produce a signed-lease proof point.]
- **What does not count:** a solo founder with no live decision, a friendly conversation with no payment, a free memo, a demo run. Payment is part of the proof — a pilot that does not pay is not a proof point.
- **No invented pipeline.** This spec names no companies and no individuals. The target list is the founder's to build.

### 3.2 What the pilot buys, and how "within 20%" is measured

- **The pilot offer:** one v2 memo for one real site decision (filter top 3 spots, pick one). Price: set from the pilot's willingness to pay in conversation. Poke's $500–$2k per report is the hypothesis to test, not the price. [POKE]
- **The measurement method (this is the load-bearing definition — get it right):**
  1. The memo projects foot traffic as a **band**, e.g. "projected 120–180 customers/day" (format example only — the band values come from calibration, Phase 1, not from this spec). A point projection can never be tested "within 20%", so bands are mandatory.
  2. After the shop opens, the operator reports actual traffic: mean daily customer counts or POS transactions over the first 30 trading days. The method (customer counts vs. POS) is recorded per pilot and never mixed across pilots.
  3. **Match rule:** actual 30-day mean falls within the memo's projected band widened by ±20% — i.e. within `[low × 0.8, high × 1.2]`. That is the definition of "foot traffic matched the memo's projection within 20%".
  4. If the shop has not opened within 90 days of signing, the pilot counts as a "signed lease" proof element but **not** as a "traffic match" proof point. If the operator will not share traffic data, the pilot does not count as a proof point at all — say so upfront, before the pilot starts.
- **The pilot letter (proof artifact):** a one-page letter from the operator stating, in their own words: they used SiteScout to filter their top 3 spots, signed one, and foot traffic matched the memo's projection within 20% — plus the lease date and the measurement method. The letter is the proof point; the memo + outcome record are the backup. The operator must consent in writing to SiteScout citing the letter (named or anonymised — their choice, recorded).

### 3.3 Sequence

1. Phase 2 ships (memo v2 exists) → pilot outreach can start. No pilot is sold on the v1 memo: v1 cannot project traffic bands and cannot verify street factors.
2. Pilot 1 is the learning pilot: price is whatever the operator will pay; the goal is the letter + the outcome record, not the revenue.
3. Pilots 2 and 3 use what Pilot 1 taught (price, memo format, measurement friction).
4. Three full proof points (paid + signed + traffic-matched) = the investable bar is met. Report it then — not before.

### 3.4 Rules

- Never present a partial proof point as a full one. "Signed a lease" without traffic data is a signed lease, not the bar.
- Operator data is confidential by default. Nothing operator-identifying goes in the public repo without written consent.
- The founder, not the Bot, does outreach, pricing conversations, and pilot letters. The Bot builds the product that makes them possible.

---

## 4. Scope cuts — what v2 does NOT do

If it is on this list, a phase PR that adds it is rejected, however good it looks.

1. **No telco mobility data.** No partnership exists; no outreach for one is in v2.
2. **No scraping of Grab, Foodpanda, or any delivery/travel service.** No ToS review exists. Operator-reported / human-observed signals only (§2.4).
3. **No rent or revenue prediction as a point number.** Bands with uncertainty only. No "this shop will make $X" anywhere.
4. **No foot-traffic sensors, hardware, or real-time foot-traffic feeds.**
5. **No new cities beyond Bangkok and HCMC.** The country registry already detects SG/MY/ID/PH, but v2 ships two markets. More markets = a later version with their own calibration benches.
6. **No B2C acquisition motion.** No ads, referral program, or solo-founder onboarding funnel. Solo pay-per-memo stays self-serve only.
7. **No broker / lease-signing integration.** No automated lease, no broker marketplace.
8. **No LLM-generated numbers without trace citations.** The existing repo rule stands.
9. **No pricing finalized in v2.** Prices are set from pilot evidence (§3.2), not from this spec.
10. **No production Worker deploy by the Bot.** Human-gated (§2.0).
11. **No re-architecture of the demo proxy** beyond the Bangkok scope + per-market budget in Phase 2.
12. **No claim of parity with Placer.ai or Buxton.** Positioning only, never parity.

---

## 5. Assumptions register

Every assumption in this spec, in one place. Each needs a founder decision or pilot evidence before it becomes a fact. Nothing here may be quoted as a validated result.

| # | Assumption | Source | How it gets resolved |
|---|---|---|---|
| A1 | Memo price hypothesis $500–$2k per report | Poke's review [POKE] | Pilot willingness-to-pay interviews (§3.2) |
| A2 | "Within 20%" traffic match = actual 30-day mean within `[low × 0.8, high × 1.2]` of the memo band | This spec's definition (§3.2) | Founder sign-off; first pilot's measurement |
| A3 | Freshness threshold 90 days; memo expiry 30 days | This spec (§2/H2.1, H2.4) | Pilot feedback; Phase 3 evidence |
| A4 | Calibration dataset minimum 30 entries, ≥10 closed | This spec (§1/H1.2) | First bench run; raise if the signal is thin |
| A5 | Traffic tiers collected by the founder (public listings, owner conversations, on-foot observation) | This spec (§1/H1.2) | Collection protocol in Phase 1; no invented tiers |
| A6 | Credit budget $300 total: calibration ~$100, memo + loop ~$100, data edge + dashboard ~$100 | 22/11 revised ask to Poke (founder's allocation) | Actual Bot session usage; report at each phase gate |
| A7 | "Under 5 minutes" for a franchise director to read a memo | This spec (§1/H0) | Pilot interviews |
| A8 | Pilot target: operator signing a lease within ~90 days of the memo | This spec (§3.1) | First pilot outreach |
| A9 | Devin Bot can execute all five phases inside the $300 allocation | Founder's plan; not verified against Devin's pricing | Phase gates (§2.6.5): stop at green boundaries, report |
| A10 | Geoapify paid-plan pricing sufficient to serve paid memos at the pilot price | Not verified — no paid Geoapify pricing was checked in this session | Check Geoapify pricing before the first paid pilot; if the unit economics fail, say so and re-plan |
| A11 | Delivery-density trends and telco data are obtainable later (partnership or licensed feed) | Poke's suggestion [POKE] | Not in v2; revisit only with a real partnership or license |
| A12 | Bangkok/HCMC operators will share 30 days of traffic data post-opening | Required by §3.2 | Agreed upfront in the pilot terms; a pilot that won't share does not count |

---

## 6. Definition of done for v2

v2 is done when **all** of these are true:

1. One scoring model (`2.0.0-calibrated` or later), per-market profiles for `vn-hcmc` and `th-bangkok`, weights set by bench evidence with version bumps.
2. Bangkok calibration bench exists with RESULTS.md; the dud rate and top-3 hit rate are published numbers, whatever they are.
3. The v2 memo ships: bands, micro-checklist, coverage score, freshness on every number, ghost filter, 30-day expiry, one-page summary — in md, html, and PDF.
4. The ground-truth loop has recorded at least one outcome end-to-end (example or real) and the calibration report computes the §3.2 match.
5. The data edge exists as versioned owned datasets; no scraping code in the repo.
6. The chain dashboard renders a pipeline of memos with statuses and outcomes.
7. CI is green; every phase PR is merged by the founder, not the Bot.
8. The first pilot conversation has started (founder's work, §3) — v2 does not ship into a vacuum.

## 7. Sources

- Poke (Devin/Cognition) iMessage review, 22/11/2026 — full thread as forwarded by the founder (the good, the three hard parts, the investable bar). Poke's claims are marked [POKE] and are not treated as validated facts.
- Live repo `github.com/ducvuathuduc/sitescout-agent`, `main` @ `5778b0a` (PR #8 `feat/bangkok-expansion`), read 22/11/2026: `README.md`; `src/engine/scout.ts` (WEIGHTS, `1.0.0-isoline`); `src/scoring/model.ts` (`0.2.0-market-aware`, `MarketProfile`, `INSUFFICIENT_DATA_POI_FLOOR = 5`); `src/engine/profile.ts` (`TH_BANGKOK_PROFILE`); `src/geo/profiles/registry.ts`; `bench/hcmc-addresses/RESULTS.md`; `bench/vngeobench/questions.json` (geobench-11); `docs/demo-proxy.md`; `web/worker/index.ts` (`scopeError`); `examples/thaodien-coffee/report.md`.
- Founder context: SiteScout v1.2.0 live; Geoapify €300 grant; monetization plan pay-per-memo (solo) + subscription (chains); Devin Bot ask revised 22/11 to $300 credits + 1 month Max with the phase-mapped breakdown in §2.
