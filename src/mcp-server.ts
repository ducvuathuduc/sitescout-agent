#!/usr/bin/env node
/**
 * SiteScout MCP server (stdio).
 *
 * Exposes the isoline-first site-selection engine to any MCP host
 * (Claude Code, Cursor, Claude Desktop, …). Every tool declares an
 * outputSchema and returns structuredContent, so hosts can rely on the shape.
 *
 * Geoapify access, in order of preference:
 *   1. GEOAPIFY_API_KEY set     → calls https://api.geoapify.com with your key
 *                                  (sent as an x-api-key header, never logged).
 *   2. SITESCOUT_GEOAPIFY_BASE   → any compatible base URL, e.g. the public demo
 *                                  proxy https://sitescout.huynhthanh.workers.dev/geo
 *                                  (HCMC only, rate-limited, no key needed).
 *
 * Tools
 *   plan_site_question   question → validated plan (0 credits)
 *   scout_site           question/plan → ranked shortlist with isochrones, citations
 *   resolve_place        Vietnamese place text → best Geoapify match (+ alternatives)
 *   walk_isochrone       lat/lon/minutes → isoline polygon + area
 *   get_evidence         [Tn] reference from the last run → the exact API call
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GeoapifyApi } from "./engine/geoapify.js";
import { heuristicPlan, validatePlan, ScoutPlanSchema, type PlanOutcome, type ScoutPlan } from "./engine/plan.js";
import { runScout, resolvePlace, type ScoutResult } from "./engine/scout.js";
import { renderMarkdown } from "./engine/render.js";
import { CATEGORY_SET } from "./engine/categories.js";

const VERSION = "1.0.0";
const DEMO_PROXY = "https://sitescout.huynhthanh.workers.dev/geo";

function makeApi(creditCap: number): GeoapifyApi {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  const baseUrl = process.env.SITESCOUT_GEOAPIFY_BASE ?? (apiKey ? undefined : DEMO_PROXY);
  return new GeoapifyApi({ apiKey, baseUrl, creditCap });
}

let last: ScoutResult | undefined;

const fold = (x: string): string =>
  x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const GENERIC = new Set(["ho", "chi", "minh", "hcm", "hcmc", "tp", "thanh", "pho", "phuong", "quan", "duong", "city", "vietnam", "viet", "nam", "district", "ward"]);

/**
 * Did the geocoder land where the user asked? Recorded in a transcript
 * (agent/transcripts/02a): a model garbled "Bình Thạnh" in its tool call and
 * the run silently analysed another ward. Hosts must surface a mismatch.
 */
export function areaCheck(query: string, anchorLabel: string, wardName?: string): string {
  const hay = new Set(fold(`${anchorLabel} ${wardName ?? ""}`).split(/[^a-z0-9]+/));
  const toks = fold(query).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !GENERIC.has(t));
  if (toks.length === 0) return "ok";
  const hit = toks.filter((t) => hay.has(t));
  return hit.length > 0 ? "ok" : `mismatch: none of [${toks.join(", ")}] appear in the resolved area "${anchorLabel}" — tell the user and re-run with a corrected plan.area`;
}

const CandidateOut = z.object({
  rank: z.number(),
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  total: z.number(),
  competitors: z.number(),
  demandTotal: z.number(),
  meanDriveMin: z.number().nullable(),
  isochroneAreaKm2: z.number().nullable(),
  why: z.string(),
  refs: z.array(z.number()),
  evidence: z.object({
    label: z.array(z.number()),
    isochrone: z.array(z.number()),
    poiCounts: z.array(z.number()),
    driveTimes: z.array(z.number()),
  }).describe("Which [Tn] refs back which number: label = reverse geocoding, isochrone = walk area, poiCounts = competitors/demand, driveTimes = route matrix"),
});

export function summarize(r: ScoutResult): z.infer<typeof ScoutOut> {
  const apiOf = new Map(r.calls.map((c) => [c.seq, c.api]));
  const pick = (refs: number[], ...apis: string[]): number[] => refs.filter((x) => apis.includes(apiOf.get(x) ?? ""));
  return {
    question: r.question,
    business: r.plan.business,
    area: r.area.ward?.name ?? r.plan.area,
    areaQuery: r.area.query,
    resolvedAnchor: r.area.anchor.label,
    areaCheck: areaCheck(r.area.query, r.area.anchor.label, r.area.ward?.name),
    planner: r.planner,
    walkMinutes: r.plan.walkMinutes,
    candidates: r.candidates.map((c) => ({
      rank: c.rank,
      label: c.label,
      lat: c.lat,
      lon: c.lon,
      total: Number(c.total.toFixed(3)),
      competitors: c.competitors,
      demandTotal: c.demandTotal,
      meanDriveMin: c.meanDriveMin,
      isochroneAreaKm2: c.isoline ? Number((c.isolineAreaM2 / 1e6).toFixed(3)) : null,
      why: c.why,
      refs: c.refs,
      evidence: {
        label: pick(c.refs, "reverse-geocoding"),
        isochrone: pick(c.refs, "isoline"),
        poiCounts: pick(c.refs, "places"),
        driveTimes: pick(c.refs, "route-matrix"),
      },
    })),
    topCandidateCalls: (r.candidates[0]?.refs ?? [])
      .map((x) => r.calls.find((c) => c.seq === x))
      .filter((c): c is NonNullable<typeof c> => !!c && c.api !== "place-details" && c.api !== "routing")
      .map((c) => ({ ref: c.seq, api: c.api, endpoint: `${c.method} ${c.endpoint}`, summary: c.summary })),
    planNotes: r.planNotes,
    limitations: r.limitations,
    calls: r.calls.length,
    creditsEstimated: r.creditsEstimated,
  };
}

const ScoutOut = z.object({
  question: z.string(),
  business: z.string(),
  area: z.string(),
  areaQuery: z.string(),
  resolvedAnchor: z.string(),
  areaCheck: z.string(),
  planner: z.string(),
  walkMinutes: z.number(),
  candidates: z.array(CandidateOut),
  topCandidateCalls: z.array(z.object({ ref: z.number(), api: z.string(), endpoint: z.string(), summary: z.record(z.unknown()) }))
    .describe("The exact Geoapify requests (key never included) behind the #1 candidate — quote these instead of reconstructing a URL"),
  planNotes: z.array(z.string()),
  limitations: z.array(z.string()),
  calls: z.number(),
  creditsEstimated: z.number(),
});

/**
 * Apply a host's plan overrides without letting a bad field sink the run.
 * Recorded in agent/transcripts/02b: a model passed "Nhà thuốc" as a category.
 * Invalid categories are dropped (with a note the model can read) and the
 * planner's validated value is kept.
 */
export function mergeOverrides(base: ScoutPlan, o: Partial<ScoutPlan>, notes: string[]): ScoutPlan {
  const next: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(o)) if (v !== undefined) next[k] = v;
  if (o.competitorCategory && !CATEGORY_SET.has(o.competitorCategory)) {
    notes.push(`ignored competitorCategory "${o.competitorCategory}" (not a Geoapify category); kept "${base.competitorCategory}"`);
    next.competitorCategory = base.competitorCategory;
  }
  if (o.demandCategories) {
    const ok = o.demandCategories.filter((c) => CATEGORY_SET.has(c));
    const bad = o.demandCategories.filter((c) => !CATEGORY_SET.has(c));
    if (bad.length) notes.push(`ignored demand categories ${JSON.stringify(bad)} (not Geoapify categories)`);
    next.demandCategories = ok.length ? ok : base.demandCategories;
  }
  const parsed = ScoutPlanSchema.safeParse(next);
  if (!parsed.success) {
    notes.push(`plan overrides rejected (${parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ")}); used the planner's plan`);
    return base;
  }
  return validatePlan(parsed.data, notes);
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "sitescout", version: VERSION },
    {
      instructions:
        "SiteScout ranks candidate locations for a small business in Ho Chi Minh City using Geoapify (geocoding, boundaries, places, isolines, route matrix, routing). " +
        "Typical flow: plan_site_question → (optionally edit the plan) → scout_site → get_evidence for any number you quote. " +
        "Always cite numbers with their [Tn] reference; never state a figure that is not in a tool result. HCMC only.",
    },
  );

  server.registerTool(
    "plan_site_question",
    {
      title: "Plan a site-selection question",
      description: "Turn a question like 'Where should I open a pharmacy in Bình Thạnh?' into a validated SiteScout plan (business, Geoapify categories, area, walk minutes, origins). Costs 0 Geoapify credits.",
      inputSchema: { question: z.string().min(5).max(300) },
      outputSchema: { plan: ScoutPlanSchema, notes: z.array(z.string()) },
    },
    async ({ question }) => {
      const p = heuristicPlan(question);
      return { content: [{ type: "text", text: JSON.stringify(p.plan, null, 2) }], structuredContent: { plan: p.plan, notes: p.notes } };
    },
  );

  server.registerTool(
    "scout_site",
    {
      title: "Rank candidate sites",
      description:
        "Run the full SiteScout analysis: resolve the area and its post-2025 ward boundary, generate 5–8 candidate points, draw a walking isochrone around each, count competitors and demand generators inside it, compute drive times from origins, and rank. Returns a cited shortlist. Uses ~60–90 Geoapify credits.",
      inputSchema: {
        question: z.string().min(5).max(300),
        plan: ScoutPlanSchema.partial().optional().describe("Optional overrides for the plan from plan_site_question"),
        creditCap: z.number().int().min(50).max(400).default(250),
      },
      outputSchema: ScoutOut.shape,
    },
    async ({ question, plan, creditCap }) => {
      const base = heuristicPlan(question);
      const notes = [...base.notes];
      const merged: PlanOutcome = plan ? { ...base, plan: mergeOverrides(base.plan, plan, notes), notes, planner: "llm", model: "mcp-host (plan overrides)" } : base;
      const api = makeApi(creditCap);
      const r = await runScout(question, merged, { api });
      last = r;
      const s = summarize(r);
      const warn = s.areaCheck === "ok" ? "" : `⚠️ AREA CHECK: ${s.areaCheck}\n\n`;
      return { content: [{ type: "text", text: warn + renderMarkdown(r) }], structuredContent: s };
    },
  );

  server.registerTool(
    "resolve_place",
    {
      title: "Resolve a Vietnamese place name",
      description: "Geocode an HCMC place/address (handles old and post-July-2025 ward names) using Geoapify autocomplete + search and return the best match with confidence and admin fields. 1–3 credits.",
      inputSchema: { text: z.string().min(2).max(160) },
      outputSchema: {
        found: z.boolean(),
        via: z.string().nullable(),
        formatted: z.string().nullable(),
        lat: z.number().nullable(),
        lon: z.number().nullable(),
        resultType: z.string().nullable(),
        confidence: z.number().nullable(),
        suburb: z.string().nullable(),
        city: z.string().nullable(),
      },
    },
    async ({ text }) => {
      const api = makeApi(20);
      const { hit, via } = await resolvePlace(api, text);
      const out = {
        found: !!hit,
        via: via ?? null,
        formatted: hit?.formatted ?? null,
        lat: hit?.lat ?? null,
        lon: hit?.lon ?? null,
        resultType: hit?.result_type ?? null,
        confidence: hit?.rank?.confidence ?? null,
        suburb: hit?.suburb ?? null,
        city: hit?.city ?? null,
      };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    },
  );

  server.registerTool(
    "walk_isochrone",
    {
      title: "Walking isochrone",
      description: "Geoapify Isoline API: the area reachable on foot (or by motorbike/drive) within N minutes from a point in HCMC. Returns the polygon as GeoJSON plus its id.",
      inputSchema: {
        lat: z.number().min(10.35).max(11.2),
        lon: z.number().min(106.35).max(107.05),
        minutes: z.number().int().min(1).max(30).default(10),
        mode: z.enum(["walk", "motorcycle", "drive", "bicycle"]).default("walk"),
      },
      outputSchema: { isolineId: z.string(), geometry: z.object({ type: z.string(), coordinates: z.unknown() }) },
    },
    async ({ lat, lon, minutes, mode }) => {
      const api = makeApi(20);
      const { feature, id } = await api.isoline({ lat, lon, mode, range: minutes * 60 });
      const geometry = feature.geometry as { type: string; coordinates: unknown };
      return { content: [{ type: "text", text: `isoline ${id} (${mode}, ${minutes} min) — ${geometry.type}` }], structuredContent: { isolineId: id, geometry } };
    },
  );

  server.registerTool(
    "get_evidence",
    {
      title: "Show the API call behind a citation",
      description: "Return the exact Geoapify request (endpoint without key, status, summary, credits) behind a [Tn] reference from the most recent scout_site run.",
      inputSchema: { ref: z.number().int().min(0) },
      outputSchema: { ref: z.number(), api: z.string(), method: z.string(), endpoint: z.string(), status: z.number(), summary: z.record(z.unknown()), credits: z.number() },
    },
    async ({ ref }) => {
      const c = last?.calls.find((x) => x.seq === ref);
      if (!c) return { isError: true, content: [{ type: "text", text: last ? `No call T${ref} in the last run (0–${last.calls.length - 1}).` : "Run scout_site first." }] };
      const out = { ref, api: c.api, method: c.method, endpoint: c.endpoint, status: c.status, summary: c.summary, credits: c.credits };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
    },
  );

  return server;
}

const isMain = process.argv[1] && /mcp-server\.(js|ts)$/.test(process.argv[1]);
if (isMain) {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
