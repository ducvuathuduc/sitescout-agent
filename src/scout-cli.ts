/**
 * `sitescout scout "<question>"` — the isoline-first engine on Geoapify REST.
 *
 *   sitescout scout "Where should I open a specialty coffee shop in Thảo Điền?"
 *     [--id thaodien-coffee] [--planner heuristic|llm] [--out examples/<id>]
 *     [--credit-cap 300]
 *
 * Writes result.json, report.md, report.html, map.jpg (Geoapify Static Maps)
 * and trace.jsonl. The key is read from GEOAPIFY_API_KEY and sent as an
 * `x-api-key` header — it never appears in any written file.
 *
 * LLM planner (optional, free tiers): set SITESCOUT_LLM_BASE_URL,
 * SITESCOUT_LLM_MODEL and SITESCOUT_LLM_API_KEY (any OpenAI-compatible API:
 * Groq, Gemini OpenAI-compat, OpenAI, Workers AI). Validation + heuristic
 * fallback are always on.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GeoapifyApi } from "./engine/geoapify.js";
import { heuristicPlan, llmPlan } from "./engine/plan.js";
import { runScout } from "./engine/scout.js";
import { renderHtml, renderMarkdown, staticMapBody, traceJsonl } from "./engine/render.js";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function cmdScout(rest: string[], apiKey: string): Promise<void> {
  const question = rest.find((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));
  if (!question) throw new Error('scout requires a question, e.g. sitescout scout "Where should I open a pharmacy in Bình Thạnh?"');
  const id = flag(rest, "--id") ?? slug(question);
  const out = flag(rest, "--out") ?? join("examples", id);
  const plannerKind = flag(rest, "--planner") ?? "heuristic";
  const cap = Number(flag(rest, "--credit-cap") ?? 300);

  const planned =
    plannerKind === "llm"
      ? await llmPlan(question, {
          baseUrl: process.env.SITESCOUT_LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
          model: process.env.SITESCOUT_LLM_MODEL ?? "llama-3.3-70b-versatile",
          apiKey: process.env.SITESCOUT_LLM_API_KEY,
        })
      : heuristicPlan(question);

  const api = new GeoapifyApi({
    apiKey,
    creditCap: cap,
    onCall: (c) => console.log(`  [T${c.seq}] ${c.api.padEnd(17)} ${c.status} ${String(c.durationMs).padStart(5)} ms  ${JSON.stringify(c.summary).slice(0, 90)}`),
  });
  console.log(`[plan:${planned.planner}] ${JSON.stringify(planned.plan)}`);
  for (const n of planned.notes) console.log(`  note: ${n}`);
  const result = await runScout(question, planned, { api });

  mkdirSync(out, { recursive: true });
  try {
    const { bytes } = await api.staticMap(staticMapBody(result));
    writeFileSync(join(out, "map.jpg"), Buffer.from(bytes));
  } catch (e) {
    console.warn(`static map failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  // the static map call is part of the evidence too
  result.calls = api.calls;
  result.creditsEstimated = api.creditsSpent;
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 1));
  writeFileSync(join(out, "report.md"), renderMarkdown(result));
  writeFileSync(join(out, "report.html"), renderHtml(result));
  writeFileSync(join(out, "trace.jsonl"), traceJsonl(result));
  if (planned.raw) writeFileSync(join(out, "planner-transcript.json"), JSON.stringify({ question, planner: planned.planner, model: planned.model, raw: planned.raw, notes: planned.notes, plan: planned.plan }, null, 2));

  console.log(`\n${result.plan.business} in ${result.area.ward?.name ?? result.plan.area}:`);
  for (const c of result.candidates) console.log(`  #${c.rank} ${c.total.toFixed(2)}  ${c.label}  (demand ${c.demandTotal}, competitors ${c.competitors}, drive ${c.meanDriveMin ?? "n/a"} min)`);
  console.log(`\n${api.calls.length} calls · ~${api.creditsSpent} credits · ${(result.durationMs / 1000).toFixed(1)} s → ${out}/`);
}
