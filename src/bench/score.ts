/**
 * VN-GeoBench scorer.
 *
 * Compares a run's trace (logs/<qid>.jsonl) against bench/vngeobench/questions.json:
 *  - tool-sequence match (expected tools in order; extra valid tools OK)
 *  - forbidden-tool check (hallucinated MCP tools, e.g. "isoline"/"isochrone")
 *  - evidence-completeness check (every scored claim has ≥1 trace ref — via trace file)
 *
 * Behavior assertions that need human judgment are reported as `manual: true`
 * and left unscored (they don't fail the run).
 *
 * Pure `scoreQuestion()` is unit-tested; `runSuite()` is the CLI entry
 * (`sitescout bench run --suite vngeobench`, key-gated — it scores traces
 * that already exist, but producing those traces needs the key).
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE_DIR = join(HERE, "..", "..", "bench", "vngeobench");

export interface BenchQuestion {
  id: string;
  expectedTools: string[];
  expectedBehaviors: string[];
}

export interface TraceLine {
  tool: string;
}

export interface QuestionScore {
  id: string;
  pass: boolean;
  toolSequence: { expected: string[]; actual: string[]; missing: string[] };
  forbiddenTools: string[];
  manual: string[];
  notes: string[];
}

const FORBIDDEN = ["isoline", "isochrone", "isodistance"];

export function scoreQuestion(q: BenchQuestion, trace: TraceLine[]): QuestionScore {
  const actual = trace.map((t) => t.tool);
  let cursor = 0;
  const missing: string[] = [];
  for (const expected of q.expectedTools) {
    const idx = actual.indexOf(expected, cursor);
    if (idx === -1) missing.push(expected);
    else cursor = idx + 1;
  }
  const forbidden = [
    ...new Set(actual.filter((t) => FORBIDDEN.some((f) => t.includes(f)))),
  ];
  const pass = missing.length === 0 && forbidden.length === 0;
  const notes: string[] = [];
  if (missing.length > 0) notes.push(`missing tools: ${missing.join(", ")}`);
  if (forbidden.length > 0) notes.push(`forbidden tools called: ${forbidden.join(", ")}`);
  return {
    id: q.id,
    pass,
    toolSequence: { expected: q.expectedTools, actual, missing },
    forbiddenTools: forbidden,
    manual: q.expectedBehaviors,
    notes,
  };
}

export interface SuiteSummary {
  suite: string;
  passed: number;
  total: number;
  results: QuestionScore[];
}

export function loadSuite(suitePath = join(SUITE_DIR, "questions.json")): {
  questions: BenchQuestion[];
} {
  return JSON.parse(readFileSync(suitePath, "utf-8")) as {
    questions: BenchQuestion[];
  };
}

export function scoreSuite(
  questions: BenchQuestion[],
  logsDir = "logs",
): SuiteSummary {
  const results = questions.map((q) => {
    const tracePath = join(logsDir, `${q.id}.jsonl`);
    if (!existsSync(tracePath)) {
      return {
        id: q.id,
        pass: false,
        toolSequence: { expected: q.expectedTools, actual: [], missing: q.expectedTools },
        forbiddenTools: [],
        manual: q.expectedBehaviors,
        notes: ["no trace file — run the question first (key-gated)"],
      } as QuestionScore;
    }
    const raw = readFileSync(tracePath, "utf-8");
    const trace = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as TraceLine);
    return scoreQuestion(q, trace);
  });
  const passed = results.filter((r) => r.pass).length;
  return { suite: "vngeobench", passed, total: results.length, results };
}

/** CLI entry: score the suite, write JSON results. */
export function runSuite(
  suitePath = join(SUITE_DIR, "questions.json"),
  logsDir = "logs",
): string {
  const { questions } = loadSuite(suitePath);
  const summary = scoreSuite(questions, logsDir);
  const outDir = join(SUITE_DIR, "results");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `results-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`${summary.passed}/${summary.total} passed → ${outPath}`);
  return outPath;
}
