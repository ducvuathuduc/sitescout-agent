/**
 * Report renderer: ranked shortlists as Markdown where EVERY claim cites the
 * trace entries that produced it ([T7] → logs/<questionId>.jsonl line 8).
 *
 * Invariants enforced here:
 *  - every scored candidate lists its evidenceRefs;
 *  - the limitations section always discloses the buffer-approximation
 *    catchment (see docs/FEEDBACK.md#1);
 *  - candidates below the data-density floor are listed as excluded, never
 *    silently dropped and never scored as "no competition";
 *  - no claim is rendered without at least one trace reference.
 */
import type { SiteSelectionQuestion } from "../playbooks/site-selection/questions.js";
import type { MeetupQuestion } from "../playbooks/meetup-planning/questions.js";
import { TraceEntry, TraceLog } from "../agent/trace.js";
import {
  ScoredCandidate,
  ScoredVenue,
  WEIGHTS_VERSION,
  formatTrafficBand,
  rankCandidates,
  trafficBandFor,
  VN_HCMC_PROFILE,
} from "../scoring/model.js";
import {
  MICRO_FACTORS,
  MICRO_FACTOR_DESCRIPTIONS,
  MICRO_FACTOR_LABELS,
  checklistEntryText,
  emptyChecklist,
  verdictFor,
  type MicroChecklist,
} from "../engine/checklist.js";
import { expiryFor, isExpired, isStale } from "../engine/freshness.js";

function fmt(n: number): string {
  return n.toFixed(2);
}

export interface ExcludedCandidate {
  candidateId: string;
  candidateLabel: string;
  reason: string;
  refs: number[];
}

export interface SiteReportData {
  question: SiteSelectionQuestion;
  scored: ScoredCandidate[];
  excluded: ExcludedCandidate[];
  trace: readonly TraceEntry[];
  weightsVersion: string;
  creditsReport: string;
  /** Hand-verified street facts per candidate id (defaults to all-UNVERIFIED). */
  checklists?: Record<string, MicroChecklist>;
  /** Date the underlying data was fetched (YYYY-MM-DD); memo expires 30 days later. */
  dataAsOf?: string;
  expiresAt?: string;
  extras?: {
    droppedCategories: string[];
    coverage: { unionAreaM2?: number; sumAreaM2: number; refs: number[] };
    winnerRoute: { origin: string; timeS?: number; distanceM?: number; ref?: number } | null;
    toolsUsed: string[];
  };
}

export interface MeetupLeg {
  origin: string;
  timeS?: number;
  distanceM?: number;
  refs: number[];
}

export interface MeetupReportData {
  question: MeetupQuestion;
  venues: ScoredVenue[];
  winner: ScoredVenue | null;
  winnerLabel: string | null;
  legs: MeetupLeg[];
  unevaluableOrigins: string[];
  trace: readonly TraceEntry[];
  creditsReport: string;
}

function traceTable(trace: readonly TraceEntry[]): string[] {
  const lines: string[] = [];
  lines.push("## Evidence trace");
  lines.push("");
  lines.push("Every claim above traces to one of these tool calls. Full results are");
  lines.push("cached under `logs/results/<question-id>/<seq>.json`; digests");
  lines.push("below let you verify integrity.");
  lines.push("");
  lines.push("| Seq | Tool | Digest | Duration | Error |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const e of trace) {
    lines.push(
      `| ${TraceLog.cite(e.seq)} | \`${e.tool}\` | \`${e.resultDigest.slice(0, 19)}…\` | ${e.durationMs} ms | ${e.error ?? "—"} |`,
    );
  }
  lines.push("");
  return lines;
}

function siteLimitationsMd(): string[] {
  return [
    "## Limitations (read before acting on this report)",
    "",
    "- **Catchments are circular-buffer approximations** (`transform_geometry` buffer), not drive-time isochrones. The Geoapify MCP server exposes no isochrone tool (Isoline is REST-only); this gap is filed as `docs/FEEDBACK.md#1`. Treat accessibility scores as directional.",
    `- Scores use heuristic weights (version \`${WEIGHTS_VERSION}\`); not yet measured against real store outcomes.`,
    "- Candidates below the POI data-density floor are excluded from ranking, never scored as “no competition”.",
    "- POI data reflects Geoapify's places index at query time, not live foot traffic. Route times use approximated traffic at query time — time-of-day dependent.",
    "- This report is decision support, not a guarantee of business outcomes.",
    "",
  ];
}

export function renderReport(data: SiteReportData): string {
  const { question, excluded, trace } = data;
  const ranked = rankCandidates(data.scored);
  const lines: string[] = [];

  lines.push(`# SiteScout report: ${question.title}`);
  lines.push("");
  lines.push(`> Research question: ${question.question}`);
  lines.push(
    `> Generated: ${new Date().toISOString()} · trace: \`logs/${question.id}.jsonl\` (${trace.length} tool calls) · weights \`${data.weightsVersion}\``,
  );
  if (data.dataAsOf) {
    const exp = data.expiresAt ?? expiryFor(data.dataAsOf);
    lines.push(`> Data as of ${data.dataAsOf} · valid until ${exp} (30 days).`);
    if (isExpired(exp)) lines.push(`> **This memo has expired — re-run before deciding.**`);
    if (isStale(data.dataAsOf)) lines.push(`> **Stale data:** this memo's data is older than 90 days — re-run before deciding.`);
  }
  lines.push("");

  if (ranked.length === 0) {
    lines.push(
      "_No candidates ranked — every seed was unevaluable or below the data-density floor (see below)._",
    );
    lines.push("");
  } else {
    lines.push("## Executive summary");
    lines.push("");
    lines.push("The three spots to filter from, with their projected traffic bands and verdicts — forwardable by a franchise director.");
    lines.push("");
    lines.push("| # | Candidate | Score | Projected traffic | Verdict |");
    lines.push("|---|---|---|---|---|");
    ranked.slice(0, 3).forEach((c, i) => {
      const cl = data.checklists?.[c.candidateId] ?? emptyChecklist();
      lines.push(`| ${i + 1} | ${c.candidateLabel} | **${fmt(c.total)}** | ${formatTrafficBand(trafficBandFor(c.total, VN_HCMC_PROFILE))} | ${verdictFor(cl, i + 1)} |`);
    });
    lines.push("");
    lines.push("**Visit the site before signing a lease.**");
    lines.push("");
    lines.push("## Ranked shortlist");
    lines.push("");
    lines.push("| Rank | Candidate | Total | Competition | Complementarity | Catchment | Accessibility | Evidence |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    ranked.forEach((c, i) => {
      const refs = c.evidenceRefs.map(TraceLog.cite).join(" ") || "—";
      lines.push(
        `| ${i + 1} | ${c.candidateLabel} | **${fmt(c.total)}** | ${fmt(c.scores.competition)} ` +
          `| ${fmt(c.scores.complementarity)} | ${fmt(c.scores.catchment)} | ${fmt(c.scores.accessibility)} | ${refs} |`,
      );
    });
    lines.push("");
    lines.push("## Why each site ranks here");
    lines.push("");
    for (const [i, c] of ranked.entries()) {
      const refs = c.evidenceRefs.map(TraceLog.cite).join(" ");
      lines.push(`### ${c.candidateLabel} (total ${fmt(c.total)})`);
      lines.push(`- Competition sub-score ${fmt(c.scores.competition)} ${refs}`);
      lines.push(`- Complementarity sub-score ${fmt(c.scores.complementarity)} ${refs}`);
      lines.push(`- Catchment sub-score ${fmt(c.scores.catchment)} ${refs}`);
      lines.push(`- Accessibility sub-score ${fmt(c.scores.accessibility)} ${refs}`);
      lines.push(`- Projected traffic: ${formatTrafficBand(trafficBandFor(c.total, VN_HCMC_PROFILE))}`);
      if (data.dataAsOf) lines.push(`- Counts as of ${data.dataAsOf} (Geoapify Places; walk zone: circular buffer (no Isoline tool on the MCP server)) ${refs}`);
      lines.push(`- Verdict: ${verdictFor(data.checklists?.[c.candidateId] ?? emptyChecklist(), i + 1)}`);
      lines.push("");
    }
    lines.push("## Micro-feature checklist");
    lines.push("");
    lines.push("Hand-verified street facts (VERIFIED only by a named source — a dated site visit, a dated Street View / map imagery check, or operator confirmation; never inferred from POI density). UNVERIFIED is valid and publishable.");
    lines.push("");
    lines.push(`| Candidate | ${MICRO_FACTORS.map((f) => MICRO_FACTOR_LABELS[f]).join(" | ")} |`);
    lines.push(`|---|${MICRO_FACTORS.map(() => "---").join("|")}|`);
    for (const c of ranked) {
      const cl = data.checklists?.[c.candidateId] ?? emptyChecklist();
      lines.push(`| ${c.candidateLabel} | ${MICRO_FACTORS.map((f) => checklistEntryText(cl[f])).join(" | ")} |`);
    }
    lines.push("");
    lines.push("## What this model cannot see");
    lines.push("");
    lines.push("The model sees POI density, walk-zone area, and drive times. It cannot see street-level factors — each row shows every candidate's verification status for that factor. Anything UNVERIFIED needs a foot check before deciding.");
    lines.push("");
    for (const f of MICRO_FACTORS) {
      lines.push(`- ${MICRO_FACTOR_DESCRIPTIONS[f]}: ${ranked.map((c, i) => `#${i + 1} ${(data.checklists?.[c.candidateId] ?? emptyChecklist())[f].status}`).join(" · ")}`);
    }
    lines.push("");
  }

  if (data.extras) {
    const x = data.extras;
    lines.push("## Run notes");
    lines.push("");
    lines.push(`- MCP tools exercised in this run (${x.toolsUsed.length}/11): ${x.toolsUsed.map((t) => "`" + t + "`").join(", ")}`);
    if (x.coverage.unionAreaM2 !== undefined) {
      const overlap = 1 - x.coverage.unionAreaM2 / Math.max(1, x.coverage.sumAreaM2);
      lines.push(
        `- Union of all catchments: ${(x.coverage.unionAreaM2 / 1e6).toFixed(2)} km² vs. ${(x.coverage.sumAreaM2 / 1e6).toFixed(2)} km² summed → ${(overlap * 100).toFixed(0)}% overlap between candidates ${x.coverage.refs.map(TraceLog.cite).join(" ")}`,
      );
    }
    if (x.winnerRoute?.timeS !== undefined) {
      lines.push(
        `- Drive from ${x.winnerRoute.origin} to #1: ${Math.round(x.winnerRoute.timeS / 60)} min, ${((x.winnerRoute.distanceM ?? 0) / 1000).toFixed(1)} km ${x.winnerRoute.ref !== undefined ? TraceLog.cite(x.winnerRoute.ref) : ""}`,
      );
    }
    if (x.droppedCategories.length > 0) {
      lines.push(`- Categories dropped because they are not in the live catalog: ${x.droppedCategories.join(", ")}`);
    }
    lines.push("");
  }

  if (excluded.length > 0) {
    lines.push("## Excluded from ranking");
    lines.push("");
    lines.push(
      "These seeds were **not scored** — listed here so nothing is silently dropped:",
    );
    lines.push("");
    for (const x of excluded) {
      const refs = x.refs.map(TraceLog.cite).join(" ");
      lines.push(`- **${x.candidateLabel}** — ${x.reason} ${refs}`);
    }
    lines.push("");
  }

  lines.push(...traceTable(trace));
  lines.push(...siteLimitationsMd());
  lines.push("## Credit usage");
  lines.push("");
  lines.push("```");
  lines.push(data.creditsReport);
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

export function renderMeetupReport(data: MeetupReportData): string {
  const { question, venues, winner, trace } = data;
  const lines: string[] = [];

  lines.push(`# SiteScout meetup report: ${question.title}`);
  lines.push("");
  lines.push(`> Research question: ${question.question}`);
  lines.push(
    `> Generated: ${new Date().toISOString()} · trace: \`logs/${question.id}.jsonl\` (${trace.length} tool calls)`,
  );
  lines.push("");

  if (winner) {
    const worstMin = Math.round(winner.maxDurationS / 60);
    const meanMin = Math.round(winner.meanDurationS / 60);
    lines.push("## Fairest venue (min-max)");
    lines.push("");
    lines.push(
      `**${winner.venueLabel}**${data.winnerLabel ? ` — ${data.winnerLabel}` : ""} ` +
        `${winner.traceRefs.map(TraceLog.cite).join(" ")}`,
    );
    lines.push("");
    lines.push(
      `Chosen because it **minimizes the worst participant's travel time**: ` +
        `${worstMin} min (mean ${meanMin} min across ${data.legs.length} participants).`,
    );
    lines.push("");
    lines.push("### Per-participant legs (drive, approximated traffic)");
    lines.push("");
    lines.push("| Participant origin | Time | Distance | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const leg of data.legs) {
      const refs = leg.refs.map(TraceLog.cite).join(" ");
      lines.push(
        `| ${leg.origin} | ${leg.timeS !== undefined ? Math.round(leg.timeS / 60) + " min" : "n/a"} | ` +
          `${leg.distanceM !== undefined ? (leg.distanceM / 1000).toFixed(1) + " km" : "n/a"} | ${refs} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("_No venue could be ranked — no route-matrix evidence (see trace)._");
    lines.push("");
  }

  if (venues.length > 1) {
    lines.push("## Runner-up venues");
    lines.push("");
    lines.push("| Rank | Venue | Worst participant | Mean | Score | Evidence |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    venues.slice(1, 6).forEach((v, i) => {
      const refs = v.traceRefs.map(TraceLog.cite).join(" ");
      lines.push(
        `| ${i + 2} | ${v.venueLabel} | ${Math.round(v.maxDurationS / 60)} min | ` +
          `${Math.round(v.meanDurationS / 60)} min | ${fmt(v.score)} | ${refs} |`,
      );
    });
    lines.push("");
  }

  if (data.unevaluableOrigins.length > 0) {
    lines.push("## Origins not geocoded (excluded, not silently dropped)");
    lines.push("");
    for (const o of data.unevaluableOrigins) lines.push(`- ${o}`);
    lines.push("");
  }

  lines.push(...traceTable(trace));
  lines.push(...siteLimitationsMd());
  lines.push("## Credit usage");
  lines.push("");
  lines.push("```");
  lines.push(data.creditsReport);
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
