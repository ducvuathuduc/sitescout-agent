#!/usr/bin/env node
/**
 * sitescout CLI.
 *
 *   sitescout ask --question <id> [--region hcmc|hanoi|danang]
 *                 [--playbook site-selection|meetup-planning] [--budget N]
 *       Run a research question end-to-end (plan → MCP tools → trace →
 *       score → Markdown + visual HTML report).
 *
 *   sitescout smoke [--question <id>] [--budget N]
 *       One full playbook-1 question against the LIVE MCP server.
 *       Asserts the 11-tool surface first; fails fast with a clear
 *       "missing GEOAPIFY_API_KEY" message when the key is absent.
 *       NEVER substitutes mocked results.
 *
 *   sitescout trace validate <file>
 *       Validate a JSONL trace file (schema + seq order).
 *
 *   sitescout report <question-id> [--format md|html]
 *       Re-render Markdown/HTML from an existing trace + run manifest
 *       (no MCP calls — reproducibility check).
 *
 *   sitescout bench run [--suite vngeobench]
 *       Score bench/vngeobench/questions.json against logs/*.jsonl traces.
 *
 *   sitescout static <report.html> <out.png>
 *       Static PNG export (playwright if installed; honest manual
 *       procedure otherwise — never a fake image).
 *
 * Config: .env.local (see .env.local.example). Never commit secrets.
 */
import { config as loadDotenv } from "dotenv";
import { GeoapifyMcpClient } from "./mcp/client.js";
import {
  HeuristicPlanner,
  runMeetup,
  runSiteSelection,
} from "./agent/run.js";
import { BudgetTracker } from "./agent/budget.js";
import { validateTraceFile } from "./agent/trace.js";
import { runSuite } from "./bench/score.js";
import {
  getSiteSelectionQuestion,
  getMeetupQuestion,
  SITE_SELECTION_QUESTIONS,
  MEETUP_QUESTIONS,
} from "./research/questions.js";
import { renderReport } from "./report/render.js";
import { rankCandidates } from "./scoring/model.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

loadDotenv({ path: ".env.local" });

const MISSING_KEY_MSG =
  "BLOCKED: missing GEOAPIFY_API_KEY — copy .env.local.example to .env.local " +
  "and add your key (free tier, no card: https://www.geoapify.com/). " +
  "The key is read from the GEOAPIFY_API_KEY environment variable.";

function requireApiKey(): string {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key || key === "<redacted>" || key === "your_key_here" || key.trim() === "") {
    throw new Error(MISSING_KEY_MSG);
  }
  return key;
}

function help(): string {
  return [
    "sitescout — evidence-traced location-intelligence agent (Geoapify MCP-first)",
    "",
    "Usage:",
    "  sitescout ask --question <id> [--region hcmc|hanoi|danang]",
    "                [--playbook site-selection|meetup-planning] [--budget N]",
    "  sitescout smoke [--question thaodien-coffee] [--budget N]",
    "  sitescout trace validate <file>",
    "  sitescout report <question-id> [--format md|html]",
    "  sitescout bench run [--suite vngeobench]",
    "  sitescout static <report.html> <out.png>",
    "  sitescout --help",
    "",
    "Questions (playbook 1 · site-selection):",
    ...SITE_SELECTION_QUESTIONS.map((q) => `    ${q.id}  (${q.region}) — ${q.title}`),
    "Questions (playbook 2 · meetup-planning):",
    ...MEETUP_QUESTIONS.map((q) => `    ${q.id}  (${q.region}) — ${q.title}`),
    "",
    "Environment (.env.local):",
    "  GEOAPIFY_API_KEY   required — Geoapify API key (x-api-key header)",
  ].join("\n");
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

const DOCS_ONLY_PLAYBOOKS = ["coverage-analysis", "neighborhood-profile", "tourism-dayplan"];

async function cmdAsk(rest: string[]): Promise<void> {
  const qid = flag(rest, "--question");
  if (!qid) throw new Error("ask requires --question <id> (see `sitescout --help`)");
  const playbook = flag(rest, "--playbook") ?? "site-selection";
  const region = flag(rest, "--region") as "hcmc" | "hanoi" | "danang" | undefined;
  const budgetCap = flag(rest, "--budget") ?? process.env.SITESCOUT_BUDGET;
  if (DOCS_ONLY_PLAYBOOKS.includes(playbook)) {
    throw new Error(
      `playbook "${playbook}" is docs-only (STRETCH cut — REDTEAM.md GO-WITH-CUTS): ` +
        `question definitions + workflow doc ship at src/playbooks/${playbook}/playbook.ts, ` +
        `but there is no runtime implementation in v1.`,
    );
  }
  const apiKey = requireApiKey();
  const mcp = new GeoapifyMcpClient({ apiKey });
  const budget = new BudgetTracker(budgetCap !== undefined ? Number(budgetCap) : undefined);
  const planner = new HeuristicPlanner();

  if (playbook === "site-selection") {
    const question = getSiteSelectionQuestion(qid, region);
    console.log(`[plan] ${question.id}: ${question.title}`);
    const res = await runSiteSelection(question, { mcp, budget, planner });
    console.log(`Done. ${res.scored.length} candidates ranked, ${res.excluded.length} excluded.`);
    console.log(`Trace : ${res.tracePath}`);
    console.log(`Report: examples/site-selection/${qid}/report.md`);
    console.log(`Visual: examples/site-selection/${qid}/report.html`);
    console.log("Credits:\n" + budget.report());
    return;
  }

  if (playbook === "meetup-planning") {
    const question = getMeetupQuestion(qid);
    console.log(`[plan] ${question.id}: ${question.title}`);
    const res = await runMeetup(question, { mcp, budget, planner });
    console.log(
      `Done. ${res.venues.length} venues ranked.` +
        (res.winner ? ` Fairest: ${res.winner.venueLabel}` : " No winner."),
    );
    console.log(`Trace : ${res.tracePath}`);
    console.log(`Report: examples/meetup-planning/${qid}/report.md`);
    console.log(`Visual: examples/meetup-planning/${qid}/report.html`);
    console.log("Credits:\n" + budget.report());
    return;
  }

  throw new Error(
    `unknown playbook "${playbook}". Must-ship: site-selection, meetup-planning. ` +
      `Docs-only: ${DOCS_ONLY_PLAYBOOKS.join(", ")}.`,
  );
}

/**
 * Smoke: ONE full playbook-1 question against the LIVE MCP server.
 * Key missing → clear fatal error. Never mocked, never faked.
 */
async function cmdSmoke(rest: string[]): Promise<void> {
  const qid = flag(rest, "--question") ?? "thaodien-coffee";
  const budgetCap = flag(rest, "--budget");
  const apiKey = requireApiKey(); // throws MISSING_KEY_MSG when absent
  const mcp = new GeoapifyMcpClient({ apiKey });
  console.log("[smoke] asserting live MCP tool surface (11 tools)…");
  await mcp.assertToolSurface();
  console.log("[smoke] tool surface OK — running one full playbook-1 question…");
  await cmdAsk(["--question", qid, "--playbook", "site-selection", ...(budgetCap ? ["--budget", budgetCap] : [])]);
}

function cmdTraceValidate(rest: string[]): void {
  const file = rest[1];
  if (!file) throw new Error("usage: sitescout trace validate <file>");
  const { ok, errors } = validateTraceFile(file);
  if (ok) {
    console.log(`OK: ${file} is a valid trace`);
  } else {
    console.error(`INVALID: ${file}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
  }
}

/**
 * Re-render a report from an existing trace + run manifest — no MCP calls.
 * Proves scores are reproducible from traced evidence alone.
 */
async function cmdReport(rest: string[]): Promise<void> {
  const qid = rest[0];
  if (!qid) throw new Error("usage: sitescout report <question-id> [--format md|html]");
  const format = flag(rest, "--format") ?? "md";
  const manifestPath = join("research", "smoke", "results", qid, "run.json");
  const tracePath = join("logs", `${qid}.jsonl`);
  if (!existsSync(manifestPath) || !existsSync(tracePath)) {
    throw new Error(
      `cannot re-render "${qid}": need ${manifestPath} and ${tracePath} ` +
        `(run the question first: sitescout ask --question ${qid})`,
    );
  }
  const { ok, errors } = validateTraceFile(tracePath);
  if (!ok) throw new Error(`trace invalid, refusing to re-render:\n${errors.join("\n")}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    playbook: string;
    question: { id: string };
    evidence: unknown[];
    scored: unknown[];
    excluded: unknown[];
    venues?: unknown[];
  };

  if (manifest.playbook === "site-selection") {
    if (format === "html") {
      // HTML re-render needs the full visual input; only Markdown is
      // reproducible from the manifest alone → be honest about it.
      throw new Error(
        "HTML re-render is not supported from the manifest alone (visual input " +
          "needs live geometry). Re-run the question for a fresh report.html, or " +
          "use --format md.",
      );
    }
    const trace = readFileSync(tracePath, "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
    const data = {
      question: manifest.question,
      scored: rankCandidates(manifest.scored as never[]),
      excluded: manifest.excluded,
      trace,
      weightsVersion: "re-render",
      creditsReport: "(re-rendered offline — no MCP calls, no credits spent)",
    };
    const out = join("examples", "site-selection", qid, "report.md");
    mkdirSync(join("examples", "site-selection", qid), { recursive: true });
    writeFileSync(out, renderReport(data as never));
    console.log(`Re-rendered (offline, deterministic): ${out}`);
    return;
  }
  throw new Error(`re-render for playbook "${manifest.playbook}" is not implemented yet`);
}

function cmdBench(rest: string[]): void {
  if (rest[0] !== "run") throw new Error("usage: sitescout bench run [--suite vngeobench]");
  const suite = flag(rest, "--suite") ?? "vngeobench";
  if (suite !== "vngeobench") throw new Error(`unknown suite "${suite}"`);
  runSuite();
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(help());
    return;
  }

  if (cmd === "trace" && rest[0] === "validate") return cmdTraceValidate(rest);
  if (cmd === "ask") return cmdAsk(rest);
  if (cmd === "smoke") return cmdSmoke(rest);
  if (cmd === "report") return cmdReport(rest);
  if (cmd === "bench") return cmdBench(rest);
  if (cmd === "static") {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, [join("dist", "report", "static.js"), ...rest], {
      stdio: "inherit",
    });
    process.exitCode = r.status ?? 1;
    return;
  }

  console.error(help());
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
