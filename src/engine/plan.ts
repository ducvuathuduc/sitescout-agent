/**
 * Question → validated ScoutPlan.
 *
 * Two planners produce the same zod-validated plan:
 *  - heuristicPlan(): deterministic keyword planner, zero network calls — the
 *    default, so every committed example is reproducible.
 *  - llmPlan(): any OpenAI-compatible chat endpoint. The model only proposes a
 *    plan; zod + the live category catalog verify it, invalid categories are
 *    dropped, and any failure falls back to the heuristic plan. The model
 *    never produces a number that reaches the report.
 *
 * Market-specific data (keywords, area aliases, origins, prompt) comes from a
 * CountryProfile. Every function takes an optional profile and defaults to
 * VN_HCMC_PROFILE, so existing callers are unchanged.
 */
import { z } from "zod";
import { CATEGORY_SET } from "./categories.js";
import { VN_HCMC_PROFILE, type CountryProfile } from "./profile.js";

export { VN_HCMC_PROFILE } from "./profile.js";
export type { CountryProfile, BusinessRule, AreaAlias } from "./profile.js";

export const ScoutPlanSchema = z.object({
  /** Business type in plain words, e.g. "specialty coffee shop". */
  business: z.string().min(2).max(80),
  /** Geoapify category of direct competitors. */
  competitorCategory: z.string(),
  /** Up to 4 Geoapify categories that generate demand. */
  demandCategories: z.array(z.string()).min(1).max(4),
  /** Area text to geocode, inside the market's city or region. */
  area: z.string().min(2).max(120),
  /** Walk-time catchment in minutes (5–15). */
  walkMinutes: z.number().int().min(5).max(15),
  /** Number of candidates to evaluate (5–8). */
  candidates: z.number().int().min(5).max(8),
  /** Demand origins for the drive-time matrix (1–3 places). */
  origins: z.array(z.string().min(2).max(120)).min(1).max(3),
});
export type ScoutPlan = z.infer<typeof ScoutPlanSchema>;

export interface PlanOutcome {
  plan: ScoutPlan;
  planner: "heuristic" | "llm";
  model?: string;
  /** What validation changed or why the LLM plan was rejected. */
  notes: string[];
  /** Raw model output, kept for the AI transcript. */
  raw?: string;
}

/* Legacy exports: aliases of the default (VN HCMC) profile so existing imports keep working. */
export const BUSINESS_RULES = VN_HCMC_PROFILE.businessRules;
export const AREA_ALIASES = VN_HCMC_PROFILE.areaAliases;
export const DEFAULT_ORIGINS = VN_HCMC_PROFILE.defaultOrigins;
export const PLANNER_SYSTEM_PROMPT = VN_HCMC_PROFILE.plannerPrompt;

/** Extract the area phrase from a question using the profile's pattern. */
function areaPhrase(q: string, profile: CountryProfile): string | undefined {
  const m = q.match(profile.areaPhrasePattern);
  return m?.[1]?.trim();
}

export function heuristicPlan(question: string, profile: CountryProfile = VN_HCMC_PROFILE): PlanOutcome {
  const notes: string[] = [];
  const rule = profile.businessRules.find((r) => r.match.test(question)) ?? profile.businessRules[0];
  if (!profile.businessRules.some((r) => r.match.test(question))) notes.push(`no business keyword recognised — defaulted to ${rule.business}`);
  const alias = profile.areaAliases.find((a) => a.match.test(question));
  let area = alias?.area;
  if (!area) {
    const phrase = areaPhrase(question, profile);
    area = phrase ? `${phrase}, ${profile.areaSuffix}` : profile.areaAliases[0].area;
    if (!phrase) notes.push(`no area recognised — defaulted to ${profile.defaultAreaLabel}`);
  }
  const origins = profile.defaultOrigins.filter((o) => !area!.includes(o.split(",")[0]));
  const plan: ScoutPlan = {
    business: rule.business,
    competitorCategory: rule.competitor,
    demandCategories: rule.demand.slice(0, 3),
    area,
    walkMinutes: 10,
    candidates: 7,
    origins: origins.slice(0, 3),
  };
  return { plan: validatePlan(plan, notes), planner: "heuristic", notes };
}

/** Drop categories missing from the live catalog; throws if nothing usable remains. */
export function validatePlan(p: ScoutPlan, notes: string[]): ScoutPlan {
  const parsed = ScoutPlanSchema.parse(p);
  if (!CATEGORY_SET.has(parsed.competitorCategory)) {
    throw new Error(`competitor category "${parsed.competitorCategory}" is not a Geoapify category`);
  }
  const demand = parsed.demandCategories.filter((c) => {
    const ok = CATEGORY_SET.has(c) && c !== parsed.competitorCategory;
    if (!ok) notes.push(`dropped invalid demand category "${c}"`);
    return ok;
  });
  if (demand.length === 0) throw new Error("no valid demand categories");
  return { ...parsed, demandCategories: demand };
}

export interface LlmConfig {
  /** OpenAI-compatible base URL, e.g. https://api.groq.com/openai/v1 */
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/** LLM planner with schema validation and heuristic fallback. */
export async function llmPlan(question: string, cfg: LlmConfig, profile: CountryProfile = VN_HCMC_PROFILE): Promise<PlanOutcome> {
  const notes: string[] = [];
  const f = cfg.fetchImpl ?? fetch.bind(globalThis);
  let raw = "";
  try {
    const res = await f(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: profile.plannerPrompt },
          { role: "user", content: question },
        ],
      }),
    });
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
    raw = body.choices?.[0]?.message?.content ?? "";
    return { plan: parseLlmPlan(raw, notes, question, profile), planner: "llm", model: cfg.model, notes, raw };
  } catch (e) {
    const fb = heuristicPlan(question, profile);
    return { ...fb, notes: [`LLM plan rejected (${e instanceof Error ? e.message : String(e)}) — heuristic fallback`, ...fb.notes], raw };
  }
}

/** Parse + validate a model's JSON (also used by the Workers AI path). */
export function parseLlmPlan(raw: string, notes: string[], question?: string, profile: CountryProfile = VN_HCMC_PROFILE): ScoutPlan {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const obj = JSON.parse(json) as Record<string, unknown>;
  // tolerate small type slips before strict validation
  if (typeof obj.walkMinutes === "string") obj.walkMinutes = Number(obj.walkMinutes);
  if (typeof obj.candidates === "string") obj.candidates = Number(obj.candidates);
  if (typeof obj.walkMinutes === "number") obj.walkMinutes = Math.min(15, Math.max(5, Math.round(obj.walkMinutes)));
  if (typeof obj.candidates === "number") obj.candidates = Math.min(8, Math.max(5, Math.round(obj.candidates)));
  if (Array.isArray(obj.demandCategories)) obj.demandCategories = obj.demandCategories.slice(0, 4);
  if (Array.isArray(obj.origins)) obj.origins = obj.origins.slice(0, 3);
  const plan = validatePlan(obj as ScoutPlan, notes);
  return question ? reconcileArea(question, reconcileCompetitor(question, plan, notes, profile), notes, profile) : plan;
}

/**
 * When the question names an area we have a verified geocode text for (profile.areaAliases),
 * use it instead of the model's free-text area: the model once sent "Quận 3" to a
 * point in Phường Minh Phụng.
 */
export function reconcileArea(question: string, plan: ScoutPlan, notes: string[], profile: CountryProfile = VN_HCMC_PROFILE): ScoutPlan {
  const alias = profile.areaAliases.find((a) => a.match.test(question));
  if (!alias || plan.area === alias.area) return plan;
  notes.push(`area "${plan.area}" replaced by the verified geocode text "${alias.area}"`);
  const keep = (o: string): boolean => !alias.area.includes(o.split(",")[0]);
  const origins = plan.origins.filter(keep);
  return { ...plan, area: alias.area, origins: origins.length ? origins : profile.defaultOrigins.filter(keep).slice(0, 3) };
}

/**
 * Guard against a model picking the wrong competitor family (e.g. catering.cafe
 * for a bánh mì bakery). When the question names a business we have a rule for,
 * the rule's competitor wins unless the model chose that category or a subcategory of it.
 */
export function reconcileCompetitor(question: string, plan: ScoutPlan, notes: string[], profile: CountryProfile = VN_HCMC_PROFILE): ScoutPlan {
  const rule = profile.businessRules.find((r) => r.match.test(question));
  if (!rule) return plan;
  const c = plan.competitorCategory;
  if (c === rule.competitor || c.startsWith(rule.competitor + ".")) return plan;
  notes.push(`competitor ${c} does not match "${rule.business}" — using ${rule.competitor}`);
  const demand = plan.demandCategories.filter((d) => d !== rule.competitor);
  return { ...plan, business: plan.business || rule.business, competitorCategory: rule.competitor, demandCategories: demand.length ? demand : rule.demand.slice(0, 3) };
}
