/**
 * Micro-feature checklist (spec §1/H1.1) — the street-level facts the model
 * cannot see, verified by hand and carried on every memo candidate.
 *
 * Rules (verbatim from the spec):
 * - A factor is VERIFIED only by a named source — a dated site visit, a
 *   dated Street View / map imagery check (capture date recorded), or
 *   operator confirmation. Never inferred from POI density.
 * - UNVERIFIED is a valid, publishable state.
 * - A candidate with ≥2 UNVERIFIED factors in its top 3 cannot be ranked
 *   #1 with a "recommend" verdict; the memo must say "verify on foot
 *   before deciding". "Top 3" means the candidate's rank is 1–3.
 * - `alleyLighting` may be "N/A" (non-soi candidates); the other five
 *   factors never take "N/A".
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

export const MICRO_FACTORS = [
  "walkability",
  "curbAppeal",
  "construction",
  "morningShade",
  "motorcycleParking",
  "alleyLighting",
] as const;

export type MicroFactor = (typeof MICRO_FACTORS)[number];

export type ChecklistStatus = "VERIFIED" | "UNVERIFIED" | "N/A";

export type Verdict = "recommend" | "verify on foot before deciding";

export interface ChecklistEntry {
  status: ChecklistStatus;
  /** Required when status is VERIFIED: who/what verified it, and when. */
  source?: string;
  /** ISO date (YYYY-MM-DD) of the verification, when recorded. */
  observedAt?: string;
}

export type MicroChecklist = Record<MicroFactor, ChecklistEntry>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ChecklistEntrySchema: z.ZodType<ChecklistEntry> = z
  .object({
    status: z.enum(["VERIFIED", "UNVERIFIED", "N/A"]),
    source: z.string().min(1).optional(),
    observedAt: z.string().regex(ISO_DATE, "observedAt must be an ISO date (YYYY-MM-DD)").optional(),
  })
  .refine((e) => e.status !== "VERIFIED" || (e.source !== undefined && e.source.length > 0), {
    message: "source is required when status is VERIFIED",
  });

const MicroChecklistSchema: z.ZodType<MicroChecklist> = z
  .object({
    walkability: ChecklistEntrySchema,
    curbAppeal: ChecklistEntrySchema,
    construction: ChecklistEntrySchema,
    morningShade: ChecklistEntrySchema,
    motorcycleParking: ChecklistEntrySchema,
    alleyLighting: ChecklistEntrySchema,
  })
  .refine(
    (c) => (Object.keys(c) as MicroFactor[]).every((f) => f === "alleyLighting" || c[f].status !== "N/A"),
    { message: 'only "alleyLighting" may be "N/A"' },
  );

/** File shape: `{ candidates: Record<candidateId, MicroChecklist> }`. */
export const ChecklistFileSchema = z.object({
  candidates: z.record(MicroChecklistSchema),
});

export type ChecklistFile = z.infer<typeof ChecklistFileSchema>;

/** Short labels for the six micro-factors (checklist tables). */
export const MICRO_FACTOR_LABELS: Record<MicroFactor, string> = {
  walkability: "Walkability",
  curbAppeal: "Curb appeal",
  construction: "Construction",
  morningShade: "Morning shade",
  motorcycleParking: "Motorcycle parking",
  alleyLighting: "Alley lighting",
};

/** Full descriptions for the "What this model cannot see" section. */
export const MICRO_FACTOR_DESCRIPTIONS: Record<MicroFactor, string> = {
  walkability: "Walkability of the approach (pavement, crossing, slope)",
  curbAppeal: "Curb appeal (visibility from the street, signage line-of-sight)",
  construction: "Active construction on the street/block",
  morningShade: "Morning-shade side of the street",
  motorcycleParking: "Motorcycle parking within 50 m",
  alleyLighting: "Alley lighting after dark (soi candidates)",
};

/** One checklist entry as memo copy: "VERIFIED — <source>, <date>" or the raw status. */
export function checklistEntryText(e: ChecklistEntry): string {
  if (e.status !== "VERIFIED") return e.status;
  return `VERIFIED — ${e.source ?? "unnamed source"}${e.observedAt ? `, ${e.observedAt}` : ""}`;
}

/** Every factor UNVERIFIED — the default when no checklist file is given. */
export function emptyChecklist(): MicroChecklist {
  return Object.fromEntries(MICRO_FACTORS.map((f) => [f, { status: "UNVERIFIED" }])) as MicroChecklist;
}

/** The ≥2-UNVERIFIED-in-top-3 rule; "N/A" never counts toward the 2. */
export function verdictFor(checklist: MicroChecklist, rank: number): Verdict {
  const unverified = Object.values(checklist).filter((f) => f.status === "UNVERIFIED").length;
  return rank >= 1 && rank <= 3 && unverified >= 2 ? "verify on foot before deciding" : "recommend";
}

/**
 * Read + validate a checklist file. Throws an Error naming the file and the
 * first problem — never returns a partial checklist.
 */
export function parseChecklistFile(path: string): ChecklistFile {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`checklist file ${path}: cannot read (${(e as Error).message})`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`checklist file ${path}: invalid JSON (${(e as Error).message})`);
  }
  const parsed = ChecklistFileSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`checklist file ${path}: ${first.path.join(".")}: ${first.message}`);
  }
  return parsed.data;
}

/**
 * Apply a parsed checklist map to a run's candidates (sets `checklist` and
 * `verdict` per candidate). Throws naming any candidate id in the file
 * that is not in the run — never silently renders everything UNVERIFIED.
 */
export function applyChecklists(
  result: { candidates: Array<{ id: string; rank: number; checklist?: MicroChecklist; verdict?: Verdict }> },
  checklists: Record<string, MicroChecklist>,
): void {
  for (const [id, checklist] of Object.entries(checklists)) {
    const c = result.candidates.find((x) => x.id === id);
    if (!c) throw new Error(`checklist names unknown candidate id "${id}" (not in this run)`);
    c.checklist = checklist;
    c.verdict = verdictFor(checklist, c.rank);
  }
}
