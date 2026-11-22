/**
 * Bangkok calibration bench — pure metric functions + dataset validation.
 *
 * No I/O except runBench's file reads; no network. The runner
 * (bench/bangkok-coffee/run.mjs) is offline: it scores a recorded run,
 * never calls Geoapify.
 *
 * [ASSUMPTION] Tier ordinals for correlation: high = 3, medium = 2,
 * low = 1, closed = 0, unknown = excluded from correlation.
 * [ASSUMPTION] An entry matches a ranked candidate within 150 m
 * (haversine); entries with no candidate that close are reported as
 * unmatched and excluded from the three metrics.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { haversineM } from "../geo/grid.js";

/** Match radius in metres (see header). */
export const BENCH_MATCH_RADIUS_M = 150;

export const BangkokDatasetEntrySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    area: z.string().min(1),
    status: z.enum(["open", "closed"]),
    opened_approx: z.string().min(1),
    closed_approx: z.string().nullable(),
    traffic_tier: z.enum(["high", "medium", "low", "unknown"]),
    tier_source: z.string().min(1),
    observed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "observed_at must be an ISO date (YYYY-MM-DD)"),
  })
  .refine((e) => e.status !== "closed" || e.closed_approx !== null, {
    message: "closed_approx must be non-null when status is \"closed\"",
  });

export type BangkokDatasetEntry = z.infer<typeof BangkokDatasetEntrySchema>;

export interface BenchMetrics {
  runDate: string;
  nEntries: number;
  nClosed: number;
  nMatched: number;
  rankCorrelation: number;
  top3HitRate: number;
  dudRate: number;
  unmatchedIds: string[];
}

/** Unwrap a dataset file: either a bare array or `{ entries: [...] }`. */
function unwrapEntries(data: unknown): unknown {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null && Array.isArray((data as { entries?: unknown }).entries)) {
    return (data as { entries: unknown }).entries;
  }
  return data;
}

/**
 * Validate a dataset (bare array or `{ entries: [...] }` file object).
 * Enforces the entry schema, ≥30 entries, ≥10 closed, unique ids.
 * `sizeErrors` separates the minimum-size/count failures from schema
 * failures: the size minimums are a Phase 1 gate condition (reported by
 * the runner), not a reason to refuse to compute metrics on small data.
 */
export function validateDataset(entries: unknown): { ok: boolean; errors: string[]; sizeErrors: string[] } {
  const errors: string[] = [];
  const sizeErrors: string[] = [];
  const list = unwrapEntries(entries);
  if (!Array.isArray(list)) {
    return { ok: false, errors: ["dataset must be an array of entries or an object with an `entries` array"], sizeErrors };
  }
  const seen = new Set<string>();
  list.forEach((raw, i) => {
    const parsed = BangkokDatasetEntrySchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(
        `entry ${i}: ${parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")}`,
      );
      return;
    }
    const e = parsed.data;
    if (seen.has(e.id)) errors.push(`entry ${i}: duplicate id "${e.id}"`);
    seen.add(e.id);
  });
  if (list.length < 30) sizeErrors.push(`dataset has ${list.length} entries, minimum is 30`);
  const nClosed = list.filter(
    (raw) => typeof raw === "object" && raw !== null && (raw as { status?: unknown }).status === "closed",
  ).length;
  if (nClosed < 10) sizeErrors.push(`dataset has ${nClosed} closed entries, minimum is 10`);
  errors.push(...sizeErrors);
  return { ok: errors.length === 0, errors, sizeErrors };
}

function ranks(xs: number[]): number[] {
  const sorted = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(xs.length);
  let k = 0;
  while (k < sorted.length) {
    let j = k;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[k].v) j++;
    const avg = (k + j) / 2 + 1; // 1-based average rank over the tie
    for (let t = k; t <= j; t++) r[sorted[t].i] = avg;
    k = j + 1;
  }
  return r;
}

/** Spearman rank correlation with average ties. 0 when undefined (<2 pairs or no variance). */
export function spearmanRankCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Share of the top-3 (ranked best-first) whose matched entry is high/medium tier. */
export function top3HitRate(ranked: Array<{ tier: string }>): number {
  const top3 = ranked.slice(0, 3);
  if (top3.length === 0) return 0;
  return top3.filter((c) => c.tier === "high" || c.tier === "medium").length / top3.length;
}

/** Share of the top-3 that are closed or low tier. */
export function dudRate(top3: Array<{ status: string; tier: string }>): number {
  const t = top3.slice(0, 3);
  if (t.length === 0) return 0;
  return t.filter((c) => c.status === "closed" || c.tier === "low").length / t.length;
}

interface RankedCandidate {
  id: string;
  label?: string;
  lat: number;
  lon: number;
  total: number;
}

function unwrapCandidates(data: unknown): RankedCandidate[] {
  if (Array.isArray(data)) return data as RankedCandidate[];
  if (typeof data === "object" && data !== null && Array.isArray((data as { candidates?: unknown }).candidates)) {
    return (data as { candidates: RankedCandidate[] }).candidates;
  }
  throw new Error("recorded run must be an array of candidates or an object with a `candidates` array");
}

function tierOrdinal(e: BangkokDatasetEntry): number | null {
  if (e.status === "closed") return 0;
  if (e.traffic_tier === "high") return 3;
  if (e.traffic_tier === "medium") return 2;
  if (e.traffic_tier === "low") return 1;
  return null; // unknown: excluded from correlation
}

/**
 * Score a recorded run against the dataset. Reads both JSON files, matches
 * entries to candidates within 150 m, returns the three bench metrics.
 * Throws on an invalid dataset or an unreadable file.
 */
export function runBench(datasetPath: string, runPath: string): BenchMetrics {
  let datasetRaw: unknown;
  try {
    datasetRaw = JSON.parse(readFileSync(datasetPath, "utf8"));
  } catch (e) {
    throw new Error(`cannot read dataset ${datasetPath}: ${(e as Error).message}`);
  }
  const validation = validateDataset(datasetRaw);
  // Schema failures are fatal. Size/count minimums are a Phase 1 gate
  // condition, not a crash: metrics are still computed (e.g. on the 5-entry
  // EXAMPLE file) and the runner flags the shortfall in RESULTS.md.
  const fatal = validation.errors.filter((e) => !validation.sizeErrors.includes(e));
  if (fatal.length > 0) {
    throw new Error(`invalid dataset ${datasetPath}: ${fatal.join("; ")}`);
  }
  const entries = unwrapEntries(datasetRaw) as BangkokDatasetEntry[];
  let runRaw: unknown;
  try {
    runRaw = JSON.parse(readFileSync(runPath, "utf8"));
  } catch (e) {
    throw new Error(`cannot read recorded run ${runPath}: ${(e as Error).message}`);
  }
  const candidates = unwrapCandidates(runRaw).slice().sort((a, b) => b.total - a.total);

  // Match each entry to its nearest candidate within the radius.
  const matched = new Map<string, { entry: BangkokDatasetEntry; candidate: RankedCandidate; distanceM: number }>();
  const unmatchedIds: string[] = [];
  for (const entry of entries) {
    let best: RankedCandidate | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = haversineM({ lat: entry.lat, lon: entry.lon }, { lat: c.lat, lon: c.lon });
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best !== null && bestD <= BENCH_MATCH_RADIUS_M) {
      matched.set(entry.id, { entry, candidate: best, distanceM: bestD });
    } else {
      unmatchedIds.push(entry.id);
    }
  }
  // Reverse lookup: each candidate's nearest matched entry (several entries
  // may match one candidate; the closest one is the ground truth for it).
  const byCandidate = new Map<string, { entry: BangkokDatasetEntry; distanceM: number }>();
  for (const { entry, candidate, distanceM } of matched.values()) {
    const cur = byCandidate.get(candidate.id);
    if (!cur || distanceM < cur.distanceM) byCandidate.set(candidate.id, { entry, distanceM });
  }

  // Rank correlation: engine totals vs. tier ordinals over matched pairs.
  const pairs = [...matched.values()].flatMap(({ entry, candidate }) => {
    const ord = tierOrdinal(entry);
    return ord === null ? [] : [{ total: candidate.total, ordinal: ord }];
  });
  const rankCorrelation = spearmanRankCorrelation(
    pairs.map((p) => p.total),
    pairs.map((p) => p.ordinal),
  );

  // Top-3 rates over the top-3 ranked candidates. A top-3 candidate with
  // no matched entry counts as neither a hit nor a dud (tier "unknown").
  const top3 = candidates.slice(0, 3).map((c) => {
    const m = byCandidate.get(c.id);
    return m ? { status: m.entry.status, tier: m.entry.traffic_tier } : { status: "unknown", tier: "unknown" };
  });

  return {
    runDate: new Date().toISOString().slice(0, 10),
    nEntries: entries.length,
    nClosed: entries.filter((e) => e.status === "closed").length,
    nMatched: matched.size,
    rankCorrelation,
    top3HitRate: top3HitRate(top3),
    dudRate: dudRate(top3),
    unmatchedIds,
  };
}
