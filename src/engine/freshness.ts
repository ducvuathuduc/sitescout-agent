/**
 * Freshness + memo expiry (spec §2/H2.1, H2.4).
 *
 * [ASSUMPTION] (spec A3) Freshness threshold 90 days; memo validity
 * 30 days. A memo should be a fraction of a shop's lifetime, not a
 * quarter of it. Pilot feedback / Phase 3 evidence may move these.
 */

/** A competitor record is stale when its source data is older than this. */
export const FRESHNESS_THRESHOLD_DAYS = 90;

/** A memo is valid for this many days from its "Data as of" date. */
export const MEMO_VALID_DAYS = 30;

const DAY_MS = 86_400_000;

/** True when `now` is more than FRESHNESS_THRESHOLD_DAYS after `asOf` (ISO date). */
export function isStale(asOf: string, now: Date = new Date()): boolean {
  const asOfMs = Date.parse(asOf);
  if (Number.isNaN(asOfMs)) return true; // unparseable date: flag it, never trust it
  return now.getTime() - asOfMs > FRESHNESS_THRESHOLD_DAYS * DAY_MS;
}

/** True when `now` is past the memo's expiry date (ISO date). */
export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  const expMs = Date.parse(expiresAt);
  if (Number.isNaN(expMs)) return true;
  return now.getTime() > expMs;
}

/** Expiry date (YYYY-MM-DD) for a memo whose data is as of `asOf`. */
export function expiryFor(asOf: string): string {
  const ms = Date.parse(asOf);
  if (Number.isNaN(ms)) throw new Error(`expiryFor: unparseable date "${asOf}"`);
  return new Date(ms + MEMO_VALID_DAYS * DAY_MS).toISOString().slice(0, 10);
}
