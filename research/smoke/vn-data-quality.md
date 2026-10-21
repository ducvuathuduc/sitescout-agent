# Vietnam data-quality comparison — Geoapify MCP smoke tests

> ### ⛔ STATUS: PENDING — blocked on Geoapify API key
> This file is a **structured findings template**. No smoke test has been run;
> every cell marked `PENDING` must be filled from real outputs in
> `research/smoke/results/<region>/` after `./research/smoke/smoke.sh all`
> succeeds. **Do not invent numbers.** Durable conclusions graduate to
> `docs/FEEDBACK.md` (Geoapify gaps) and `RESEARCH.md` (method); raw numbers
> stay here.

## Method (same pattern, 3 regions)

Per region: geocode a diacritic-heavy formal address (01) + an informal
POI-style name (02) + the structured variant (03); count `catering.cafe`
POIs in a 1 km circle (04); sanity-check the category taxonomy (05); build
an 800 m buffer catchment (06); sample a 2×1 route matrix (07).
See `research/smoke/README.md` and `research/smoke/smoke.sh`.

What we are testing — the deliberate stress from the proposal:
Vietnamese addresses with diacritics, renamed wards (e.g. Thủ Đức city
reorganisation), and informal POI names that locals actually use.

---

## Region 1 — Ho Chi Minh City

Test addresses: `Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh` (formal) ·
`Phố đi bộ Bùi Viện, Quận 1, Hồ Chí Minh` (informal).

### Geocoding

| # | Query | Top result (formatted) | Confidence | Diacritics preserved? | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 02 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 03 | structured variant of 01 | PENDING | PENDING | — | parity with 01? |

### POI density (step 04 — `catering.cafe`, r = 1 km, centre ≈ Thao Dien)

| Metric | Value |
| --- | --- |
| POI count | PENDING |
| Density (per km²) | PENDING |
| Result cap hit? (limit=100) | PENDING |

### Routing / geometry (steps 06–07)

| Check | Result |
| --- | --- |
| Buffer 800 m → area ≈ π·0.8² ≈ 2.01 km²? | PENDING |
| Route matrix 2×1 returns durations | PENDING |

### Region notes

- PENDING (e.g. ward-renaming fallout, informal-name resolution quality)

---

## Region 2 — Hanoi

Test addresses: `Tràng Tiền, Hoàn Kiếm, Hà Nội` (formal) ·
`Phố bia Tạ Hiện, Hoàn Kiếm, Hà Nội` (informal).

### Geocoding

| # | Query | Top result (formatted) | Confidence | Diacritics preserved? | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 02 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 03 | structured variant of 01 | PENDING | PENDING | — | parity with 01? |

### POI density (step 04 — `catering.cafe`, r = 1 km, centre ≈ Hoan Kiem)

| Metric | Value |
| --- | --- |
| POI count | PENDING |
| Density (per km²) | PENDING |
| Result cap hit? (limit=100) | PENDING |

### Routing / geometry (steps 06–07)

| Check | Result |
| --- | --- |
| Buffer 800 m → area ≈ 2.01 km²? | PENDING |
| Route matrix 2×1 returns durations | PENDING |

### Region notes

- PENDING (e.g. Old Quarter alley addresses, accent variants)

---

## Region 3 — Da Nang

Test addresses: `Bạch Đằng, Hải Châu, Đà Nẵng` (formal) ·
`Cầu Rồng, Hải Châu, Đà Nẵng` (informal).

### Geocoding

| # | Query | Top result (formatted) | Confidence | Diacritics preserved? | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 02 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 03 | structured variant of 01 | PENDING | PENDING | — | parity with 01? |

### POI density (step 04 — `catering.cafe`, r = 1 km, centre ≈ My Khe)

| Metric | Value |
| --- | --- |
| POI count | PENDING |
| Density (per km²) | PENDING |
| Result cap hit? (limit=100) | PENDING |

### Routing / geometry (steps 06–07)

| Check | Result |
| --- | --- |
| Buffer 800 m → area ≈ 2.01 km²? | PENDING |
| Route matrix 2×1 returns durations | PENDING |

### Region notes

- PENDING (e.g. tourism-corridor POI skew: hotels vs cafes near My Khe)

---

## Cross-region comparison

Fill after all three runs. Hypotheses to confirm or kill:

- **H1:** HCMC has the highest cafe POI density of the three (largest
  specialty-coffee scene); Da Nang the lowest.
- **H2:** Diacritic-heavy formal addresses geocode at comparable confidence
  across regions (server-side normalisation), while informal names degrade
  everywhere — but *how much* may differ by region (HCMC's informal names
  like "Phố Tây" are more documented than Da Nang's).
- **H3:** Structured geocoding ≥ free-text geocoding confidence in all
  regions (tests whether to prefer structured in the agent).

| Dimension | HCMC | Hanoi | Da Nang | Winner / note |
| --- | --- | --- | --- | --- |
| Cafe density per km² (1 km circle) | PENDING | PENDING | PENDING | PENDING |
| 01 confidence (diacritic formal) | PENDING | PENDING | PENDING | PENDING |
| 02 resolved at all? (informal) | PENDING | PENDING | PENDING | PENDING |
| 03 ≥ 01 confidence? | PENDING | PENDING | PENDING | PENDING |
| Route matrix sane in all 3? | PENDING | PENDING | PENDING | PENDING |

## Implications (fill after comparison)

- **Scoring calibration:** real densities replace the v0 weights in
  `src/scoring/model.ts`. If density varies 10× across regions, weights or
  normalisation must be region-aware — record the decision here.
- **Agent behaviour:** if structured ≥ free-text everywhere, the planner
  should prefer `geocode_structured_address`. If informal names fail in a
  region, the report must caveat candidate seeds there.
- **Geoapify feedback:** systematic gaps (e.g. informal names unresolvable,
  ward renames stale) graduate to `docs/FEEDBACK.md` with reproduction
  payloads from `research/smoke/results/`.
