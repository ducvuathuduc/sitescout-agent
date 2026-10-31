/**
 * Evidence trace: the append-only log that makes every claim auditable.
 *
 * One JSONL file per research question: logs/<questionId>.jsonl
 * One line per MCP tool call, in execution order:
 *
 *   {"seq":7,"ts":"2026-11-02T03:14:22.118Z","questionId":"thaodien-coffee",
 *    "tool":"search_places","args":{...},
 *    "resultDigest":"sha256:9f2c…","resultSummary":{"count":14},
 *    "durationMs":341}
 *
 * Full tool results are cached (not inlined) under
 * logs/results/<questionId>/<seq>.json so the trace stays small
 * while remaining fully reproducible. The report renderer cites trace
 * entries as [T7]; `sitescout trace validate` enforces the schema and the
 * invariant that every claim references >= 1 trace entry.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const TraceEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  ts: z.string().datetime(),
  questionId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
  /** sha256 of the canonicalised full tool result. */
  resultDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  /** Small structured summary (counts, durations) for humans scanning the log. */
  resultSummary: z.record(z.unknown()).default({}),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
});

export type TraceEntry = z.infer<typeof TraceEntrySchema>;

export const ClaimSchema = z.object({
  text: z.string().min(1),
  /** Trace entry seq numbers backing this claim. Must be non-empty. */
  traceRefs: z.array(z.number().int().nonnegative()).min(1),
});

export type Claim = z.infer<typeof ClaimSchema>;

/** Canonicalize: recursively sort object keys so digests are stable. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function digestResult(result: unknown): string {
  const canonical = JSON.stringify(canonicalize(result));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export class TraceLog {
  private seq = 0;
  private readonly entries: TraceEntry[] = [];

  constructor(
    readonly questionId: string,
    private readonly logDir = "logs",
  ) {
    mkdirSync(logDir, { recursive: true });
  }

  get path(): string {
    return join(this.logDir, `${this.questionId}.jsonl`);
  }

  /** The seq the next appended entry will carry (for pre-registration). */
  get nextSeq(): number {
    return this.seq;
  }

  /** Append one tool call to the in-memory log and the JSONL file. */
  append(input: Omit<TraceEntry, "seq" | "ts" | "questionId">): TraceEntry {
    const entry = TraceEntrySchema.parse({
      ...input,
      seq: this.seq,
      ts: new Date().toISOString(),
      questionId: this.questionId,
    });
    this.entries.push(entry);
    this.seq += 1;
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
    return entry;
  }

  all(): readonly TraceEntry[] {
    return this.entries;
  }

  /** Citation token used in rendered reports, e.g. "[T7]". */
  static cite(seq: number): string {
    return `[T${seq}]`;
  }
}

/** Validate a trace file: schema per line + strictly increasing seq numbers. */
export function validateTraceFile(path: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return { ok: false, errors: [`cannot read ${path}`] };
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let expectedSeq = 0;
  for (const [i, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      errors.push(`line ${i + 1}: invalid JSON`);
      continue;
    }
    const check = TraceEntrySchema.safeParse(parsed);
    if (!check.success) {
      errors.push(`line ${i + 1}: schema error: ${check.error.message}`);
      continue;
    }
    if (check.data.seq !== expectedSeq) {
      errors.push(`line ${i + 1}: expected seq ${expectedSeq}, got ${check.data.seq}`);
    }
    expectedSeq += 1;
  }
  if (lines.length === 0) errors.push("trace file is empty");
  return { ok: errors.length === 0, errors };
}

/** Persist a full tool result for reproducibility (gitignored cache). */
export function cacheResult(questionId: string, seq: number, result: unknown): string {
  const dir = join("logs", "results", questionId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${seq}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}
