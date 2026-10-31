/**
 * Credit budget of the public demo — pure functions, no Cloudflare runtime,
 * so they run in the Node test suite (tests/worker-budget.test.ts).
 *
 * Rules from https://www.geoapify.com/pricing-details/ and
 * https://apidocs.geoapify.com/docs/mcp/ (read 2026-10-31):
 *   - Places / geocoding: max(1, ceil(returned features / 20))
 *   - Route Matrix: max(sources, targets) * min(sources, targets, 10)
 *   - Isoline (time): 1 credit for each 5 minutes. A multi-range request is
 *     counted as the sum of its ranges (the conservative reading).
 *   - Boundaries: 1 credit per 20 results, plus 1 per result when a polygon
 *     (geometry other than "point") is returned
 *   - Place Details: 1 credit, plus 1 for each 5 minutes of an isochrone feature
 *   - Map tile: 0.25 credit (4 tiles = 1 credit)
 *   - everything else the demo allows: 1 credit per request
 *
 * One daily budget covers API calls AND map tiles:
 *   spent = credits + tiles * TILE_CREDITS
 */

export const TILE_CREDITS = 0.25;
/** Default daily cap: 80 % of the Geoapify free plan (3,000 credits/day). */
export const DEFAULT_DAILY_CAP = 2400;
export const DEFAULT_PER_IP_CALL_CAP = 180;

/** Credits for one time isoline request: `range` is in seconds, comma-separated for several bands. */
export function isolineCredits(range: string | null, type: string | null = "time"): number {
  const ranges = (range ?? "").split(",").map(Number).filter((r) => r > 0);
  if (ranges.length === 0) return 1;
  if ((type ?? "time") !== "time") return ranges.length; // isodistance is not used by the demo
  return ranges.reduce((sum, r) => sum + Math.max(1, Math.ceil(r / 300)), 0);
}

/** Estimated credits for one successful proxied Geoapify call. */
export function credits(path: string, query: URLSearchParams, data: unknown, body: unknown): number {
  if (path === "/v2/places") return Math.max(1, Math.ceil(((data as { features?: unknown[] })?.features?.length ?? 0) / 20));
  if (path === "/v1/routematrix") {
    const b = body as { sources?: unknown[]; targets?: unknown[] };
    const s = b?.sources?.length ?? 1, t = b?.targets?.length ?? 1;
    return Math.max(s, t) * Math.min(s, t, 10);
  }
  if (path === "/v1/isoline") return isolineCredits(query.get("range"), query.get("type"));
  if (path === "/v2/place-details") {
    // 1 credit, plus 1 for each 5 minutes of an isochrone feature (walk_10, drive_5, …)
    return 1 + (query.get("features") ?? "").split(",").reduce((s, f) => {
      const m = /^(walk|drive)_(\d+)$/.exec(f.trim());
      return s + (m ? Math.ceil(Number(m[2]) / 5) : 0);
    }, 0);
  }
  if (path === "/v1/boundaries/part-of") {
    const n = (data as { features?: unknown[] })?.features?.length ?? 0;
    const geometry = query.get("geometry") ?? "point"; // the API's default
    return Math.max(1, Math.ceil(n / 20)) + (geometry !== "point" ? n : 0);
  }
  return 1;
}

/** Credits spent today, API calls and tiles together. */
export function spent(u: { credits: number; tiles: number }): number {
  return u.credits + u.tiles * TILE_CREDITS;
}

export type CapDecision = { ok: true } | { ok: false; reason: "daily" | "visitor"; used: number; cap: number };

/** May one more live API call start? Tiles only check the daily budget (pass ipCalls = 0). */
export function checkCaps(
  u: { credits: number; tiles: number; ipCalls: number },
  caps: { daily: number; perIp: number },
): CapDecision {
  const s = spent(u);
  if (s >= caps.daily) return { ok: false, reason: "daily", used: s, cap: caps.daily };
  if (u.ipCalls >= caps.perIp) return { ok: false, reason: "visitor", used: u.ipCalls, cap: caps.perIp };
  return { ok: true };
}
