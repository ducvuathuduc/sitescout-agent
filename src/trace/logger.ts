/**
 * Auditability engine: tamper-evident, hash-chained trace log.
 *
 * Each entry gets an id of the form T1, T2, ... (cite as [T1]). It stores
 * sha256(canonical JSON of the payload), and a signature over the entry
 * header plus the previous signature, so editing or reordering any earlier
 * entry breaks verification. Uses Web Crypto (globalThis.crypto.subtle),
 * available in Cloudflare Workers and Node >= 20. No network, no randomness.
 */

export type TraceRef = `T${number}`;

export interface TraceEntry {
  /** Reference id, e.g. "T1". Cite as [T1] in reports. */
  id: TraceRef;
  /** 1-based sequence number; equals the numeric part of id. */
  seq: number;
  /** Event category, e.g. "mcp.call", "scoring.candidate". */
  kind: string;
  /** ISO 8601 UTC timestamp from the injected clock. */
  timestamp: string;
  /** Event payload, stored as given. Must be JSON-serialisable. */
  payload: unknown;
  /** sha256 hex of canonicalJson(payload). */
  payloadSha256: string;
  /** Previous entry's signature, or null for the first entry. */
  prevSignature: string | null;
  /** sha256 hex over the canonical header plus prevSignature. */
  signature: string;
}

export interface VerifyOk {
  ok: true;
  count: number;
}

export interface VerifyFailure {
  ok: false;
  index: number;
  reason: string;
}

export type VerifyResult = VerifyOk | VerifyFailure;

export type Clock = () => Date;

const encoder = new TextEncoder();

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace.
 * Rejects non-finite numbers and unsupported types so that the hash cannot
 * silently depend on serialisation quirks.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalJson: non-finite number ${String(value)}`);
      }
      return value;
    case "object": {
      if (Array.isArray(value)) return value.map(sortKeys);
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        const v = record[key];
        if (v === undefined) continue; // undefined properties are omitted, as in JSON
        out[key] = sortKeys(v);
      }
      return out;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

/** sha256 of a UTF-8 string, returned as lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(input));
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Format a reference for citation in reports, e.g. "[T3]". */
export function formatRef(ref: TraceRef): string {
  return `[${ref}]`;
}

export class TraceLogger {
  private readonly log: TraceEntry[] = [];
  private lastSignature: string | null = null;

  constructor(private readonly clock: Clock = () => new Date()) {}

  /** Read-only view of the entries recorded so far. */
  get entries(): readonly TraceEntry[] {
    return this.log;
  }

  /** Append an event and return the sealed entry. */
  async append(kind: string, payload: unknown): Promise<TraceEntry> {
    if (kind.length === 0) throw new Error("TraceLogger.append: kind is required");
    const seq = this.log.length + 1;
    const id: TraceRef = `T${seq}`;
    const timestamp = this.clock().toISOString();
    const payloadSha256 = await sha256Hex(canonicalJson(payload));
    const prevSignature = this.lastSignature;
    const signature = await signHeader({ id, seq, kind, timestamp, payloadSha256, prevSignature });
    const entry: TraceEntry = {
      id,
      seq,
      kind,
      timestamp,
      payload,
      payloadSha256,
      prevSignature,
      signature,
    };
    this.log.push(entry);
    this.lastSignature = signature;
    return entry;
  }

  /** JSONL export: one entry per line, trailing newline. Empty log gives "". */
  toJsonl(): string {
    if (this.log.length === 0) return "";
    return this.log.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }

  /** Recompute every payload hash and signature from the stored data. */
  async verify(): Promise<VerifyResult> {
    return verifyEntries(this.log);
  }
}

/** Parse JSONL text back into entries. Throws on malformed lines. */
export function parseJsonl(text: string): TraceEntry[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as TraceEntry;
    } catch {
      throw new SyntaxError(`parseJsonl: line ${i + 1} is not valid JSON`);
    }
  });
}

/** Verify a sequence of entries (e.g. one parsed from JSONL). */
export async function verifyEntries(entries: readonly TraceEntry[]): Promise<VerifyResult> {
  let prev: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) return { ok: false, index: i, reason: "missing entry" };
    if (e.seq !== i + 1 || e.id !== `T${i + 1}`) {
      return { ok: false, index: i, reason: `sequence mismatch: expected T${i + 1}` };
    }
    if (e.prevSignature !== prev) {
      return { ok: false, index: i, reason: "prevSignature does not match previous entry" };
    }
    const payloadSha256 = await sha256Hex(canonicalJson(e.payload));
    if (payloadSha256 !== e.payloadSha256) {
      return { ok: false, index: i, reason: "payload hash mismatch" };
    }
    const signature = await signHeader({
      id: e.id,
      seq: e.seq,
      kind: e.kind,
      timestamp: e.timestamp,
      payloadSha256: e.payloadSha256,
      prevSignature: e.prevSignature,
    });
    if (signature !== e.signature) {
      return { ok: false, index: i, reason: "signature mismatch" };
    }
    prev = e.signature;
  }
  return { ok: true, count: entries.length };
}

interface SignedHeader {
  id: TraceRef;
  seq: number;
  kind: string;
  timestamp: string;
  payloadSha256: string;
  prevSignature: string | null;
}

function signHeader(h: SignedHeader): Promise<string> {
  return sha256Hex(canonicalJson(h));
}
