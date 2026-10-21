import { describe, expect, it } from "vitest";
import {
  ClaimSchema,
  digestResult,
  TraceEntrySchema,
  TraceLog,
  validateTraceFile,
} from "../src/agent/trace.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("digestResult", () => {
  it("is stable and sha256-prefixed", () => {
    const d = digestResult({ b: 1, a: [1, 2] });
    expect(d).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digestResult({ b: 1, a: [1, 2] })).toBe(d);
  });
});

describe("TraceEntrySchema", () => {
  it("rejects entries without a valid digest", () => {
    const bad = {
      seq: 0, ts: new Date().toISOString(), questionId: "q",
      tool: "geocode_address", args: {}, resultDigest: "nope",
      durationMs: 10,
    };
    expect(TraceEntrySchema.safeParse(bad).success).toBe(false);
  });
});

describe("ClaimSchema", () => {
  it("requires at least one trace ref", () => {
    expect(ClaimSchema.safeParse({ text: "x", traceRefs: [] }).success).toBe(false);
    expect(ClaimSchema.safeParse({ text: "x", traceRefs: [3] }).success).toBe(true);
  });
});

describe("TraceLog.cite", () => {
  it("formats [Tn] tokens", () => {
    expect(TraceLog.cite(7)).toBe("[T7]");
  });
});

describe("validateTraceFile", () => {
  it("accepts a well-formed file and rejects bad seq order", () => {
    const dir = mkdtempSync(join(tmpdir(), "sitescout-trace-"));
    const ok = join(dir, "ok.jsonl");
    const line = (seq: number) =>
      JSON.stringify({
        seq, ts: new Date().toISOString(), questionId: "q", tool: "geocode_address",
        args: {}, resultDigest: digestResult({ seq }), durationMs: 1,
      });
    writeFileSync(ok, line(0) + "\n" + line(1) + "\n");
    expect(validateTraceFile(ok).ok).toBe(true);

    const bad = join(dir, "bad.jsonl");
    writeFileSync(bad, line(0) + "\n" + line(5) + "\n");
    const res = validateTraceFile(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("expected seq 1"))).toBe(true);
  });
});
