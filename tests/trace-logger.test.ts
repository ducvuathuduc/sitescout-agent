import { describe, expect, it } from "vitest";
import {
  TraceLogger,
  canonicalJson,
  formatRef,
  parseJsonl,
  sha256Hex,
  verifyEntries,
} from "../src/trace/logger.js";

const fixedClock = () => new Date("2026-11-21T14:00:00.000Z");

describe("canonicalJson", () => {
  it("sorts object keys recursively so key order does not change the hash", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  it("omits undefined properties", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ x: Infinity })).toThrow(TypeError);
  });
  it("rejects unsupported types", () => {
    expect(() => canonicalJson({ f: () => 1 })).toThrow(TypeError);
  });
});

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector for the empty string", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("TraceLogger", () => {
  it("assigns sequential [T#] ids starting at T1", async () => {
    const log = new TraceLogger(fixedClock);
    const a = await log.append("mcp.tools/call", { n: 1 });
    const b = await log.append("mcp.tools/call", { n: 2 });
    expect(a.id).toBe("T1");
    expect(b.id).toBe("T2");
    expect(b.seq).toBe(2);
    expect(formatRef(b.id)).toBe("[T2]");
  });

  it("links each entry to the previous signature (first is null)", async () => {
    const log = new TraceLogger(fixedClock);
    const a = await log.append("k", 1);
    const b = await log.append("k", 2);
    expect(a.prevSignature).toBeNull();
    expect(b.prevSignature).toBe(a.signature);
  });

  it("hashes the payload deterministically regardless of key order", async () => {
    const x = new TraceLogger(fixedClock);
    const y = new TraceLogger(fixedClock);
    const ex = await x.append("k", { a: 1, b: 2 });
    const ey = await y.append("k", { b: 2, a: 1 });
    expect(ex.payloadSha256).toBe(ey.payloadSha256);
    expect(ex.signature).toBe(ey.signature);
  });

  it("uses the injected clock for timestamps", async () => {
    const log = new TraceLogger(fixedClock);
    const e = await log.append("k", {});
    expect(e.timestamp).toBe("2026-11-21T14:00:00.000Z");
  });

  it("rejects an empty kind", async () => {
    await expect(new TraceLogger(fixedClock).append("", {})).rejects.toThrow(/kind/);
  });

  it("verifies an untampered log", async () => {
    const log = new TraceLogger(fixedClock);
    await log.append("a", { x: 1 });
    await log.append("b", { y: [1, 2, 3] });
    expect(await log.verify()).toEqual({ ok: true, count: 2 });
  });

  it("verifies an empty log", async () => {
    expect(await new TraceLogger(fixedClock).verify()).toEqual({ ok: true, count: 0 });
  });

  it("detects payload tampering after the fact", async () => {
    const log = new TraceLogger(fixedClock);
    await log.append("a", { cost: 100 });
    await log.append("b", { cost: 200 });
    const entries = parseJsonl(log.toJsonl()).map((e) => ({ ...e }));
    (entries[0]!.payload as { cost: number }).cost = 1;
    const result = await verifyEntries(entries);
    expect(result).toEqual({ ok: false, index: 0, reason: "payload hash mismatch" });
  });

  it("detects a rewritten signature", async () => {
    const log = new TraceLogger(fixedClock);
    await log.append("a", { x: 1 });
    const entries = parseJsonl(log.toJsonl());
    entries[0]!.signature = "0".repeat(64);
    const result = await verifyEntries(entries);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ index: 0, reason: "signature mismatch" });
  });

  it("detects deletion of a middle entry", async () => {
    const log = new TraceLogger(fixedClock);
    await log.append("a", 1);
    await log.append("b", 2);
    await log.append("c", 3);
    const entries = parseJsonl(log.toJsonl());
    entries.splice(1, 1);
    const result = await verifyEntries(entries);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ index: 1 });
  });

  it("detects reordering of entries", async () => {
    const log = new TraceLogger(fixedClock);
    await log.append("a", 1);
    await log.append("b", 2);
    const entries = parseJsonl(log.toJsonl()).reverse();
    const result = await verifyEntries(entries);
    expect(result.ok).toBe(false);
  });

  it("serialises as JSONL: one parseable object per line with trailing newline", async () => {
    const log = new TraceLogger(fixedClock);
    await log.append("a", { x: 1 });
    await log.append("b", { x: 2 });
    const text = log.toJsonl();
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).id).toBe("T2");
  });

  it("exports an empty string for an empty log", () => {
    expect(new TraceLogger(fixedClock).toJsonl()).toBe("");
  });

  it("round-trips through JSONL and still verifies", async () => {
    const log = new TraceLogger(fixedClock);
    await log.append("a", { nested: { z: 1, a: [true, null, "s"] } });
    await log.append("b", { n: 0.5 });
    const parsed = parseJsonl(log.toJsonl());
    expect(await verifyEntries(parsed)).toEqual({ ok: true, count: 2 });
  });

  it("parseJsonl throws a clear error on malformed lines", () => {
    expect(() => parseJsonl('{"ok":1}\nnot-json\n')).toThrow(/line 2/);
  });
});
