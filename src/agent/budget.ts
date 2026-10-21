/**
 * API-credit budgeting.
 *
 * Per-tool credit estimators from the verified rules
 * (research/track1-geopify-deepdive.md §3):
 *  - geocode_address / geocode_structured_address / reverse_geocode_coordinates: 1/call
 *  - search_places: ceil(results / 20) — estimated from the requested `limit`,
 *    settled from the actual result count after the call
 *  - calculate_route: 1 per waypoint pair + 1 per `avoid` toggle
 *    (route_details/elevation/optimize surcharges not used by SiteScout)
 *  - calculate_route_matrix: max(sources, targets) × min(sources, targets, 10)
 *  - list_place_categories: 0
 *  - combine_geometries / evaluate_spatial_relation / measure_geometry /
 *    transform_geometry: 0 — no per-call credit documented for the MCP path
 *    (geometry ops; the MCP server adds no surcharge — track1 §1).
 *
 * Every run prints `credits used / estimated` per question; a `--budget` cap
 * aborts planning before overspend. Free-tier headroom: ~100 credits/question
 * vs 3,000/day.
 */
import type { McpToolName, ToolArgs } from "../mcp/client.js";

export interface CreditLedgerLine {
  seq: number;
  tool: McpToolName;
  estimated: number;
  /** Settled after the call from the real result count (null = failed/unknown). */
  actual: number | null;
}

/** Estimate credits for one planned call (before it is sent). */
export function estimateCall(tool: McpToolName, args: ToolArgs): number {
  switch (tool) {
    case "geocode_address":
    case "geocode_structured_address":
    case "reverse_geocode_coordinates":
      return 1;
    case "search_places": {
      const limit = typeof args.limit === "number" ? args.limit : 20;
      return Math.max(1, Math.ceil(limit / 20));
    }
    case "calculate_route": {
      const wps = Array.isArray(args.waypoints) ? args.waypoints.length : 2;
      const avoid = Array.isArray(args.avoid) ? args.avoid.length : 0;
      return Math.max(1, wps - 1) + avoid;
    }
    case "calculate_route_matrix": {
      const s = Array.isArray(args.sources) ? args.sources.length : 1;
      const t = Array.isArray(args.targets) ? args.targets.length : s;
      return Math.max(s, t) * Math.min(s, t, 10);
    }
    case "list_place_categories":
    case "combine_geometries":
    case "evaluate_spatial_relation":
    case "measure_geometry":
    case "transform_geometry":
      return 0;
    default:
      return 1; // conservative for unknown tools
  }
}

/** Settle the actual credit cost from a real tool result. */
export function settleActual(tool: McpToolName, args: ToolArgs, result: unknown): number {
  if (tool === "search_places") {
    const r = result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: { results?: unknown[] } } | null;
    const count =
      r?.structuredContent?.results?.length ??
      (() => {
        try {
          const text = r?.content?.find((b) => typeof b?.text === "string")?.text;
          const parsed = text ? (JSON.parse(text) as { results?: unknown[]; features?: unknown[] }) : undefined;
          return parsed?.results?.length ?? parsed?.features?.length;
        } catch {
          return undefined;
        }
      })();
    if (typeof count === "number") return Math.max(1, Math.ceil(count / 20));
  }
  return estimateCall(tool, args);
}

export class BudgetTracker {
  private lines: CreditLedgerLine[] = [];
  /** Optional hard cap: planning aborts before a call that would exceed it. */
  constructor(readonly cap?: number) {}

  /** Record a planned call; throws when the cap would be exceeded. */
  plan(seq: number, tool: McpToolName, args: ToolArgs): number {
    const estimated = estimateCall(tool, args);
    if (this.cap !== undefined && this.estimatedTotal + estimated > this.cap) {
      throw new Error(
        `budget exceeded: planned ${this.estimatedTotal + estimated} credits > cap ${this.cap}. ` +
          `Re-run with a higher --budget or fewer candidates.`,
      );
    }
    this.lines.push({ seq, tool, estimated, actual: null });
    return estimated;
  }

  settle(seq: number, actual: number): void {
    const line = this.lines.find((l) => l.seq === seq);
    if (line) line.actual = actual;
  }

  get estimatedTotal(): number {
    return this.lines.reduce((s, l) => s + l.estimated, 0);
  }

  get actualTotal(): number | null {
    if (this.lines.some((l) => l.actual === null)) return null;
    return this.lines.reduce((s, l) => s + (l.actual ?? 0), 0);
  }

  /** Human-readable per-question credit report. */
  report(): string {
    const rows = this.lines.map(
      (l) =>
        `  [T${l.seq}] ${l.tool}: est ${l.estimated}` +
        (l.actual === null ? "" : ` / actual ${l.actual}`),
    );
    const actual = this.actualTotal;
    rows.push(
      `Total: estimated ${this.estimatedTotal}` +
        (actual === null ? " credits (some calls failed/unsettled)" : ` / actual ${actual}`) +
        " credits ≈ free-tier 3,000/day",
    );
    return rows.join("\n");
  }
}
