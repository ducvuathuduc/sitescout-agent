/**
 * SiteScout engine v1 — "isoline-first" site selection on Geoapify REST.
 *
 *   1. Geocoding            area text → anchor point                 [geocoding]
 *   2. Boundaries part-of   anchor → ward polygon (post-2025 names)   [boundaries]
 *   3. Places (rect)        competitors + demand POIs in the study area [places]
 *   4. Candidate generation hex lattice inside ward ∩ disk, scored on the
 *                           POI sample, top-N with min separation (local, no API)
 *   5. Reverse geocoding    label each candidate                      [reverse-geocoding]
 *   6. Isoline              N-minute WALK isochrone per candidate     [isoline]
 *   7. Places (geometry)    POIs INSIDE each isochrone                [places, filter=geometry:<isoline id>]
 *   8. Geocoding            demand origins                            [geocoding]
 *   9. Route Matrix         origins × candidates, drive, traffic≈     [route-matrix]
 *  10. Routing              best origin → #1 (polyline)               [routing]
 *  11. Place Details        5-min DRIVE isochrone around #1           [place-details, drive_5]
 *  12. Scoring              single unified model (src/scoring/model.ts)
 *
 * Runtime-agnostic: used by the CLI (Node) and the Cloudflare Worker demo.
 * Every number in the result carries `refs` = trace seqs of the calls that
 * produced it. Market-specific geocoding config comes from a CountryProfile
 * (default VN_HCMC_PROFILE); its isoCountry and lang are passed to every
 * Geoapify call that accepts them.
 */
import { GeoapifyApi, GeoapifyError, type CallRecord, type Feature, type GeocodeResult, type PlaceProps } from "./geoapify.js";
import type { PlanOutcome, ScoutPlan } from "./plan.js";
import { VN_HCMC_PROFILE, type CountryProfile } from "./profile.js";
import {
  dataCoverageScore,
  INSUFFICIENT_DATA_POI_FLOOR,
  scoreCandidate,
  TH_BANGKOK_PROFILE as TH_BANGKOK_MARKET_PROFILE,
  trafficBandFor,
  VN_HCMC_PROFILE as VN_HCMC_MARKET_PROFILE,
  WEIGHTS_VERSION as UNIFIED_WEIGHTS_VERSION,
  type EvidenceBundle,
  type SubScores,
} from "../scoring/model.js";
import {
  applyChecklists,
  emptyChecklist,
  verdictFor,
  type MicroChecklist,
  type Verdict,
} from "./checklist.js";
import { expiryFor } from "./freshness.js";
import { geometryAreaM2, haversineM, hexGrid, pointInGeometry, round6, type LatLon } from "../geo/grid.js";
import { foldKey } from "../geo/text.js";

export const ENGINE_VERSION = "1.0.0";

export type Geometry = { type: string; coordinates: unknown };

export interface CandidateResult {
  id: string;
  /** place_id of the nearest address (reverse geocoding) — used for Place Details. */
  placeId?: string;
  rank: number;
  label: string;
  lat: number;
  lon: number;
  isoline: Geometry | null;
  isolineAreaM2: number;
  competitors: number;
  demand: Record<string, number>;
  demandTotal: number;
  /** Mean drive time from demand origins, minutes. */
  meanDriveMin: number | null;
  driveMinByOrigin: Array<number | null>;
  /** Unified five-factor sub-scores (see src/scoring/model.ts). */
  scores: SubScores;
  /** Data-coverage score in [0, 1]: POIs found vs. the profile expectation. */
  coverage: number;
  /** Street-level micro-checklist (all UNVERIFIED when no file was given). */
  checklist: MicroChecklist;
  /** "recommend" or "verify on foot before deciding" (≥2 UNVERIFIED in top 3). */
  verdict: Verdict;
  /** Projected daily-customer band, or null while no trafficScale exists. */
  trafficBand: { low: number; high: number } | null;
  total: number;
  why: string;
  refs: number[];
  /** Competitor & demand POIs inside the isochrone (for the map). */
  pois: Array<{ name: string; lat: number; lon: number; kind: "competitor" | "demand"; category: string; placeId?: string }>;
}

/** A competitor Place Details could not confirm — closed, delisted, or absent. */
export interface UnconfirmedPoi {
  name: string;
  lat: number;
  lon: number;
  category: string;
  /** Always "unconfirmed — verify on foot". */
  reason: string;
  /** Trace seqs backing the call (the Place Details call that proved it). */
  refs: number[];
}

export interface ScoutResult {
  engine: string;
  weightsVersion: string;
  question: string;
  plan: ScoutPlan;
  planner: PlanOutcome["planner"];
  plannerModel?: string;
  planNotes: string[];
  /** Market the run was planned for (additive; absent in results produced before profiles). */
  profile?: { id: string; label: string };
  area: {
    query: string;
    anchor: { lat: number; lon: number; label: string; resultType?: string; confidence?: number; via?: string };
    ward?: { name: string; geometry: Geometry | null; hierarchy: string[] };
    studyRadiusM: number;
    refs: number[];
  };
  origins: Array<{ query: string; label?: string; lat?: number; lon?: number; ref?: number }>;
  candidates: CandidateResult[];
  /** Candidates below the POI floor: excluded from ranking, never scored. */
  excluded: Array<{ id: string; label: string; reason: string; refs: number[] }>;
  /** Competitors Place Details could not confirm — verify on foot, never scored. */
  unconfirmed: UnconfirmedPoi[];
  /** Date the underlying data was fetched (YYYY-MM-DD, = generatedAt date). */
  dataAsOf: string;
  /** Memo expiry date (YYYY-MM-DD): dataAsOf + 30 days. */
  expiresAt: string;
  winnerRoute: { origin: string; timeS?: number; distanceM?: number; geometry?: Geometry; ref: number } | null;
  winnerDrive5: { geometry: Geometry; ref: number } | null;
  limitations: string[];
  calls: CallRecord[];
  creditsEstimated: number;
  generatedAt: string;
  durationMs: number;
}

export type ScoutEvent =
  | { type: "plan"; plan: ScoutPlan; planner: string; notes: string[] }
  | { type: "call"; call: CallRecord }
  | { type: "stage"; stage: string; detail?: string }
  | { type: "candidate"; candidate: Pick<CandidateResult, "id" | "label" | "lat" | "lon" | "isoline" | "competitors" | "demandTotal"> }
  | { type: "done"; result: ScoutResult }
  | { type: "error"; message: string };

export interface ScoutOptions {
  api: GeoapifyApi;
  onEvent?: (e: ScoutEvent) => void;
  /** Hex spacing for candidate generation (m). */
  gridSpacingM?: number;
  /** Study radius around the anchor (m). */
  studyRadiusM?: number;
  /** Market profile: geocoder bias, boundary check, stopwords. Default VN_HCMC_PROFILE. */
  profile?: CountryProfile;
  /** Micro-checklists per candidate id (parsed from a --checklist file). */
  checklist?: Record<string, MicroChecklist>;
}

function pickAnchor(results: GeocodeResult[], profile: CountryProfile = VN_HCMC_PROFILE): GeocodeResult | undefined {
  const pref = ["amenity", "building", "street", "suburb", "district", "postcode"];
  return [...results]
    .filter((r) => profile.boundaryCheck(r.lat, r.lon))
    // a city/state-level hit means the geocoder fell back to the city name — useless as an anchor
    .filter((r) => !["city", "state", "country", "county"].includes(r.result_type ?? ""))
    .sort((a, b) => (pref.indexOf(a.result_type ?? "") - pref.indexOf(b.result_type ?? "")) || ((b.rank?.confidence ?? 0) - (a.rank?.confidence ?? 0)))[0];
}

/**
 * Resolve a place name inside the profile's market. Measured on 2026-10-22: free-text /geocode/search
 * mis-resolves many HCMC landmarks (e.g. "Chợ Bà Chiểu" → Chợ Bến Thành,
 * "Crescent Mall, Quận 7" → a Tân Bình address) while /geocode/autocomplete
 * often gets them right; but autocomplete on a bare street name ("Xuân Thủy")
 * picks a same-named street elsewhere. So: try autocomplete (name + area),
 * search, autocomplete (bare name); keep the hit whose address contains the
 * most query tokens; reject hits outside the profile's boundary. See docs/FEEDBACK.md.
 */
export async function resolvePlace(api: GeoapifyApi, text: string, profile: CountryProfile = VN_HCMC_PROFILE): Promise<{ hit?: GeocodeResult; refs: number[]; via?: "autocomplete" | "search" }> {
  const refs: number[] = [];
  // Pre-reform admin units (profile.legacyPartPatterns) no longer exist. Measured on
  // 2026-10-22 (bench/hcmc-addresses): sending them makes the geocoder match alley numbers
  // ("Phường 12" → "175/12 Nguyễn Tri Phương"), so they are dropped from the query and the score.
  const legacy = (p: string): boolean => profile.legacyPartPatterns.some((re) => re.test(p));
  const rawParts = text.split(",").map((x) => x.trim()).filter(Boolean);
  const keep = rawParts.filter((x) => !legacy(foldKey(x)));
  // tokens that should appear in a correct answer (drop generic words)
  const parts = keep.map(foldKey).filter((x) => x && !profile.ignoredPartPattern.test(x));
  const words = (x: string): Set<string> => new Set(x.split(/[^a-z0-9]+/).filter(Boolean));
  const score = (r: GeocodeResult): number => {
    const f = words(foldKey(r.formatted ?? ""));
    return parts.reduce((n, p, k) => {
      const ws = [...words(p.replace(profile.partPrefixPattern, ""))];
      const ok = ws.length > 0 && ws.every((w) => f.has(w));
      return n + (ok ? (k === 0 ? 2 : 1) : 0);
    }, 0);
  };
  const tried: Array<{ hit: GeocodeResult; via: "autocomplete" | "search"; s: number }> = [];
  const consider = (rs: GeocodeResult[], via: "autocomplete" | "search"): boolean => {
    for (const r of rs) {
      if (!pickAnchor([r], profile)) continue;
      tried.push({ hit: r, via, s: score(r) });
    }
    return tried.some((t) => t.s >= Math.min(parts.length, 2) + 1);
  };
  const short = (keep[0] ?? text).trim();
  const cleaned = keep.join(", ");
  const geo = { biasLonLat: profile.biasPoint, country: profile.isoCountry, lang: profile.lang };
  const attempts: Array<() => Promise<{ results: GeocodeResult[]; seq: number }>> = [
    () => api.autocomplete(keep.length > 1 ? keep.slice(0, 2).join(", ") : short, { limit: 5, ...geo }),
    () => api.geocode(cleaned || text, { limit: 5, ...geo }),
    () => api.autocomplete(short, { limit: 5, ...geo }),
  ];
  let lastError: unknown;
  for (const [k, attempt] of attempts.entries()) {
    try {
      const r = await attempt();
      refs.push(r.seq);
      if (consider(r.results, k === 1 ? "search" : "autocomplete")) break;
    } catch (e) {
      lastError = e;
    }
  }
  // Every attempt threw (quota, auth, network): surface that instead of "not found".
  if (tried.length === 0 && lastError && refs.length === 0) throw lastError;
  tried.sort((a, b) => b.s - a.s);
  return { hit: tried[0]?.hit, refs, via: tried[0]?.via };
}

/**
 * Places, one request per category, merged and de-duplicated.
 * Measured on 2026-10-22 (circle 800 m, Phường Sài Gòn / Thảo Điền): multi-
 * category requests are not a reliable union — `catering.cafe,office,
 * sport.fitness` returned the 27 cafés only, and `office.company,
 * office.coworking` returned 0 while `office.company` alone returned 8.
 * Reported in docs/FEEDBACK.md; until clarified we query categories singly.
 */
/**
 * True when a Place Details result marks the place closed/delisted.
 * Contract (see tests/fixtures/ghost-poi.json): properties.closed === true,
 * properties.status in {"closed", "delisted"}, or the OSM raw record
 * carries permanently_closed. The real Geoapify closed representation is
 * undocumented — this predicate defines what the engine treats as closed.
 */
export function isClosedPlaceDetails(props: Record<string, unknown>): boolean {
  if (props.closed === true) return true;
  if (props.status === "closed" || props.status === "delisted") return true;
  const datasource = props.datasource as { raw?: Record<string, unknown> } | undefined;
  return datasource?.raw?.permanently_closed === true;
}

export async function placesMulti(api: GeoapifyApi, categories: string[], filter: string, limit: number, lang?: string): Promise<{ features: Array<Feature<PlaceProps>>; refs: number[] }> {
  const seen = new Set<string>();
  const features: Array<Feature<PlaceProps>> = [];
  const refs: number[] = [];
  for (const c of categories) {
    const r = await api.places({ categories: [c], filter, limit, lang });
    refs.push(r.seq);
    for (const f of r.features) {
      const id = f.properties.place_id ?? `${f.properties.lat},${f.properties.lon}`;
      if (!seen.has(id)) {
        seen.add(id);
        features.push(f);
      }
    }
  }
  return { features, refs };
}

export async function runScout(question: string, planned: PlanOutcome, opts: ScoutOptions): Promise<ScoutResult> {
  const t0 = Date.now();
  const { api } = opts;
  const profile = opts.profile ?? VN_HCMC_PROFILE;
  const lang = profile.lang;
  const emit = (e: ScoutEvent): void => opts.onEvent?.(e);
  const plan = planned.plan;
  emit({ type: "plan", plan, planner: planned.planner, notes: planned.notes });
  const spacing = opts.gridSpacingM ?? 300;
  const studyR = opts.studyRadiusM ?? 1300;
  const limitations: string[] = [];
  const unconfirmed: UnconfirmedPoi[] = [];

  // 1 — anchor
  emit({ type: "stage", stage: "geocode", detail: plan.area });
  const rp = await resolvePlace(api, plan.area, profile);
  const anchorRes = rp.hit;
  if (!anchorRes) throw new Error(`Could not resolve "${plan.area}" to a place inside ${profile.label} (see trace ${rp.refs.map((x) => "T" + x).join(", ")}).`);
  const anchor = { lat: anchorRes.lat, lon: anchorRes.lon, label: anchorRes.formatted ?? plan.area, resultType: anchorRes.result_type, confidence: anchorRes.rank?.confidence, via: rp.via };
  const areaRefs = [...rp.refs];

  // 2 — ward boundary (new 2025 administrative units)
  emit({ type: "stage", stage: "boundaries" });
  let ward: ScoutResult["area"]["ward"];
  try {
    const b = await api.boundariesPartOf(anchor.lat, anchor.lon, { lang });
    areaRefs.push(b.seq);
    const county = b.features.find((f) => (f.properties.categories as string[] | undefined)?.includes("administrative.county_level"));
    const fromLabel = anchor.label.split(",").map((x) => x.trim()).find((x) => /^Phường |^Xã /.test(x));
    if (!county) limitations.push(`Geoapify Boundaries returned no ward-level unit for this point (levels: ${b.features.map((f) => String(f.properties.name)).join(" ⊂ ")}); ward name taken from the geocoder ("${fromLabel ?? "unknown"}") and candidates generated in a disk.`);
    ward = {
      name: String(county?.properties.name ?? fromLabel ?? "unknown ward"),
      geometry: county?.geometry ?? null,
      hierarchy: b.features.map((f) => String(f.properties.name ?? "?")),
    };
  } catch {
    limitations.push("Ward boundary unavailable for this anchor; candidates were generated in a disk only.");
  }

  // 3 — POI sample over the study area (bounding rect of the disk)
  emit({ type: "stage", stage: "places-area" });
  const dLat = studyR / 111_320;
  const dLon = studyR / (111_320 * Math.cos((anchor.lat * Math.PI) / 180));
  const rect = `rect:${round6(anchor.lon - dLon)},${round6(anchor.lat + dLat)},${round6(anchor.lon + dLon)},${round6(anchor.lat - dLat)}`;
  const cats = [plan.competitorCategory, ...plan.demandCategories];
  const area = await placesMulti(api, cats, rect, 200, lang);
  areaRefs.push(...area.refs);
  const sample = area.features.map((f) => f.properties);

  // 4 — candidate generation (local): hex lattice ∩ ward ∩ disk, scored on the sample
  emit({ type: "stage", stage: "candidates" });
  const bbox: [number, number, number, number] = [anchor.lon - dLon, anchor.lat - dLat, anchor.lon + dLon, anchor.lat + dLat];
  let cells = hexGrid(bbox, spacing).filter((p) => haversineM(p, anchor) <= studyR);
  const inWard = ward?.geometry ? cells.filter((p) => pointInGeometry(p, ward!.geometry)) : cells;
  if (inWard.length >= plan.candidates) cells = inWard;
  else if (ward?.geometry) limitations.push(`Study disk extends beyond ${ward.name}; some candidates lie in neighbouring wards.`);
  const pre = cells.map((p) => {
    let demand = 0;
    let comp = 0;
    for (const s of sample) {
      const d = haversineM(p, { lat: s.lat, lon: s.lon });
      if (d > 450) continue;
      const w = 1 - d / 450;
      if (s.categories?.includes(plan.competitorCategory)) comp += w;
      else demand += w;
    }
    return { p, pre: demand - 0.5 * comp + 0.001 * -haversineM(p, anchor) };
  });
  pre.sort((a, b) => b.pre - a.pre);
  const chosen: LatLon[] = [];
  for (const c of pre) {
    if (chosen.every((x) => haversineM(x, c.p) >= spacing * 1.5)) chosen.push(c.p);
    if (chosen.length >= plan.candidates) break;
  }

  // 5–7 — per candidate: label, walk isoline, POIs inside it
  const cands: Array<Omit<CandidateResult, "rank" | "scores" | "total" | "why" | "meanDriveMin" | "driveMinByOrigin" | "coverage" | "checklist" | "verdict" | "trafficBand">> = [];
  for (const [i, p] of chosen.entries()) {
    emit({ type: "stage", stage: "candidate", detail: `${i + 1}/${chosen.length}` });
    const refs: number[] = [];
    let label = `Candidate ${i + 1}`;
    let placeId: string | undefined;
    try {
      const r = await api.reverse(p.lat, p.lon, { lang });
      refs.push(r.seq);
      placeId = r.result?.place_id;
      const street = typeof r.result?.street === "string" ? r.result.street : undefined;
      const line1 = typeof r.result?.address_line1 === "string" ? r.result.address_line1 : undefined;
      if (r.result) label = [line1, street && !line1?.includes(street) ? street : undefined].filter(Boolean).join(", ") || (r.result.formatted ?? label);
    } catch {
      /* label stays synthetic */
    }
    let isoline: Geometry | null = null;
    let isoId = "";
    try {
      const iso = await api.isoline({ lat: p.lat, lon: p.lon, mode: "walk", type: "time", range: plan.walkMinutes * 60 });
      refs.push(iso.seq);
      isoline = iso.feature.geometry;
      isoId = iso.id;
    } catch {
      limitations.push(`Isoline failed for candidate ${i + 1}; a 600 m disk was used instead.`);
    }
    const filter = isoId ? `geometry:${isoId}` : `circle:${p.lon},${p.lat},600`;
    const inside = await placesMulti(api, cats, filter, 150, lang);
    refs.push(...inside.refs);
    const demand: Record<string, number> = Object.fromEntries(plan.demandCategories.map((c) => [c, 0]));
    let competitors = 0;
    const pois: CandidateResult["pois"] = [];
    for (const f of inside.features) {
      const pr = f.properties as PlaceProps;
      if (pr.categories?.includes(plan.competitorCategory)) {
        competitors++;
        pois.push({ name: pr.name ?? pr.address_line1 ?? "competitor", lat: pr.lat, lon: pr.lon, kind: "competitor", category: plan.competitorCategory, placeId: pr.place_id });
      } else {
        const c = plan.demandCategories.find((d) => pr.categories?.includes(d));
        if (c) {
          demand[c]++;
          pois.push({ name: pr.name ?? pr.address_line1 ?? c, lat: pr.lat, lon: pr.lon, kind: "demand", category: c, placeId: pr.place_id });
        }
      }
    }
    // Ghost-POI filter (spec §2/H2.2): cross-check each competitor POI
    // with Place Details (features ["details"] only — 1 credit per call).
    // No result, a 404, or a closed/delisted marker → unconfirmed: out of
    // the count and out of the score inputs, listed for a foot check. Any
    // other Place Details failure (network/429) does NOT unconfirm — the
    // POI stays counted and a limitation is added instead. Never silently
    // inflate or deflate a score.
    let ghostIncomplete = 0;
    const keptPois: CandidateResult["pois"] = [];
    for (const p of pois) {
      if (p.kind !== "competitor" || !p.placeId) {
        keptPois.push(p);
        continue;
      }
      try {
        const d = await api.placeDetails({ id: p.placeId, features: ["details"], lang });
        const f = d.features[0];
        if (!f || isClosedPlaceDetails(f.properties)) {
          unconfirmed.push({ name: p.name, lat: p.lat, lon: p.lon, category: p.category, reason: "unconfirmed — verify on foot", refs: [d.seq] });
          competitors--;
        } else {
          keptPois.push(p);
        }
      } catch (e) {
        if (e instanceof GeoapifyError && e.status === 404) {
          // 404: the place no longer exists in the index — unconfirmed.
          // The failed call is still recorded in api.calls; cite its seq.
          const failedSeq = (e as { record?: { seq?: number } }).record?.seq;
          unconfirmed.push({ name: p.name, lat: p.lat, lon: p.lon, category: p.category, reason: "unconfirmed — verify on foot", refs: failedSeq !== undefined ? [failedSeq] : [] });
          competitors--;
        } else {
          ghostIncomplete++;
          keptPois.push(p);
        }
      }
    }
    pois.length = 0;
    pois.push(...keptPois);
    if (ghostIncomplete > 0) {
      limitations.push(`Ghost check incomplete for ${ghostIncomplete} competitor(s) — Place Details failed, counts kept as-is; verify on foot.`);
    }
    const cand = {
      id: `c${i + 1}`,
      placeId,
      label,
      lat: p.lat,
      lon: p.lon,
      isoline,
      isolineAreaM2: isoline ? geometryAreaM2(isoline) : Math.PI * 600 ** 2,
      competitors,
      demand,
      demandTotal: Object.values(demand).reduce((a, b) => a + b, 0),
      refs,
      pois,
    };
    cands.push(cand);
    emit({ type: "candidate", candidate: { id: cand.id, label, lat: p.lat, lon: p.lon, isoline, competitors, demandTotal: cand.demandTotal } });
  }

  // 8–9 — accessibility
  emit({ type: "stage", stage: "access" });
  const origins: ScoutResult["origins"] = [];
  for (const q of plan.origins) {
    try {
      const o = await resolvePlace(api, q, profile);
      origins.push({ query: q, label: o.hit?.formatted, lat: o.hit?.lat, lon: o.hit?.lon, ref: o.refs[o.refs.length - 1] });
    } catch {
      origins.push({ query: q });
    }
  }
  const okOrigins = origins.filter((o) => o.lat !== undefined && o.lon !== undefined) as Array<Required<Pick<ScoutResult["origins"][number], "lat" | "lon" | "query">> & { ref?: number }>;
  let times: number[][] = [];
  let matrixRef: number | undefined;
  if (okOrigins.length && cands.length) {
    try {
      const m = await api.routeMatrix({ sources: okOrigins, targets: cands, mode: "drive", traffic: "approximated" });
      times = m.timesS;
      matrixRef = m.seq;
    } catch {
      limitations.push("Route matrix failed; accessibility scored neutral.");
    }
  }

  // 12 — scoring via the single unified model (src/scoring/model.ts).
  // The REST `reach` factor is dropped as a weight and folded into
  // `catchment` (POIs per km² already divides by isoline area).
  const meanDrive = cands.map((_, ti) => {
    const col = times.map((row) => row[ti]).filter((x) => Number.isFinite(x));
    return col.length ? col.reduce((a, b) => a + b, 0) / col.length / 60 : null;
  });
  // Market profile for scoring: the run's geocoder profile selects it
  // ("th-bangkok" → TH_BANGKOK_PROFILE, anything else → VN_HCMC_PROFILE).
  const marketProfile = profile.id === "th-bangkok" ? TH_BANGKOK_MARKET_PROFILE : VN_HCMC_MARKET_PROFILE;
  // Insufficient-data floor (spec §1/H1.4): a candidate with fewer than
  // INSUFFICIENT_DATA_POI_FLOOR POIs across all sweeps is excluded from
  // ranking — "no data" must never read as "no competition". Excluded
  // candidates never enter `scored`, never receive a rank, and never
  // affect the winner route/drive-5 steps (those read scored[0]).
  const excluded: ScoutResult["excluded"] = [];
  const rankable: Array<{ cand: (typeof cands)[number]; i: number }> = [];
  for (const [i, c] of cands.entries()) {
    const totalPois = c.competitors + c.demandTotal;
    if (totalPois < INSUFFICIENT_DATA_POI_FLOOR) {
      excluded.push({
        id: c.id,
        label: c.label,
        reason: `insufficient data: ${totalPois} POIs across all sweeps (floor ${INSUFFICIENT_DATA_POI_FLOOR})`,
        refs: [...c.refs],
      });
    } else {
      rankable.push({ cand: c, i });
    }
  }
  const scored: CandidateResult[] = rankable.map(({ cand: c, i }) => {
    const evidence: EvidenceBundle = {
      candidateId: c.id,
      candidateLabel: c.label,
      competitorCount: c.competitors,
      complementaryPoiCount: c.demandTotal,
      // [ASSUMPTION] walk speed 80 m/min: catchment radius = walk minutes × 80.
      catchmentRadiusM: plan.walkMinutes * 80,
      catchmentAreaM2: c.isolineAreaM2,
      ...(meanDrive[i] === null ? {} : { meanAccessDurationS: meanDrive[i] * 60 }),
    };
    const refs = [...c.refs, ...(matrixRef !== undefined ? [matrixRef] : [])];
    const scoredCandidate = scoreCandidate(evidence, marketProfile, refs);
    const total = Math.round(scoredCandidate.total * 1000) / 1000;
    const topDemand = Object.entries(c.demand).sort((a, b) => b[1] - a[1]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ") || "no demand POIs";
    const why = `${plan.walkMinutes}-min walk reaches ${(c.isolineAreaM2 / 1e6).toFixed(2)} km² with ${topDemand} and ${c.competitors} competing ${plan.competitorCategory}` + (meanDrive[i] !== null ? `; ${Math.round(meanDrive[i] as number)} min average drive from ${okOrigins.length} origin(s).` : ".");
    return {
      ...c,
      rank: 0,
      scores: scoredCandidate.scores,
      total,
      coverage: dataCoverageScore(c.competitors + c.demandTotal, marketProfile),
      // Checklist + verdict are set after ranking (verdict needs the rank);
      // trafficBand derives from the published (rounded) total.
      checklist: opts.checklist?.[c.id] ?? emptyChecklist(),
      verdict: "recommend" as Verdict,
      trafficBand: trafficBandFor(total, marketProfile),
      why,
      refs,
      meanDriveMin: meanDrive[i] === null ? null : Math.round((meanDrive[i] as number) * 10) / 10,
      driveMinByOrigin: times.map((row) => (Number.isFinite(row[i]) ? Math.round(row[i] / 6) / 10 : null)),
    };
  });
  scored.sort((a, b) => b.total - a.total);
  scored.forEach((c, i) => (c.rank = i + 1));
  // Memo v2 data model: a checklist naming an id not in this run fails
  // loudly (applyChecklists throws); every candidate then gets its verdict
  // from its checklist and its final rank.
  if (opts.checklist) applyChecklists({ candidates: scored }, opts.checklist);
  for (const c of scored) c.verdict = verdictFor(c.checklist, c.rank);

  // 10–11 — winner context
  let winnerRoute: ScoutResult["winnerRoute"] = null;
  let winnerDrive5: ScoutResult["winnerDrive5"] = null;
  const w = scored[0];
  if (w && okOrigins[0]) {
    try {
      const r = await api.routing({ waypoints: [okOrigins[0], w], mode: "drive", traffic: "approximated" });
      winnerRoute = { origin: okOrigins[0].query, timeS: r.feature?.properties.time, distanceM: r.feature?.properties.distance, geometry: r.feature?.geometry, ref: r.seq };
      w.refs.push(r.seq);
    } catch {
      /* optional */
    }
  }
  if (w) {
    try {
      const d = await api.placeDetails(w.placeId ? { id: w.placeId, features: ["details", "drive_5"], lang } : { lat: w.lat, lon: w.lon, features: ["details", "drive_5"], lang });
      const f = d.features.find((x: Feature) => x.properties.feature_type === "drive_5");
      if (f) winnerDrive5 = { geometry: f.geometry, ref: d.seq };
      w.refs.push(d.seq);
    } catch {
      /* optional */
    }
  }

  limitations.push(
    "POI counts come from Geoapify Places (OpenStreetMap-based); coverage of small shops is incomplete, so counts are relative signals, not market sizes.",
    "Drive times use Geoapify's approximated traffic at query time, not a specific hour.",
    `Weights (${UNIFIED_WEIGHTS_VERSION}) are heuristic and have not been validated against real store outcomes.`,
    "Decision support only.",
  );

  const generatedAt = new Date().toISOString();
  const dataAsOf = generatedAt.slice(0, 10);
  const result: ScoutResult = {
    engine: `sitescout-engine@${ENGINE_VERSION}`,
    weightsVersion: UNIFIED_WEIGHTS_VERSION,
    question,
    plan,
    planner: planned.planner,
    plannerModel: planned.model,
    planNotes: planned.notes,
    profile: { id: profile.id, label: profile.label },
    area: { query: plan.area, anchor, ward, studyRadiusM: studyR, refs: areaRefs },
    origins,
    candidates: scored,
    excluded,
    unconfirmed,
    dataAsOf,
    expiresAt: expiryFor(dataAsOf),
    winnerRoute,
    winnerDrive5,
    limitations: [...new Set(limitations)],
    calls: api.calls,
    creditsEstimated: api.creditsSpent,
    generatedAt,
    durationMs: Date.now() - t0,
  };
  emit({ type: "done", result });
  return result;
}
