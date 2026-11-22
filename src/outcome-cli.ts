/**
 * `sitescout outcome record|report` — the ground-truth feedback loop.
 *
 *   sitescout outcome record --memo <id> --candidate <id>
 *       --decision <signed|opened|passed>
 *       --method <customer-counts|pos-transactions>
 *       [--band-low <n> --band-high <n>]
 *       [--actual-mean <n>] [--tier <high|medium|low>]
 *       [--observed-at <date>] [--source <text>]
 *   sitescout outcome report [--out bench/outcomes/CALIBRATION-REPORT.md]
 *
 * Refusal rule (Review Focus 4): an outcome is refused when the memo has
 * no band on file — no matching `examples/<memoId>/result.json` with a
 * traffic band for the candidate AND no usable `--band-low`/`--band-high`
 * flags (both present, low > 0, high >= low). Orphan outcomes (a memo id
 * nobody can cite) never enter the dataset.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  computeCalibrationReport,
  parseOutcomeLine,
  type CalibrationReport,
  type Outcome,
} from "./bench/outcomes.js";

const DEFAULT_OUTCOMES_PATH = join("bench", "outcomes", "outcomes.jsonl");
const DEFAULT_REPORT_PATH = join("bench", "outcomes", "CALIBRATION-REPORT.md");
const DEFAULT_EXAMPLES_DIR = "examples";

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RecordOutcomeOptions {
  memoId: string;
  candidateId?: string;
  candidateLabel?: string;
  decision?: Outcome["decision"];
  actualMean?: number | null;
  tier?: "high" | "medium" | "low" | null;
  method?: Outcome["measurementMethod"];
  bandLow?: number;
  bandHigh?: number;
  observedAt?: string;
  source?: string;
  outcomesPath?: string;
  examplesDir?: string;
}

/**
 * Read a candidate's traffic band from a recorded memo, if the memo is on
 * file and the candidate carries a band (v2 `result.json`). Returns null
 * when the memo file is absent, the candidate is unknown, or the candidate
 * has no band (e.g. v1-shaped recorded runs). Throws when the memo file
 * exists but is not parseable JSON.
 */
export function bandFromMemo(
  memoId: string,
  candidateId: string | undefined,
  examplesDir = DEFAULT_EXAMPLES_DIR,
): { low: number; high: number } | null {
  const path = join(examplesDir, memoId, "result.json");
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`memo on file is not parseable JSON: ${path}: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { candidates?: unknown }).candidates)) {
    return null;
  }
  const candidate = (parsed as { candidates: Array<{ id?: unknown; trafficBand?: unknown }> }).candidates.find(
    (c) => c.id === candidateId,
  );
  const band = candidate?.trafficBand;
  if (typeof band !== "object" || band === null) return null;
  const { low, high } = band as { low?: unknown; high?: unknown };
  if (typeof low !== "number" || typeof high !== "number" || low < 0 || high < low) return null;
  return { low, high };
}

function usableFlagBand(bandLow: number | undefined, bandHigh: number | undefined): { low: number; high: number } | null {
  if (bandLow === undefined || bandHigh === undefined) return null;
  if (!(bandLow > 0) || !(bandHigh >= bandLow)) return null;
  return { low: bandLow, high: bandHigh };
}

/**
 * Validate and append exactly one outcome line. Refuses orphan outcomes
 * (memo with no band on file — see module header). Returns the recorded
 * outcome.
 */
export function recordOutcome(opts: RecordOutcomeOptions): Outcome {
  const examplesDir = opts.examplesDir ?? DEFAULT_EXAMPLES_DIR;
  const band = usableFlagBand(opts.bandLow, opts.bandHigh) ?? bandFromMemo(opts.memoId, opts.candidateId, examplesDir);
  if (!band) {
    throw new Error(
      `refusing to record an outcome for memo "${opts.memoId}": no matching memo on file ` +
        `(${join(examplesDir, opts.memoId, "result.json")} not found, or candidate ${opts.candidateId ?? "(none)"} ` +
        `has no traffic band) and no usable --band-low/--band-high supplied (need low > 0, high >= low)`,
    );
  }
  const outcome = parseOutcomeLine(
    JSON.stringify({
      memoId: opts.memoId,
      candidateId: opts.candidateId,
      candidateLabel: opts.candidateLabel,
      decision: opts.decision,
      actualDailyCustomersMean: opts.actualMean ?? null,
      actualTrafficTier: opts.tier ?? null,
      measurementMethod: opts.method,
      projectedLow: band.low,
      projectedHigh: band.high,
      observedAt: opts.observedAt ?? today(),
      source: opts.source ?? "operator report",
    }),
  );
  const outcomesPath = opts.outcomesPath ?? DEFAULT_OUTCOMES_PATH;
  mkdirSync(dirname(outcomesPath), { recursive: true });
  // A JSONL file must end with a newline before the next line is appended;
  // the Task 13 example line shipped without one, so guard here.
  let prefix = "";
  if (existsSync(outcomesPath)) {
    const existing = readFileSync(outcomesPath, "utf8");
    if (existing.length > 0 && !existing.endsWith("\n")) prefix = "\n";
  }
  appendFileSync(outcomesPath, `${prefix}${JSON.stringify(outcome)}\n`);
  return outcome;
}

/** Render the calibration report as Markdown (pure). */
export function renderCalibrationReport(report: CalibrationReport, generatedAt: string): string {
  const lines: string[] = [
    "# Calibration report — outcomes vs. memo projections",
    "",
    `Generated ${generatedAt}. Match rule (spec §3.2): the actual 30-day mean falls within the memo's projected band widened by ±20% — \`[projectedLow × 0.8, projectedHigh × 1.2]\`.`,
    "Example lines are listed for demonstration and excluded from the aggregate.",
    "",
    "## Aggregate",
    "",
    `- Real outcomes on file: ${report.nOutcomes - report.rows.filter((r) => r.isExample).length}`,
    `- Traffic-match proof points (opened/passed with an actual mean): ${report.nMatchable}`,
    report.matchShare === null
      ? "- Within ±20%: n/a — no real outcomes yet"
      : `- Within ±20%: ${report.nMatched}/${report.nMatchable} (${Math.round(report.matchShare * 100)}%)`,
    `- Signed-lease proof elements (no traffic yet): ${report.nSignedOnly}`,
    "",
    "## Outcomes",
    "",
    "| memo | candidate | decision | projected band | actual mean | method | match |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of report.rows) {
    lines.push(
      `| ${r.memoId}${r.isExample ? " (example)" : ""} | ${r.candidateId} | ${r.decision} | ${r.projectedLow}–${r.projectedHigh} | ${r.actualDailyCustomersMean ?? "—"} | ${r.measurementMethod} | ${r.match === null ? "n/a" : String(r.match)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function readOutcomes(outcomesPath: string): Outcome[] {
  if (!existsSync(outcomesPath)) {
    throw new Error(`no outcomes on file: ${outcomesPath} not found (record one first: sitescout outcome record ...)`);
  }
  const lines = readFileSync(outcomesPath, "utf8").split("\n");
  const outcomes: Outcome[] = [];
  lines.forEach((line, i) => {
    if (line.trim().length === 0) return;
    try {
      outcomes.push(parseOutcomeLine(line));
    } catch (e) {
      throw new Error(`${outcomesPath} line ${i + 1}: ${(e as Error).message}`);
    }
  });
  return outcomes;
}

function numFlag(rest: string[], name: string): number | undefined {
  const raw = flag(rest, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function cmdOutcomeRecord(rest: string[]): void {
  const memoId = flag(rest, "--memo");
  const candidateId = flag(rest, "--candidate");
  const decision = flag(rest, "--decision");
  const method = flag(rest, "--method");
  if (!memoId || !candidateId || !decision || !method) {
    throw new Error(
      "usage: sitescout outcome record --memo <id> --candidate <id> --decision <signed|opened|passed> " +
        "--method <customer-counts|pos-transactions> [--band-low <n> --band-high <n>] " +
        "[--actual-mean <n>] [--tier <high|medium|low>] [--observed-at <date>] [--source <text>]",
    );
  }
  const tier = flag(rest, "--tier");
  if (tier !== undefined && tier !== "high" && tier !== "medium" && tier !== "low") {
    throw new Error(`--tier must be high|medium|low, got "${tier}"`);
  }
  const outcome = recordOutcome({
    memoId,
    candidateId,
    candidateLabel: flag(rest, "--candidate-label"),
    decision: decision as Outcome["decision"],
    actualMean: numFlag(rest, "--actual-mean"),
    tier: (tier ?? null) as "high" | "medium" | "low" | null,
    method: method as Outcome["measurementMethod"],
    bandLow: numFlag(rest, "--band-low"),
    bandHigh: numFlag(rest, "--band-high"),
    observedAt: flag(rest, "--observed-at"),
    source: flag(rest, "--source"),
  });
  console.log(
    `Recorded: ${outcome.memoId}/${outcome.candidateId} ${outcome.decision} ` +
      `band ${outcome.projectedLow}–${outcome.projectedHigh} ` +
      `actual ${outcome.actualDailyCustomersMean ?? "—"} (${outcome.measurementMethod}) → ${DEFAULT_OUTCOMES_PATH}`,
  );
}

function cmdOutcomeReport(rest: string[]): void {
  const out = flag(rest, "--out") ?? DEFAULT_REPORT_PATH;
  const report = computeCalibrationReport(readOutcomes(DEFAULT_OUTCOMES_PATH));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderCalibrationReport(report, today()));
  const aggregate =
    report.matchShare === null
      ? "no real outcomes yet"
      : `${report.nMatched}/${report.nMatchable} within ±20% (${Math.round(report.matchShare * 100)}%)`;
  console.log(`Calibration report: ${out}`);
  console.log(`Real outcomes: ${report.nOutcomes - report.rows.filter((r) => r.isExample).length} · ${aggregate}`);
}

/** `sitescout outcome record|report`. */
export function cmdOutcome(rest: string[]): void {
  if (rest[0] === "record") return cmdOutcomeRecord(rest.slice(1));
  if (rest[0] === "report") return cmdOutcomeReport(rest.slice(1));
  throw new Error("usage: sitescout outcome record|report (see `sitescout --help`)");
}
