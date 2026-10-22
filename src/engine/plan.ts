/**
 * Question → validated ScoutPlan.
 *
 * Two planners produce the same zod-validated plan:
 *  - heuristicPlan(): deterministic keyword planner (Vietnamese + English),
 *    zero network calls — the default, so every committed example is
 *    reproducible.
 *  - llmPlan(): any OpenAI-compatible chat endpoint (OpenAI, Groq, Gemini's
 *    OpenAI-compatible API, Cloudflare Workers AI). The model only proposes a
 *    plan; zod + the live category catalog verify it, invalid categories are
 *    dropped, and any failure falls back to the heuristic plan. The model
 *    never produces a number that reaches the report.
 */
import { z } from "zod";
import { CATEGORY_SET } from "./categories.js";

export const ScoutPlanSchema = z.object({
  /** Business type in plain words, e.g. "specialty coffee shop". */
  business: z.string().min(2).max(80),
  /** Geoapify category of direct competitors. */
  competitorCategory: z.string(),
  /** Up to 4 Geoapify categories that generate demand. */
  demandCategories: z.array(z.string()).min(1).max(4),
  /** Area text to geocode, inside Ho Chi Minh City. */
  area: z.string().min(2).max(120),
  /** Walk-time catchment in minutes (5–15). */
  walkMinutes: z.number().int().min(5).max(15),
  /** Number of candidates to evaluate (5–8). */
  candidates: z.number().int().min(5).max(8),
  /** Demand origins for the drive-time matrix (1–3 places in HCMC). */
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

interface BusinessRule {
  match: RegExp;
  business: string;
  competitor: string;
  demand: string[];
}

/** Keyword → categories. Every category here exists in the live catalog (tested). */
export const BUSINESS_RULES: BusinessRule[] = [
  { match: /ti[eệ]m b[aá]nh|b[aá]nh m[iì]|banh mi|l[oò] b[aá]nh|bakery|boulangerie|patisserie/i, business: "bakery", competitor: "commercial.food_and_drink.bakery", demand: ["office", "education.school", "commercial.supermarket"] },
  { match: /c[aà]\s?ph[eê]|coffee|caf[eé]|specialty/i, business: "coffee shop", competitor: "catering.cafe", demand: ["office", "sport.fitness", "commercial.clothing", "education.university"] },
  { match: /tr[aà] s[uữ]a|bubble tea|milk tea/i, business: "bubble tea shop", competitor: "catering.cafe", demand: ["education.school", "education.university", "commercial.shopping_mall"] },
  { match: /nh[aà] thu[oố]c|pharmac|drugstore/i, business: "pharmacy", competitor: "healthcare.pharmacy", demand: ["healthcare.hospital", "healthcare.clinic_or_praxis", "commercial.supermarket"] },
  { match: /ph[oở]|b[uú]n|c[oơ]m|qu[aá]n [aă]n|restaurant|lunch|nh[aà] h[aà]ng|food/i, business: "restaurant", competitor: "catering.restaurant", demand: ["office", "education.university", "commercial.shopping_mall"] },
  { match: /gym|fitness|yoga|ph[oò]ng t[aậ]p/i, business: "gym", competitor: "sport.fitness", demand: ["office", "building.residential", "education.university"] },
  { match: /coworking|v[aă]n ph[oò]ng chia s[eẻ]/i, business: "coworking space", competitor: "office.coworking", demand: ["catering.cafe", "office.company", "education.university"] },
  { match: /c[uử]a h[aà]ng ti[eệ]n l[oợ]i|convenience|minimart/i, business: "convenience store", competitor: "commercial.convenience", demand: ["building.residential", "education.school", "office"] },
  { match: /spa|nail|salon|l[aà]m [dđ][eẹ]p|beauty/i, business: "beauty salon", competitor: "service.beauty", demand: ["office", "commercial.shopping_mall", "building.residential"] },
  { match: /nha khoa|dental|dentist/i, business: "dental clinic", competitor: "healthcare.dentist", demand: ["building.residential", "office", "education.school"] },
  { match: /qu[aầ]n [aá]o|th[oờ]i trang|fashion|clothing|boutique/i, business: "clothing boutique", competitor: "commercial.clothing", demand: ["catering.cafe", "commercial.shopping_mall", "office"] },
];

/** Known HCMC areas → canonical geocode text (old + new names welcome). */
export const AREA_ALIASES: Array<{ match: RegExp; area: string }> = [
  // Texts chosen because Geoapify resolves them correctly (autocomplete-first, see scout.ts resolvePlace).
  { match: /th[aả]o [dđ]i[eề]n/i, area: "Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh" },
  { match: /b[iì]nh th[aạ]nh|h[aà]ng xanh/i, area: "Ngã tư Hàng Xanh, Bình Thạnh, Hồ Chí Minh" },
  { match: /qu[aậ]n 1\b|district 1|ph[uư][oờ]ng s[aà]i g[oò]n|nguy[eễ]n hu[eệ]|cbd|downtown/i, area: "Phố đi bộ Nguyễn Huệ, Quận 1, Hồ Chí Minh" },
  { match: /ph[uú] m[yỹ] h[uư]ng|qu[aậ]n 7|district 7/i, area: "Crescent Mall, Quận 7, Hồ Chí Minh" },
  { match: /g[oò] v[aấ]p/i, area: "Chợ Gò Vấp, Gò Vấp, Hồ Chí Minh" },
  { match: /qu[aậ]n 3|district 3|v[oõ] v[aă]n t[aầ]n/i, area: "Hồ Con Rùa, Quận 3, Hồ Chí Minh" },
  { match: /landmark|v[iì]nhomes central/i, area: "Landmark 81, Bình Thạnh, Hồ Chí Minh" },
  { match: /b[eế]n th[aà]nh/i, area: "Chợ Bến Thành, Quận 1, Hồ Chí Minh" },
];

export const DEFAULT_ORIGINS = ["Chợ Bến Thành, Quận 1, Hồ Chí Minh", "Bến xe Miền Đông, Bình Thạnh, Hồ Chí Minh", "Crescent Mall, Quận 7, Hồ Chí Minh"];

/** Extract the area phrase after "ở/tại/in/near/around". */
function areaPhrase(q: string): string | undefined {
  const m = q.match(/(?:\bở|\btại|\bgần|\bkhu|\bin|\bnear|\baround)\s+([^?.!]+)/i);
  return m?.[1]?.trim();
}

export function heuristicPlan(question: string): PlanOutcome {
  const notes: string[] = [];
  const rule = BUSINESS_RULES.find((r) => r.match.test(question)) ?? BUSINESS_RULES[0];
  if (!BUSINESS_RULES.some((r) => r.match.test(question))) notes.push("no business keyword recognised — defaulted to coffee shop");
  const alias = AREA_ALIASES.find((a) => a.match.test(question));
  let area = alias?.area;
  if (!area) {
    const phrase = areaPhrase(question);
    area = phrase ? `${phrase}, Hồ Chí Minh` : AREA_ALIASES[0].area;
    if (!phrase) notes.push("no area recognised — defaulted to Thảo Điền");
  }
  const origins = DEFAULT_ORIGINS.filter((o) => !area!.includes(o.split(",")[0]));
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

export const PLANNER_SYSTEM_PROMPT = `You plan retail site-selection analyses in Ho Chi Minh City, Vietnam, for the SiteScout agent.
Return ONLY a JSON object with these keys:
- business: short English name of the business type
- competitorCategory: ONE Geoapify place category for direct competitors
- demandCategories: 1-4 Geoapify place categories that bring customers (not the competitor category)
- area: the neighbourhood to analyse, as a geocodable Vietnamese address ending with "Hồ Chí Minh" (old district names are fine)
- walkMinutes: integer 5-15 (walking catchment)
- candidates: integer 5-8
- origins: 1-3 well-known HCMC places customers travel from
Use only real Geoapify categories, e.g. catering.cafe, catering.restaurant, catering.fast_food, healthcare.pharmacy, healthcare.hospital, healthcare.clinic_or_praxis, healthcare.dentist, office, office.company, office.coworking, sport.fitness, education.school, education.university, commercial.supermarket, commercial.convenience, commercial.clothing, commercial.shopping_mall, service.beauty, building.residential.
If the question is outside Ho Chi Minh City, still answer with the closest HCMC interpretation. Never invent numbers.`;

/** LLM planner with schema validation and heuristic fallback. */
export async function llmPlan(question: string, cfg: LlmConfig): Promise<PlanOutcome> {
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
          { role: "system", content: PLANNER_SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
      }),
    });
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
    raw = body.choices?.[0]?.message?.content ?? "";
    return { plan: parseLlmPlan(raw, notes, question), planner: "llm", model: cfg.model, notes, raw };
  } catch (e) {
    const fb = heuristicPlan(question);
    return { ...fb, notes: [`LLM plan rejected (${e instanceof Error ? e.message : String(e)}) — heuristic fallback`, ...fb.notes], raw };
  }
}

/** Parse + validate a model's JSON (also used by the Workers AI path). */
export function parseLlmPlan(raw: string, notes: string[], question?: string): ScoutPlan {
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
  return question ? reconcileArea(question, reconcileCompetitor(question, plan, notes), notes) : plan;
}

/**
 * When the question names an area we have a verified geocode text for (AREA_ALIASES),
 * use it instead of the model's free-text area: the model once sent "Quận 3" to a
 * point in Phường Minh Phụng.
 */
export function reconcileArea(question: string, plan: ScoutPlan, notes: string[]): ScoutPlan {
  const alias = AREA_ALIASES.find((a) => a.match.test(question));
  if (!alias || plan.area === alias.area) return plan;
  notes.push(`area "${plan.area}" replaced by the verified geocode text "${alias.area}"`);
  const keep = (o: string): boolean => !alias.area.includes(o.split(",")[0]);
  const origins = plan.origins.filter(keep);
  return { ...plan, area: alias.area, origins: origins.length ? origins : DEFAULT_ORIGINS.filter(keep).slice(0, 3) };
}

/**
 * Guard against a model picking the wrong competitor family (e.g. catering.cafe
 * for a bánh mì bakery). When the question names a business we have a rule for,
 * the rule's competitor wins unless the model chose that category or a subcategory of it.
 */
export function reconcileCompetitor(question: string, plan: ScoutPlan, notes: string[]): ScoutPlan {
  const rule = BUSINESS_RULES.find((r) => r.match.test(question));
  if (!rule) return plan;
  const c = plan.competitorCategory;
  if (c === rule.competitor || c.startsWith(rule.competitor + ".")) return plan;
  notes.push(`competitor ${c} does not match "${rule.business}" — using ${rule.competitor}`);
  const demand = plan.demandCategories.filter((d) => d !== rule.competitor);
  return { ...plan, business: plan.business || rule.business, competitorCategory: rule.competitor, demandCategories: demand.length ? demand : rule.demand.slice(0, 3) };
}
