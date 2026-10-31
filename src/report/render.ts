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
  rankCandidates,
} from "../scoring/model.js";

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
    `- Scores use heuristic weights (version \`${WEIGHTS_VERSION}\`); not calibrated against real store outcomes.`,
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
  lines.push("");

  if (ranked.length === 0) {
    lines.push(
      "_No candidates ranked — every seed was unevaluable or below the data-density floor (see below)._",
    );
    lines.push("");
  } else {
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
    for (const c of ranked) {
      const refs = c.evidenceRefs.map(TraceLog.cite).join(" ");
      lines.push(`### ${c.candidateLabel} (total ${fmt(c.total)})`);
      lines.push(`- Competition sub-score ${fmt(c.scores.competition)} ${refs}`);
      lines.push(`- Complementarity sub-score ${fmt(c.scores.complementarity)} ${refs}`);
      lines.push(`- Catchment sub-score ${fmt(c.scores.catchment)} ${refs}`);
      lines.push(`- Accessibility sub-score ${fmt(c.scores.accessibility)} ${refs}`);
      lines.push("");
    }
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
