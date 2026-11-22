/**
 * Outcomes dataset — one line per (memo, candidate) in
 * `bench/outcomes/outcomes.jsonl`.
 *
 * Rules (spec §2.3, §3.2):
 * - `measurementMethod` is required — no outcome is recorded without it.
 * - `actualDailyCustomersMean` and `actualTrafficTier` may both be null
 *   only when `decision` is "signed" (lease signed, shop not open yet).
 *   A signed-lease outcome is a signed-lease proof element, not a
 *   traffic-match proof point.
 * - `projectedLow` / `projectedHigh` are copied from the memo's traffic
 *   band at record time, so the outcomes file is self-contained.
 * - The two measurement methods are never mixed across pilots (see
 *   bench/outcomes/SCHEMA.md); this schema validates one line at a time.
 */
import { z } from "zod";

export const OutcomeSchema = z
  .object({
    memoId: z.string().min(1),
    candidateId: z.string().min(1),
    candidateLabel: z.string().min(1).optional(),
    decision: z.enum(["signed", "opened", "passed"]),
    actualDailyCustomersMean: z.number().nonnegative().nullable(),
    actualTrafficTier: z.enum(["high", "medium", "low"]).nullable(),
    measurementMethod: z.enum(["customer-counts", "pos-transactions"]),
    projectedLow: z.number().nonnegative(),
    projectedHigh: z.number().nonnegative(),
    observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "observedAt must be an ISO date (YYYY-MM-DD)"),
    source: z.string().min(1),
    /** Set only on the synthetic demonstration line; never on real outcomes. */
    _example: z.boolean().optional(),
  })
  .refine((o) => o.projectedLow <= o.projectedHigh, {
    path: ["projectedLow"],
    message: "projectedLow must be <= projectedHigh",
  })
  .refine(
    (o) =>
      o.decision === "signed" || o.actualDailyCustomersMean !== null || o.actualTrafficTier !== null,
    {
      path: ["actualDailyCustomersMean"],
      message:
        'actual traffic (actualDailyCustomersMean or actualTrafficTier) is required unless decision is "signed"',
    },
  );

export type Outcome = z.infer<typeof OutcomeSchema>;

/** Parse one JSONL line into an Outcome. Throws naming the offending field. */
export function parseOutcomeLine(line: string): Outcome {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (e) {
    throw new Error(`invalid outcome line (not JSON): ${(e as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("invalid outcome: line must be a JSON object");
  }
  const parsed = OutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `invalid outcome: ${parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

/**
 * Match rule (spec §3.2, verbatim): the actual 30-day mean falls within
 * the memo's projected band widened by ±20% — within
 * `[low × 0.8, high × 1.2]`. The band widens; the actual does not.
 */
export function matchTrafficBand(low: number, high: number, actualMean: number): boolean {
  return actualMean >= low * 0.8 && actualMean <= high * 1.2;
}

export interface CalibrationRow {
  memoId: string;
  candidateId: string;
  decision: Outcome["decision"];
  projectedLow: number;
  projectedHigh: number;
  actualDailyCustomersMean: number | null;
  measurementMethod: Outcome["measurementMethod"];
  /** true/false for traffic-match points; null for signed-only rows (no traffic yet). */
  match: boolean | null;
  isExample: boolean;
}

export interface CalibrationReport {
  rows: CalibrationRow[];
  nOutcomes: number;
  /** Real (non-example) outcomes with an actual mean — the traffic-match proof points. */
  nMatchable: number;
  nMatched: number;
  /** Share of matchable real outcomes within ±20%; null when there are none. */
  matchShare: number | null;
  /** Real signed-lease outcomes with no traffic yet (proof elements, not match points). */
  nSignedOnly: number;
}

/**
 * Pure report computation: per-outcome rows + aggregate. Example lines
 * are judged like any other row but EXCLUDED from the aggregate — they
 * are never presented as evidence.
 */
export function computeCalibrationReport(outcomes: Outcome[]): CalibrationReport {
  const rows: CalibrationRow[] = outcomes.map((o) => ({
    memoId: o.memoId,
    candidateId: o.candidateId,
    decision: o.decision,
    projectedLow: o.projectedLow,
    projectedHigh: o.projectedHigh,
    actualDailyCustomersMean: o.actualDailyCustomersMean,
    measurementMethod: o.measurementMethod,
    match:
      o.actualDailyCustomersMean === null
        ? null
        : matchTrafficBand(o.projectedLow, o.projectedHigh, o.actualDailyCustomersMean),
    isExample: o._example === true,
  }));
  const real = rows.filter((r) => !r.isExample);
  const matchable = real.filter((r) => r.match !== null);
  const nMatched = matchable.filter((r) => r.match === true).length;
  return {
    rows,
    nOutcomes: rows.length,
    nMatchable: matchable.length,
    nMatched,
    matchShare: matchable.length === 0 ? null : nMatched / matchable.length,
    nSignedOnly: real.filter((r) => r.decision === "signed" && r.match === null).length,
  };
}
