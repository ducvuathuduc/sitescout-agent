/**
 * Agent runtime: plan → act (MCP tools) → trace → score → render.
 *
 * The planner decides WHICH of the 11 Geoapify MCP tools to call, in what
 * order, with what arguments. Execution always goes through
 * GeoapifyMcpClient and every call is appended to the TraceLog — there is
 * no path that produces a claim without a trace entry.
 *
 * Planner: HeuristicPlanner (deterministic, template-driven, zero network
 * calls for planning itself). The default and only planner in v1 — the
 * LLM-planner experiment was cut (REDTEAM.md, GO-WITH-CUTS); the "AI" in the
 * theme is carried by the agent-loop architecture, not an LLM in the hot path.
 *
 * Robustness (ARCHITECTURE.md §5.3):
 *  - every call is budget-planned before it is sent (--budget cap);
 *  - args validated per-tool BEFORE the request (schemas.ts);
 *  - empty geocode results → fallback chain: canonical → folded →
 *    alias-expanded (candidateQueries) → geocode_structured_address;
 *    still empty → `no-result` trace entry, candidate marked unevaluable;
 *  - ambiguous geocode (multiple result_types) → prefer
 *    amenity/building over street over city; choice + alternatives recorded;
 *  - HTTP 429/5xx/timeouts retried with backoff (client); 401 fails fast;
 *  - MCP isError → recorded, never retried.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GeoapifyMcpClient,
  McpToolName,
  ToolArgs,
} from "../mcp/client.js";
import { TraceEntry, TraceLog, cacheResult, digestResult } from "./trace.js";
import { BudgetTracker, settleActual } from "./budget.js";
import {
  GeocodedPoint,
  parseGeocodeResults,
  parseGeometryResult,
  parseMeasureValue,
  parsePlacesResults,
  parseReverseGeocode,
  parseRouteMatrixDurations,
  parseRouteSummary,
  summarizeToolResult,
  type PlaceHit,
} from "../mcp/results.js";
import { candidateQueries } from "../geo/vietnam-address.js";
import {
  EvidenceBundle,
  INSUFFICIENT_DATA_POI_FLOOR,
  MeetupVenueEvidence,
  ScoredCandidate,
  ScoredVenue,
  WEIGHTS_VERSION,
  rankCandidates,
  rankVenues,
  scoreCandidate,
  scoreMeetupVenue,
} from "../scoring/model.js";
import {
  renderMeetupReport,
  renderReport,
  type MeetupReportData,
  type SiteReportData,
} from "../report/render.js";
import {
  MapMarker,
  MapPolygon,
  TracePanelEntry,
  renderVisualReport,
  type VisualReportInput,
} from "../report/map.js";
import type { SiteSelectionQuestion } from "../playbooks/site-selection/questions.js";
import type { MeetupQuestion } from "../playbooks/meetup-planning/questions.js";

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

export interface PlannedCall {
  tool: McpToolName;
  args: ToolArgs;
  /** Why this call exists — surfaced in the trace's resultSummary.rationale. */
  rationale: string;
  /** Extra fields merged into the trace entry's resultSummary. */
  summaryExtra?: Record<string, unknown>;
}

export interface Planner {
  plan(question: SiteSelectionQuestion | MeetupQuestion): Promise<PlannedCall[]>;
}

/**
 * Deterministic template planner (v1). Emits a fixed, reviewable call
 * sequence per question — no LLM involved. Phase 1 (geocoding) is planned
 * up front; phase 2 (per-candidate evidence) is expanded by the executor
 * once coordinates are known, and every expanded call is still validated,
 * budgeted, executed, and traced through the same path.
 */
export class HeuristicPlanner implements Planner {
  async plan(q: SiteSelectionQuestion | MeetupQuestion): Promise<PlannedCall[]> {
    if ("candidateSeeds" in q) return this.planSiteSelection(q);
    return this.planMeetup(q);
  }

  private async planSiteSelection(q: SiteSelectionQuestion): Promise<PlannedCall[]> {
    const calls: PlannedCall[] = [];
    const seeds = [...q.candidateSeeds, ...(q.demandOrigins ?? [])];
    for (const seed of new Set(seeds)) {
      for (const query of candidateQueries(seed)) {
        calls.push({
          tool: "geocode_address",
          args: { query, lang: q.locale ?? "vi", limit: 3, country_codes: ["vn"] },
          rationale: `Geocode seed "${seed}" (fallback query: "${query}")`,
          summaryExtra: { seed, fallbackQuery: query },
        });
      }
    }
    return calls;
  }

  private async planMeetup(q: MeetupQuestion): Promise<PlannedCall[]> {
    const calls: PlannedCall[] = [];
    for (const origin of q.origins) {
      for (const query of candidateQueries(origin)) {
        calls.push({
          tool: "geocode_address",
          args: { query, lang: q.locale ?? "vi", limit: 3, country_codes: ["vn"] },
          rationale: `Geocode meetup origin "${origin}" (fallback query: "${query}")`,
          summaryExtra: { origin, fallbackQuery: query },
        });
      }
    }
    return calls;
  }
}

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

export interface RunDeps {
  mcp: GeoapifyMcpClient;
  budget: BudgetTracker;
  planner: Planner;
}

interface ExecutedCall {
  seq: number;
  result: unknown;
  isError: boolean;
}

async function executeCall(
  trace: TraceLog,
  deps: RunDeps,
  call: PlannedCall,
): Promise<ExecutedCall> {
  const seq = trace.nextSeq;
  deps.budget.plan(seq, call.tool, call.args); // throws on --budget overrun
  const started = Date.now();
  try {
    const { result, isError } = await deps.mcp.callTool(call.tool, call.args);
    const durationMs = Date.now() - started;
    const summary = {
      rationale: call.rationale,
      ...summarizeToolResult(call.tool, result),
      ...(call.summaryExtra ?? {}),
      isError,
    };
    const entry = trace.append({
      tool: call.tool,
      args: call.args,
      resultDigest: digestResult(result),
      resultSummary: summary,
      durationMs,
    });
    cacheResult(trace.questionId, entry.seq, result);
    deps.budget.settle(entry.seq, settleActual(call.tool, call.args, result));
    return { seq: entry.seq, result, isError };
  } catch (err) {
    const durationMs = Date.now() - started;
    const entry = trace.append({
      tool: call.tool,
      args: call.args,
      resultDigest: digestResult({ error: String(err) }),
      resultSummary: { rationale: call.rationale, ...(call.summaryExtra ?? {}) },
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err instanceof Error ? err : new Error(String(err), { cause: entry });
  }
}

/** result_type preference for ambiguous geocodes (ARCHITECTURE.md §5.3). */
const RESULT_TYPE_PREFERENCE = [
  "amenity",
  "building",
  "street",
  "locality",
  "district",
  "city",
];

export interface GeocodeOutcome {
  point: GeocodedPoint;
  /** Which fallback query produced the hit (0 = canonical). */
  queryIndex: number;
  chosenResultType?: string;
  alternatives: number;
}

/**
 * Execute the planner's phase-1 geocode calls for one seed, in plan order,
 * stopping at the first query that yields points (fallback-chain semantics).
 * Returns null when every planned query is exhausted — the caller then tries
 * the structured-address last resort and finally marks the seed unevaluable.
 */
export async function geocodeFromPlan(
  trace: TraceLog,
  deps: RunDeps,
  planned: PlannedCall[],
  seed: string,
): Promise<{ outcome: GeocodeOutcome | null; refs: number[] }> {
  const refs: number[] = [];
  for (const [i, pc] of planned.entries()) {
    let call: ExecutedCall;
    try {
      call = await executeCall(trace, deps, pc);
    } catch {
      continue; // transport/validation failure → next fallback query
    }
    refs.push(call.seq);
    if (call.isError) continue;
    let pts: GeocodedPoint[];
    try {
      pts = parseGeocodeResults(call.result);
    } catch {
      continue;
    }
    if (pts.length === 0) continue; // empty result → next fallback query
    const ranked = [...pts].sort(
      (a, b) =>
        RESULT_TYPE_PREFERENCE.indexOf(a.resultType ?? "") -
          RESULT_TYPE_PREFERENCE.indexOf(b.resultType ?? "") ||
        (b.confidence ?? 0) - (a.confidence ?? 0),
    );
    const point = ranked[0];
    return {
      outcome: {
        point,
        queryIndex: i,
        chosenResultType: point.resultType,
        alternatives: pts.length - 1,
      },
      refs,
    };
  }
  // Last resort: structured address (name-only) without the vn filter.
  try {
    const call = await executeCall(trace, deps, {
      tool: "geocode_structured_address",
      args: { name: seed, country: "Vietnam", lang: "vi", limit: 3 },
      rationale: `Geocode "${seed}" — structured-address last resort`,
      summaryExtra: { seed, lastResort: true },
    });
    refs.push(call.seq);
    if (!call.isError) {
      const pts = parseGeocodeResults(call.result);
      if (pts.length > 0) {
        return {
          outcome: { point: pts[0], queryIndex: planned.length, alternatives: pts.length - 1 },
          refs,
        };
      }
    }
  } catch {
    // fall through to unevaluable
  }
  return { outcome: null, refs };
}

/** Group a phase-1 plan by seed (from summaryExtra.seed). */
function groupPlanBySeed(plan: PlannedCall[]): Map<string, PlannedCall[]> {
  const groups = new Map<string, PlannedCall[]>();
  for (const pc of plan) {
    const seed = String(pc.summaryExtra?.seed ?? pc.summaryExtra?.origin ?? "unknown");
    const list = groups.get(seed) ?? [];
    list.push(pc);
    groups.set(seed, list);
  }
  return groups;
}

function pointGeometry(p: { lat: number; lon: number }): {
  type: "Point";
  coordinates: [number, number];
} {
  return { type: "Point", coordinates: [p.lon, p.lat] };
}

/* ------------------------------------------------------------------ */
/* Playbook 1 — site selection                                         */
/* ------------------------------------------------------------------ */

export interface CandidateEvidence {
  candidateId: string;
  candidateLabel: string;
  point: GeocodedPoint;
  evidence: EvidenceBundle;
  /** Trace seqs backing every claim about this candidate. */
  refs: number[];
  competitorHits: PlaceHit[];
  complementaryHits: PlaceHit[];
  bufferGeometry: { type: string; coordinates: unknown } | null;
  /** Below the data-density floor → excluded from ranking (W3.2). */
  insufficientData: boolean;
}

export interface SiteSelectionResult {
  question: SiteSelectionQuestion;
  scored: ScoredCandidate[];
  /** Candidates excluded by the data-density floor or unevaluable seeds. */
  excluded: Array<{ candidateId: string; candidateLabel: string; reason: string; refs: number[] }>;
  reportMarkdown: string;
  visualHtml: string;
  tracePath: string;
  manifestPath: string;
}

export async function runSiteSelection(
  question: SiteSelectionQuestion,
  deps: RunDeps,
): Promise<SiteSelectionResult> {
  const trace = new TraceLog(question.id);

  // Explicit plan: the planner emits the full phase-1 call sequence BEFORE
  // any network call. The executor below consumes it in order.
  const plan = await deps.planner.plan(question);
  const planBySeed = groupPlanBySeed(plan);

  // Phase 1 — geocode candidate seeds + demand origins.
  const geocoded = new Map<string, GeocodeOutcome>();
  const unevaluable: Array<{ seed: string; refs: number[] }> = [];
  const seeds = [...planBySeed.keys()];
  for (const seed of seeds) {
    const { outcome, refs } = await geocodeFromPlan(
      trace,
      deps,
      planBySeed.get(seed) ?? [],
      seed,
    );
    if (outcome) geocoded.set(seed, outcome);
    else unevaluable.push({ seed, refs });
  }

  // Phase 2 — per-candidate evidence.
  const candidates: CandidateEvidence[] = [];
  for (const seed of question.candidateSeeds) {
    const outcome = geocoded.get(seed);
    if (!outcome) continue; // listed under `excluded`
    const { point } = outcome;
    const refs: number[] = [];
    const call = async (c: PlannedCall): Promise<ExecutedCall> => {
      const r = await executeCall(trace, deps, c);
      refs.push(r.seq);
      return r;
    };

    // Catchment: 800 m buffer (circular approximation — see limitations).
    const radiusKm = question.catchmentRadiusM / 1000;
    const bufferCall = await call({
      tool: "transform_geometry",
      args: {
        operation: "buffer",
        geometry: pointGeometry(point),
        distance: radiusKm, // kilometers (Geoapify default units)
      },
      rationale: `Buffer ${question.catchmentRadiusM} m catchment around "${seed}"`,
    });
    let bufferGeometry: CandidateEvidence["bufferGeometry"] = null;
    let areaM2 = Math.PI * question.catchmentRadiusM ** 2; // fallback if measure fails
    if (!bufferCall.isError) {
      try {
        bufferGeometry = parseGeometryResult(bufferCall.result);
        const measureCall = await call({
          tool: "measure_geometry",
          args: { operation: "area", geometry: bufferGeometry },
          rationale: `Measure catchment area for "${seed}"`,
        });
        if (!measureCall.isError) areaM2 = parseMeasureValue(measureCall.result);
        // Sanity: the buffer must be a valid geometry containing the candidate.
        await call({
          tool: "evaluate_spatial_relation",
          args: { operation: "valid", geometry: bufferGeometry },
          rationale: `Sanity: catchment geometry valid for "${seed}"`,
        });
        await call({
          tool: "evaluate_spatial_relation",
          args: {
            operation: "contains",
            geometry: bufferGeometry,
            other_geometry: pointGeometry(point),
          },
          rationale: `Sanity: catchment contains candidate "${seed}"`,
        });
      } catch {
        // keep the circular fallback area; the trace records the failure
      }
    }

    // Competitors: same business category inside the catchment.
    const compCall = await call({
      tool: "search_places",
      args: {
        category: question.businessCategory,
        lat: point.lat,
        lon: point.lon,
        radius_meters: question.catchmentRadiusM,
        limit: 100,
      },
      rationale: `Competitor sweep (${question.businessCategory}) around "${seed}"`,
    });
    const competitorHits = compCall.isError ? [] : parsePlacesResults(compCall.result);

    // Complementary POIs: demand signals.
    const complementaryHits: PlaceHit[] = [];
    for (const category of question.complementaryCategories) {
      const c = await call({
        tool: "search_places",
        args: {
          category,
          lat: point.lat,
          lon: point.lon,
          radius_meters: question.catchmentRadiusM,
          limit: 50,
        },
        rationale: `Complementary sweep (${category}) around "${seed}"`,
      });
      if (!c.isError) complementaryHits.push(...parsePlacesResults(c.result));
    }

    const totalPois = competitorHits.length + complementaryHits.length;
    const insufficientData = totalPois < INSUFFICIENT_DATA_POI_FLOOR;

    candidates.push({
      candidateId: seed,
      candidateLabel: point.formatted ?? point.name ?? seed,
      point,
      evidence: {
        candidateId: seed,
        candidateLabel: point.formatted ?? point.name ?? seed,
        competitorCount: competitorHits.length,
        complementaryPoiCount: complementaryHits.length,
        catchmentRadiusM: question.catchmentRadiusM,
        catchmentAreaM2: areaM2,
        // meanAccessDurationS filled after the route matrix (phase 2b)
      },
      refs,
      competitorHits,
      complementaryHits,
      bufferGeometry,
      insufficientData,
    });
  }

  // Phase 2b — accessibility: demand origins × candidates route matrix.
  const origins = (question.demandOrigins ?? question.candidateSeeds)
    .map((s) => ({ seed: s, outcome: geocoded.get(s) }))
    .filter((o): o is { seed: string; outcome: GeocodeOutcome } => o.outcome !== undefined);
  const rankable = candidates.filter((c) => !c.insufficientData);
  if (origins.length > 0 && rankable.length > 0) {
    const matrixCall = await executeCall(trace, deps, {
      tool: "calculate_route_matrix",
      args: {
        sources: origins.map((o) => ({ lat: o.outcome.point.lat, lon: o.outcome.point.lon })),
        targets: rankable.map((c) => ({ lat: c.point.lat, lon: c.point.lon })),
        mode: "drive",
        traffic: "approximated", // traffic-aware (REDTEAM W3.4); timestamp in trace
      },
      rationale: `Accessibility matrix: ${origins.length} origins × ${rankable.length} candidates (drive, approximated traffic)`,
    });
    if (!matrixCall.isError) {
      try {
        const durations = parseRouteMatrixDurations(matrixCall.result);
        rankable.forEach((c, ti) => {
          const col = durations.map((row) => row[ti]).filter((d) => Number.isFinite(d));
          c.evidence.meanAccessDurationS =
            col.length > 0 ? col.reduce((a, b) => a + b, 0) / col.length : undefined;
          c.refs.push(matrixCall.seq);
        });
      } catch {
        // accessibility stays unevaluable (neutral 0.5); trace records it
      }
    }
  }

  // Phase 3 — score, rank, render.
  const scored = rankCandidates(
    rankable.map((c) => scoreCandidate(c.evidence, undefined, c.refs)),
  );
  const excluded = [
    ...candidates
      .filter((c) => c.insufficientData)
      .map((c) => ({
        candidateId: c.candidateId,
        candidateLabel: c.candidateLabel,
        reason: `insufficient-data: only ${c.evidence.competitorCount + c.evidence.complementaryPoiCount} POIs in catchment (floor ${INSUFFICIENT_DATA_POI_FLOOR}) — excluded from ranking, not scored as "no competition"`,
        refs: c.refs,
      })),
    ...unevaluable.map((u) => ({
      candidateId: u.seed,
      candidateLabel: u.seed,
      reason: "unevaluable: geocoding fallback chain exhausted (no-result) — seed not scored",
      refs: u.refs,
    })),
  ];

  const data: SiteReportData = {
    question,
    scored,
    excluded,
    trace: trace.all(),
    weightsVersion: WEIGHTS_VERSION,
    creditsReport: deps.budget.report(),
  };
  const reportMarkdown = renderReport(data);
  const visualHtml = renderVisualReport(buildSiteVisualInput(question, scored, candidates, trace.all()));

  const outDir = join("examples", "site-selection", question.id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.md"), reportMarkdown);
  writeFileSync(join(outDir, "report.html"), visualHtml);

  const manifestPath = join("research", "smoke", "results", question.id, "run.json");
  mkdirSync(join("research", "smoke", "results", question.id), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        playbook: "site-selection",
        question,
        evidence: candidates.map((c) => c.evidence),
        scored,
        excluded,
        weightsVersion: WEIGHTS_VERSION,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return {
    question,
    scored,
    excluded,
    reportMarkdown,
    visualHtml,
    tracePath: trace.path,
    manifestPath,
  };
}

function buildSiteVisualInput(
  question: SiteSelectionQuestion,
  scored: ScoredCandidate[],
  candidates: CandidateEvidence[],
  trace: readonly TraceEntry[],
): VisualReportInput {
  const markers: MapMarker[] = [];
  const polygons: MapPolygon[] = [];
  for (const c of candidates) {
    if (c.bufferGeometry) {
      polygons.push({
        geometry: c.bufferGeometry as MapPolygon["geometry"],
        label: `Catchment — ${c.candidateLabel} (${question.catchmentRadiusM} m buffer)`,
        kind: "catchment",
        traceRefs: c.refs,
      });
    }
    for (const h of c.competitorHits) {
      if (h.lat !== undefined && h.lon !== undefined) {
        markers.push({ lat: h.lat, lon: h.lon, label: h.name ?? "competitor", kind: "competitor", traceRefs: c.refs });
      }
    }
    for (const h of c.complementaryHits) {
      if (h.lat !== undefined && h.lon !== undefined) {
        markers.push({ lat: h.lat, lon: h.lon, label: h.name ?? "POI", kind: "complementary", traceRefs: c.refs });
      }
    }
  }
  scored.forEach((s, i) => {
    const c = candidates.find((x) => x.candidateId === s.candidateId);
    if (c) {
      markers.push({
        lat: c.point.lat,
        lon: c.point.lon,
        label: `#${i + 1} ${s.candidateLabel}`,
        kind: "shortlist",
        rank: i + 1,
        traceRefs: s.evidenceRefs,
      });
    }
  });
  const center = candidates[0]?.point ?? { lat: 10.7769, lon: 106.7009 };
  return {
    title: `SiteScout — ${question.title}`,
    question: question.question,
    generatedAt: new Date().toISOString(),
    tracePath: `logs/${question.id}.jsonl`,
    view: { lat: center.lat, lon: center.lon, zoom: 14 },
    markers,
    polygons,
    shortlist: scored.map((s, i) => ({
      rank: i + 1,
      label: s.candidateLabel,
      total: s.total,
      subscores: s.scores,
      why: `Competition ${s.scores.competition.toFixed(2)} · complementarity ${s.scores.complementarity.toFixed(2)} · catchment ${s.scores.catchment.toFixed(2)} · accessibility ${s.scores.accessibility.toFixed(2)}`,
      traceRefs: s.evidenceRefs,
    })),
    trace: tracePanel(trace),
    limitations: siteLimitations(),
  };
}

/* ------------------------------------------------------------------ */
/* Playbook 2 — meetup planning                                        */
/* ------------------------------------------------------------------ */

export interface MeetupResult {
  question: MeetupQuestion;
  venues: ScoredVenue[];
  winner: ScoredVenue | null;
  winnerLabel: string | null;
  legs: Array<{ origin: string; timeS?: number; distanceM?: number; refs: number[] }>;
  reportMarkdown: string;
  visualHtml: string;
  tracePath: string;
  manifestPath: string;
}

export async function runMeetup(
  question: MeetupQuestion,
  deps: RunDeps,
): Promise<MeetupResult> {
  const trace = new TraceLog(question.id);

  // Explicit plan first; the executor consumes it in order.
  const plan = await deps.planner.plan(question);
  const planBySeed = groupPlanBySeed(plan);

  // 1. Geocode every origin (fallback chain; none dropped silently).
  const origins: Array<{ label: string; point: GeocodedPoint; refs: number[] }> = [];
  const unevaluableOrigins: string[] = [];
  for (const seed of planBySeed.keys()) {
    const { outcome, refs } = await geocodeFromPlan(trace, deps, planBySeed.get(seed) ?? [], seed);
    if (outcome) origins.push({ label: seed, point: outcome.point, refs });
    else unevaluableOrigins.push(seed);
  }
  if (origins.length === 0) {
    throw new Error(
      `meetup aborted: none of the ${question.origins.length} origins geocoded ` +
        `(see trace ${trace.path})`,
    );
  }

  // 2. Midpoint heuristic → candidate venue areas.
  const mid = {
    lat: origins.reduce((s, o) => s + o.point.lat, 0) / origins.length,
    lon: origins.reduce((s, o) => s + o.point.lon, 0) / origins.length,
  };
  const venueHits: PlaceHit[] = [];
  const venueRefs: number[] = [];
  for (const category of question.venueCategories) {
    const call = await executeCall(trace, deps, {
      tool: "search_places",
      args: {
        category,
        lat: mid.lat,
        lon: mid.lon,
        radius_meters: question.venueRadiusM,
        limit: 20,
      },
      rationale: `Venue sweep (${category}) around midpoint of ${origins.length} origins`,
    });
    venueRefs.push(call.seq);
    if (!call.isError) venueHits.push(...parsePlacesResults(call.result));
  }
  // Dedupe by name, keep venues with coordinates, cap at 10 (matrix credits).
  const seen = new Set<string>();
  const venues = venueHits
    .filter((h) => {
      const key = (h.name ?? "") + "|" + (h.lat ?? 0).toFixed(5);
      if (h.lat === undefined || h.lon === undefined || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  // 3. Route matrix: origins × venues → min-max fair venue.
  const matrixCall = await executeCall(trace, deps, {
    tool: "calculate_route_matrix",
    args: {
      sources: origins.map((o) => ({ lat: o.point.lat, lon: o.point.lon })),
      targets: venues.map((v) => ({ lat: v.lat as number, lon: v.lon as number })),
      mode: "drive",
      traffic: "approximated",
    },
    rationale: `Fairness matrix: ${origins.length} origins × ${venues.length} venues (drive, approximated traffic)`,
  });
  const durations = matrixCall.isError ? [] : parseRouteMatrixDurations(matrixCall.result);
  const evidence: MeetupVenueEvidence[] = venues.map((v, vi) => ({
    venueId: `${question.id}-venue-${vi}`,
    venueLabel: v.name ?? v.formatted ?? `Venue ${vi + 1}`,
    lat: v.lat,
    lon: v.lon,
    durationsS: durations.map((row) => row[vi]).filter((d) => Number.isFinite(d)),
    traceRefs: [...venueRefs, matrixCall.seq],
  }));
  const ranked = rankVenues(
    evidence.filter((e) => e.durationsS.length > 0).map(scoreMeetupVenue),
  );
  const winner = ranked[0] ?? null;
  const venueById = new Map(evidence.map((e, vi) => [e.venueId, venues[vi]]));

  // 4. Final legs per participant + human-readable label for the fair point.
  const legs: MeetupResult["legs"] = [];
  let winnerLabel: string | null = null;
  if (winner) {
    const wv = venueById.get(winner.venueId);
    if (!wv || wv.lat === undefined || wv.lon === undefined) {
      throw new Error("meetup: winner venue has no coordinates (unreachable)");
    }
    for (const o of origins) {
      const legCall = await executeCall(trace, deps, {
        tool: "calculate_route",
        args: {
          waypoints: [
            { lat: o.point.lat, lon: o.point.lon },
            { lat: wv.lat as number, lon: wv.lon as number },
          ],
          mode: "drive",
          traffic: "approximated",
        },
        rationale: `Final leg: "${o.label}" → "${winner.venueLabel}"`,
      });
      const summary = legCall.isError ? {} : parseRouteSummary(legCall.result);
      legs.push({ origin: o.label, ...summary, refs: [legCall.seq] });
    }
    const revCall = await executeCall(trace, deps, {
      tool: "reverse_geocode_coordinates",
      args: { lat: wv.lat as number, lon: wv.lon as number, lang: question.locale ?? "vi" },
      rationale: `Human-readable label for the fair point`,
    });
    if (!revCall.isError) {
      try {
        winnerLabel = parseReverseGeocode(revCall.result);
      } catch {
        winnerLabel = winner.venueLabel;
      }
    }
  }

  const data: MeetupReportData = {
    question,
    venues: ranked,
    winner,
    winnerLabel,
    legs,
    unevaluableOrigins,
    trace: trace.all(),
    creditsReport: deps.budget.report(),
  };
  const reportMarkdown = renderMeetupReport(data);
  const visualHtml = renderVisualReport(
    buildMeetupVisualInput(question, ranked, winner, origins, mid, trace.all()),
  );

  const outDir = join("examples", "meetup-planning", question.id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.md"), reportMarkdown);
  writeFileSync(join(outDir, "report.html"), visualHtml);

  const manifestPath = join("research", "smoke", "results", question.id, "run.json");
  mkdirSync(join("research", "smoke", "results", question.id), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        playbook: "meetup-planning",
        question,
        venues: ranked,
        winner,
        winnerLabel,
        legs,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return {
    question,
    venues: ranked,
    winner,
    winnerLabel,
    legs,
    reportMarkdown,
    visualHtml,
    tracePath: trace.path,
    manifestPath,
  };
}

function buildMeetupVisualInput(
  question: MeetupQuestion,
  ranked: ScoredVenue[],
  winner: ScoredVenue | null,
  origins: Array<{ label: string; point: GeocodedPoint }>,
  mid: { lat: number; lon: number },
  trace: readonly TraceEntry[],
): VisualReportInput {
  const markers: MapMarker[] = origins.map((o) => ({
    lat: o.point.lat,
    lon: o.point.lon,
    label: `Origin: ${o.label}`,
    kind: "origin",
  }));
  ranked.slice(0, 5).forEach((v, i) => {
    if (v.lat === undefined || v.lon === undefined) return;
    markers.push({
      lat: v.lat,
      lon: v.lon,
      label: `#${i + 1} ${v.venueLabel} (worst ${Math.round(v.maxDurationS / 60)} min)`,
      kind: i === 0 ? "shortlist" : "venue",
      rank: i === 0 ? 1 : undefined,
      traceRefs: v.traceRefs,
    });
  });
  const polygons: MapPolygon[] = [
    {
      geometry: {
        type: "Polygon",
        coordinates: [circlePolygon(mid.lat, mid.lon, question.venueRadiusM)],
      },
      label: `Venue search radius (${question.venueRadiusM} m, approximation)`,
      kind: "buffer-ring",
    },
  ];
  return {
    title: `SiteScout — ${question.title}`,
    question: question.question,
    generatedAt: new Date().toISOString(),
    tracePath: `logs/${question.id}.jsonl`,
    view: { lat: mid.lat, lon: mid.lon, zoom: 12 },
    markers,
    polygons,
    shortlist: ranked.slice(0, 5).map((v, i) => ({
      rank: i + 1,
      label: v.venueLabel,
      total: v.score,
      subscores: {
        competition: 0,
        complementarity: 0,
        catchment: 0,
        accessibility: v.score,
      },
      why:
        `Fairest by min-max: worst participant ${Math.round(v.maxDurationS / 60)} min, ` +
        `mean ${Math.round(v.meanDurationS / 60)} min`,
      traceRefs: v.traceRefs,
    })),
    trace: tracePanel(trace),
    limitations: siteLimitations(),
  };
}

/** Approximate circle polygon (64 steps) for buffer-ring display. */
function circlePolygon(lat: number, lon: number, radiusM: number): number[][] {
  const pts: number[][] = [];
  const rLat = radiusM / 111_320;
  const rLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + rLon * Math.cos(a), lat + rLat * Math.sin(a)]);
  }
  pts.push(pts[0]);
  return pts;
}

/* ------------------------------------------------------------------ */
/* Shared report helpers                                               */
/* ------------------------------------------------------------------ */

function tracePanel(trace: readonly TraceEntry[]): TracePanelEntry[] {
  return trace.map((e) => ({
    seq: e.seq,
    tool: e.tool,
    summary: JSON.stringify(e.resultSummary),
    durationMs: e.durationMs,
    error: e.error,
  }));
}

function siteLimitations(): string[] {
  return [
    "Catchments are circular-buffer approximations (transform_geometry buffer), not drive-time isochrones — the Geoapify MCP server exposes no isochrone tool (Isoline is REST-only); filed as docs/FEEDBACK.md#1. Treat accessibility scores as directional.",
    `Scores use v0 heuristic weights (${WEIGHTS_VERSION}); calibration against ground truth is pending a live key.`,
    "Candidates below the POI data-density floor are excluded from ranking, never scored as “no competition” (REDTEAM W3.2).",
    "POI data reflects Geoapify's places index at query time, not live foot traffic. Route times use approximated traffic at query time — time-of-day dependent.",
    "This report is decision support, not a guarantee of business outcomes.",
  ];
}
