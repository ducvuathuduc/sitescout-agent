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
