/**
 * Local signals — human-observed / operator-reported only (spec §2.4).
 *
 * A signal is something the model cannot fetch: delivery-app presence
 * observed on the street, a new competitor the operator saw open, a
 * closure the operator confirms. Each signal records observer, date,
 * and street. No scraping: there is no fetcher for these, and there
 * must never be one (Grab/Foodpanda/telco are cut from scope — see
 * docs/UPGRADE-SPEC.md §4).
 *
 * Pure module: no I/O. File reading lives in ./signals-file.ts
 * (Node-only), for the same reason parseChecklistFile lives in
 * ./checklist-file.ts — the browser demo bundles the engine, and a
 * `node:fs` import there breaks the web build. Never import
 * ./signals-file.ts from browser code.
 *
 * Signals never alter a score — they are displayed evidence only.
 */
import { z } from "zod";

export const LocalSignalSchema = z.object({
  kind: z.enum(["delivery-presence", "new-competitor", "closure"]),
  street: z.string().min(1),
  observedBy: z.string().min(1),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "observedAt must be an ISO date (YYYY-MM-DD)"),
  note: z.string().min(1).optional(),
});

export type LocalSignal = z.infer<typeof LocalSignalSchema>;

export const SignalsFileSchema = z.object({
  signals: z.array(LocalSignalSchema),
});

export type SignalsFile = z.infer<typeof SignalsFileSchema>;

/** Human label per signal kind, for memo rendering. */
export const SIGNAL_KIND_LABELS: Record<LocalSignal["kind"], string> = {
  "delivery-presence": "Delivery presence observed",
  "new-competitor": "New competitor",
  closure: "Closure",
};
