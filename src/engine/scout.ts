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
 *  12. Scoring              min-max normalised across candidates (local)
 *
 * Runtime-agnostic: used by the CLI (Node) and the Cloudflare Worker demo.
 * Every number in the result carries `refs` = trace seqs of the calls that
 * produced it.
 */
import { GeoapifyApi, type CallRecord, type Feature, type GeocodeResult, type PlaceProps } from "./geoapify.js";
import type { PlanOutcome, ScoutPlan } from "./plan.js";
import { geometryAreaM2, haversineM, hexGrid, pointInGeometry, round6, type LatLon } from "../geo/grid.js";

export const ENGINE_VERSION = "1.0.0";
export const WEIGHTS = { demand: 0.35, competition: 0.25, access: 0.25, reach: 0.15 } as const;
export const WEIGHTS_VERSION = "1.0.0-isoline";

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
  scores: { demand: number; competition: number; access: number; reach: number };
  total: number;
  why: string;
  refs: number[];
  /** Competitor & demand POIs inside the isochrone (for the map). */
  pois: Array<{ name: string; lat: number; lon: number; kind: "competitor" | "demand"; category: string }>;
}

export interface ScoutResult {
  engine: string;
  weightsVersion: string;
  question: string;
  plan: ScoutPlan;
  planner: PlanOutcome["planner"];
  plannerModel?: string;
  planNotes: string[];
  area: {
    query: string;
    anchor: { lat: number; lon: number; label: string; resultType?: string; confidence?: number; via?: string };
    ward?: { name: string; geometry: Geometry | null; hierarchy: string[] };
    studyRadiusM: number;
    refs: number[];
  };
  origins: Array<{ query: string; label?: string; lat?: number; lon?: number; ref?: number }>;
  candidates: CandidateResult[];
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
}

const HCMC: [number, number] = [106.7009, 10.7769];

function minMax(xs: number[]): (x: number) => number {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return (x) => (hi - lo < 1e-9 ? 0.5 : (x - lo) / (hi - lo));
}

function pickAnchor(results: GeocodeResult[]): GeocodeResult | undefined {
  const pref = ["amenity", "building", "street", "suburb", "district", "postcode"];
  return [...results]
    .filter((r) => haversineM({ lat: r.lat, lon: r.lon }, { lat: HCMC[1], lon: HCMC[0] }) < 40_000)
    // a city/state-level hit means the geocoder fell back to "Hồ Chí Minh" — useless as an anchor
    .filter((r) => !["city", "state", "country", "county"].includes(r.result_type ?? ""))
    .sort((a, b) => (pref.indexOf(a.result_type ?? "") - pref.indexOf(b.result_type ?? "")) || ((b.rank?.confidence ?? 0) - (a.rank?.confidence ?? 0)))[0];
}

/**
 * Resolve an HCMC place name. Measured on 2026-10-22: free-text /geocode/search
 * mis-resolves many HCMC landmarks (e.g. "Chợ Bà Chiểu" → Chợ Bến Thành,
 * "Crescent Mall, Quận 7" → a Tân Bình address) while /geocode/autocomplete
 * often gets them right; but autocomplete on a bare street name ("Xuân Thủy")
 * picks a same-named street elsewhere. So: try autocomplete (name + area),
 * search, autocomplete (bare name); keep the hit whose address contains the
 * most query tokens; reject city-level fallbacks. See docs/FEEDBACK.md.
 */
export async function resolvePlace(api: GeoapifyApi, text: string): Promise<{ hit?: GeocodeResult; refs: number[]; via?: "autocomplete" | "search" }> {
  const refs: number[] = [];
  const fold = (x: string): string => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
  // Pre-2025 admin units ("Phường 12", "Quận 5", "TP Thủ Đức") no longer exist. Measured on
  // 2026-10-22 (bench/hcmc-addresses): sending them makes the geocoder match alley numbers
  // ("Phường 12" → "175/12 Nguyễn Tri Phương"), so they are dropped from the query and the score.
  const legacy = (p: string): boolean => /^(phuong|p\.?)\s*\d+$/.test(p) || /^quan\s/.test(p) || /^(tp\.?|thanh pho)\s*thu duc$/.test(p);
  const rawParts = text.split(",").map((x) => x.trim()).filter(Boolean);
  const keep = rawParts.filter((x) => !legacy(fold(x)));
  // tokens that should appear in a correct answer (drop generic words)
  const parts = keep.map(fold).filter((x) => x && !/^(ho chi minh|tp\.? ?hcm|thanh pho ho chi minh|viet ?nam)$/.test(x));
  const words = (x: string): Set<string> => new Set(x.split(/[^a-z0-9]+/).filter(Boolean));
  const score = (r: GeocodeResult): number => {
    const f = words(fold(r.formatted ?? ""));
    return parts.reduce((n, p, k) => {
      const ws = [...words(p.replace(/^(quan|phuong|duong) /, ""))];
      const ok = ws.length > 0 && ws.every((w) => f.has(w));
      return n + (ok ? (k === 0 ? 2 : 1) : 0);
    }, 0);
  };
  const tried: Array<{ hit: GeocodeResult; via: "autocomplete" | "search"; s: number }> = [];
  const consider = (rs: GeocodeResult[], via: "autocomplete" | "search"): boolean => {
    for (const r of rs) {
      if (!pickAnchor([r])) continue;
      tried.push({ hit: r, via, s: score(r) });
    }
    return tried.some((t) => t.s >= Math.min(parts.length, 2) + 1);
  };
  const short = (keep[0] ?? text).trim();
  const cleaned = keep.join(", ");
  const attempts: Array<() => Promise<{ results: GeocodeResult[]; seq: number }>> = [
    () => api.autocomplete(keep.length > 1 ? keep.slice(0, 2).join(", ") : short, { limit: 5, biasLonLat: HCMC }),
    () => api.geocode(cleaned || text, { limit: 5, biasLonLat: HCMC }),
    () => api.autocomplete(short, { limit: 5, biasLonLat: HCMC }),
  ];
  for (const [k, attempt] of attempts.entries()) {
    try {
      const r = await attempt();
      refs.push(r.seq);
      if (consider(r.results, k === 1 ? "search" : "autocomplete")) break;
    } catch {
      /* next */
    }
  }
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
export async function placesMulti(api: GeoapifyApi, categories: string[], filter: string, limit: number): Promise<{ features: Array<Feature<PlaceProps>>; refs: number[] }> {
  const seen = new Set<string>();
  const features: Array<Feature<PlaceProps>> = [];
  const refs: number[] = [];
  for (const c of categories) {
    const r = await api.places({ categories: [c], filter, limit });
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
  const emit = (e: ScoutEvent): void => opts.onEvent?.(e);
  const plan = planned.plan;
  emit({ type: "plan", plan, planner: planned.planner, notes: planned.notes });
  const spacing = opts.gridSpacingM ?? 300;
  const studyR = opts.studyRadiusM ?? 1300;
  const limitations: string[] = [];

  // 1 — anchor
  emit({ type: "stage", stage: "geocode", detail: plan.area });
  const rp = await resolvePlace(api, plan.area);
  const anchorRes = rp.hit;
  if (!anchorRes) throw new Error(`Could not resolve "${plan.area}" to a place inside Ho Chi Minh City (see trace ${rp.refs.map((x) => "T" + x).join(", ")}).`);
  const anchor = { lat: anchorRes.lat, lon: anchorRes.lon, label: anchorRes.formatted ?? plan.area, resultType: anchorRes.result_type, confidence: anchorRes.rank?.confidence, via: rp.via };
  const areaRefs = [...rp.refs];

  // 2 — ward boundary (new 2025 administrative units)
  emit({ type: "stage", stage: "boundaries" });
  let ward: ScoutResult["area"]["ward"];
  try {
    const b = await api.boundariesPartOf(anchor.lat, anchor.lon);
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
  const area = await placesMulti(api, cats, rect, 200);
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
  const cands: Array<Omit<CandidateResult, "rank" | "scores" | "total" | "why" | "meanDriveMin" | "driveMinByOrigin">> = [];
  for (const [i, p] of chosen.entries()) {
    emit({ type: "stage", stage: "candidate", detail: `${i + 1}/${chosen.length}` });
    const refs: number[] = [];
    let label = `Candidate ${i + 1}`;
    let placeId: string | undefined;
    try {
      const r = await api.reverse(p.lat, p.lon);
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
    const inside = await placesMulti(api, cats, filter, 150);
    refs.push(...inside.refs);
    const demand: Record<string, number> = Object.fromEntries(plan.demandCategories.map((c) => [c, 0]));
    let competitors = 0;
    const pois: CandidateResult["pois"] = [];
    for (const f of inside.features) {
      const pr = f.properties as PlaceProps;
      if (pr.categories?.includes(plan.competitorCategory)) {
        competitors++;
        pois.push({ name: pr.name ?? pr.address_line1 ?? "competitor", lat: pr.lat, lon: pr.lon, kind: "competitor", category: plan.competitorCategory });
      } else {
        const c = plan.demandCategories.find((d) => pr.categories?.includes(d));
        if (c) {
          demand[c]++;
          pois.push({ name: pr.name ?? pr.address_line1 ?? c, lat: pr.lat, lon: pr.lon, kind: "demand", category: c });
        }
      }
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
      const o = await resolvePlace(api, q);
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

  // 12 — scoring (min-max across the candidate set)
  const density = cands.map((c) => c.demandTotal / Math.max(0.05, c.isolineAreaM2 / 1e6));
  const meanDrive = cands.map((_, ti) => {
    const col = times.map((row) => row[ti]).filter((x) => Number.isFinite(x));
    return col.length ? col.reduce((a, b) => a + b, 0) / col.length / 60 : null;
  });
  const nDemand = minMax(density);
  const nComp = minMax(cands.map((c) => c.competitors));
  const nReach = minMax(cands.map((c) => c.isolineAreaM2));
  const drives = meanDrive.filter((x): x is number => x !== null);
  const nDrive = drives.length ? minMax(drives) : () => 0.5;
  const scored: CandidateResult[] = cands.map((c, i) => {
    const scores = {
      demand: nDemand(density[i]),
      competition: 1 - nComp(c.competitors),
      access: meanDrive[i] === null ? 0.5 : 1 - nDrive(meanDrive[i] as number),
      reach: nReach(c.isolineAreaM2),
    };
    const total = WEIGHTS.demand * scores.demand + WEIGHTS.competition * scores.competition + WEIGHTS.access * scores.access + WEIGHTS.reach * scores.reach;
    const refs = [...c.refs, ...(matrixRef !== undefined ? [matrixRef] : [])];
    const topDemand = Object.entries(c.demand).sort((a, b) => b[1] - a[1]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ") || "no demand POIs";
    const why = `${plan.walkMinutes}-min walk reaches ${(c.isolineAreaM2 / 1e6).toFixed(2)} km² with ${topDemand} and ${c.competitors} competing ${plan.competitorCategory}` + (meanDrive[i] !== null ? `; ${Math.round(meanDrive[i] as number)} min average drive from ${okOrigins.length} origin(s).` : ".");
    return {
      ...c,
      rank: 0,
      scores,
      total: Math.round(total * 1000) / 1000,
      why,
      refs,
      meanDriveMin: meanDrive[i] === null ? null : Math.round((meanDrive[i] as number) * 10) / 10,
      driveMinByOrigin: times.map((row) => (Number.isFinite(row[i]) ? Math.round(row[i] / 6) / 10 : null)),
    };
  });
  scored.sort((a, b) => b.total - a.total);
  scored.forEach((c, i) => (c.rank = i + 1));

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
      const d = await api.placeDetails(w.placeId ? { id: w.placeId, features: ["details", "drive_5"] } : { lat: w.lat, lon: w.lon, features: ["details", "drive_5"] });
      const f = d.features.find((x: Feature) => x.properties.feature_type === "drive_5");
      if (f) winnerDrive5 = { geometry: f.geometry, ref: d.seq };
      w.refs.push(d.seq);
    } catch {
      /* optional */
    }
  }

  limitations.push(
    "POI counts come from Geoapify Places (OpenStreetMap-based); coverage of small Vietnamese shops is incomplete, so counts are relative signals, not market sizes.",
    "Drive times use Geoapify's approximated traffic at query time, not a specific hour.",
    `Weights (${WEIGHTS_VERSION}) are heuristic and not calibrated against real store outcomes.`,
    "Decision support only — visit the site before signing a lease.",
  );

  const result: ScoutResult = {
    engine: `sitescout-engine@${ENGINE_VERSION}`,
    weightsVersion: WEIGHTS_VERSION,
    question,
    plan,
    planner: planned.planner,
    plannerModel: planned.model,
    planNotes: planned.notes,
    area: { query: plan.area, anchor, ward, studyRadiusM: studyR, refs: areaRefs },
    origins,
    candidates: scored,
    winnerRoute,
    winnerDrive5,
    limitations: [...new Set(limitations)],
    calls: api.calls,
    creditsEstimated: api.creditsSpent,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
  };
  emit({ type: "done", result });
  return result;
}
