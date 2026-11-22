/**
 * Render a ScoutResult as Markdown, a self-contained HTML page, a JSONL
 * trace, and a Geoapify Static Maps request body. Pure functions — no I/O.
 */
import type { CandidateResult, ScoutResult } from "./scout.js";
import { DEFAULT_WEIGHTS, formatTrafficBand } from "../scoring/model.js";
import {
  MICRO_FACTORS,
  MICRO_FACTOR_DESCRIPTIONS,
  MICRO_FACTOR_LABELS,
  checklistEntryText,
  emptyChecklist,
  verdictFor,
  type MicroChecklist,
} from "./checklist.js";
import { expiryFor, isExpired, isStale } from "./freshness.js";
import { SIGNAL_KIND_LABELS } from "./signals.js";

const cite = (seqs: number[]): string => [...new Set(seqs)].sort((a, b) => a - b).map((s) => `[T${s}]`).join(" ");
const f2 = (x: number): string => x.toFixed(2);

/** Defensive reads: memos recorded before v2 lack these fields. */
const asOf = (r: ScoutResult): string => r.dataAsOf ?? r.generatedAt.slice(0, 10);
const expires = (r: ScoutResult): string => r.expiresAt ?? expiryFor(asOf(r));
const checklistOf = (c: CandidateResult): MicroChecklist => c.checklist ?? emptyChecklist();
const verdictOf = (c: CandidateResult): string => c.verdict ?? verdictFor(checklistOf(c), c.rank);
const coverageOf = (c: CandidateResult): string => (typeof c.coverage === "number" ? c.coverage.toFixed(2) : "n/a");

export const RANK_COLORS = ["#1785FB", "#2E9F5B", "#F29D38", "#8F5BD7", "#E05263", "#3BB5C4", "#7A8B99", "#B5893B"];

export function renderMarkdown(r: ScoutResult): string {
  const L: string[] = [];
  L.push(`# SiteScout: ${r.plan.business} in ${r.area.ward?.name ?? r.plan.area}`);
  L.push("");
  L.push(`> **Question:** ${r.question}`);
  L.push(`> Generated ${r.generatedAt} · ${r.calls.length} Geoapify API calls · ~${r.creditsEstimated} credits · ${(r.durationMs / 1000).toFixed(1)} s · ${r.engine} · weights \`${r.weightsVersion}\` · planner: ${r.planner}${r.plannerModel ? ` (${r.plannerModel})` : ""}`);
  L.push(`> Data as of ${asOf(r)} · valid until ${expires(r)} (30 days).`);
  if (isExpired(expires(r))) L.push(`> **This memo has expired — re-run before deciding.**`);
  if (isStale(asOf(r))) L.push(`> **Stale data:** this memo's data is older than 90 days — re-run before deciding.`);
  L.push("");
  L.push("![Shortlist map](map.jpg)");
  L.push("");
  L.push("## Executive summary");
  L.push("");
  L.push("The three spots to filter from, with their projected traffic bands and verdicts — forwardable by a franchise director.");
  L.push("");
  L.push(`| # | Candidate | Score | Projected traffic | Verdict |`);
  L.push(`|---|---|---|---|---|`);
  for (const c of [...r.candidates].sort((a, b) => a.rank - b.rank).slice(0, 3)) {
    L.push(`| ${c.rank} | ${c.label} | **${f2(c.total)}** | ${formatTrafficBand(c.trafficBand ?? null)} | ${verdictOf(c)} |`);
  }
  L.push("");
  L.push("**Visit the site before signing a lease.**");
  L.push("");
  L.push("## Plan");
  L.push("");
  L.push(`- Business: **${r.plan.business}** · competitors \`${r.plan.competitorCategory}\` · demand ${r.plan.demandCategories.map((c) => `\`${c}\``).join(", ")}`);
  L.push(`- Area: "${r.plan.area}" → ${r.area.anchor.label} (${r.area.anchor.resultType ?? "?"}, confidence ${r.area.anchor.confidence ?? "n/a"}) ${cite(r.area.refs.slice(0, 1))}`);
  if (r.area.ward) L.push(`- Administrative unit (Geoapify Boundaries): **${r.area.ward.name}** — ${r.area.ward.hierarchy.join(" ⊂ ")} ${cite(r.area.refs.slice(1, 2))}`);
  L.push(`- Catchment: **${r.plan.walkMinutes}-minute walking isochrone** per candidate (Geoapify Isoline API)`);
  L.push(`- ${r.candidates.length} candidates generated on a hex lattice inside the study area, pre-scored on ${r.area.refs.length > 2 ? "an area POI sample " + cite(r.area.refs.slice(2, 3)) : "the POI sample"}`);
  if (r.planNotes.length) L.push(`- Planner notes: ${r.planNotes.join("; ")}`);
  L.push("");
  L.push("## Ranked shortlist");
  L.push("");
  L.push(`| # | Candidate | Score | Coverage | Demand POIs (10-min walk) | Competitors | Walk area | Mean drive | Evidence |`);
  L.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const c of r.candidates) {
    L.push(`| ${c.rank} | ${c.label} | **${f2(c.total)}** | ${coverageOf(c)} | ${c.demandTotal} | ${c.competitors} | ${(c.isolineAreaM2 / 1e6).toFixed(2)} km² | ${c.meanDriveMin ?? "n/a"} min | ${cite(c.refs)} |`);
  }
  L.push("");
  L.push(`Score = ${DEFAULT_WEIGHTS.competition.toFixed(2)}·competition + ${DEFAULT_WEIGHTS.complementarity.toFixed(2)}·complementarity + ${DEFAULT_WEIGHTS.catchment.toFixed(2)}·catchment + ${DEFAULT_WEIGHTS.accessibility.toFixed(2)}·accessibility + ${DEFAULT_WEIGHTS.cost.toFixed(2)}·cost, each sub-score normalised to [0, 1] (unified model, weights \`${r.weightsVersion}\`).`);
  L.push("");
  L.push("## Why each site ranks where it does");
  L.push("");
  for (const c of r.candidates) {
    L.push(`### ${c.rank}. ${c.label} — ${f2(c.total)}`);
    L.push("");
    L.push(`${c.why} ${cite(c.refs)}`);
    L.push("");
    L.push(`- Sub-scores: competition ${f2(c.scores.competition)} · complementarity ${f2(c.scores.complementarity)} · catchment ${f2(c.scores.catchment)} · accessibility ${f2(c.scores.accessibility)} · cost ${f2(c.scores.cost)}`);
    L.push(`- Projected traffic: ${formatTrafficBand(c.trafficBand ?? null)}`);
    L.push(`- Data coverage: ${coverageOf(c)}`);
    L.push(`- Counts as of ${asOf(r)} (Geoapify Places; walk zone: Geoapify Isoline)${isStale(asOf(r)) ? " — **stale** (older than 90 days)" : ""} ${cite(c.refs)}`);
    L.push(`- Verdict: ${verdictOf(c)}`);
    L.push(`- Demand mix: ${Object.entries(c.demand).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    L.push(`- Drive time by origin: ${r.origins.filter((o) => o.lat !== undefined).map((o, i) => `${o.query.split(",")[0]} ${c.driveMinByOrigin[i] ?? "n/a"} min`).join(" · ")}`);
    L.push(`- Coordinates: ${c.lat}, ${c.lon}`);
    L.push("");
  }
  L.push("## Micro-feature checklist");
  L.push("");
  L.push("Hand-verified street facts (VERIFIED only by a named source — a dated site visit, a dated Street View / map imagery check, or operator confirmation; never inferred from POI density). UNVERIFIED is valid and publishable.");
  L.push("");
  L.push(`| Candidate | ${MICRO_FACTORS.map((f) => MICRO_FACTOR_LABELS[f]).join(" | ")} |`);
  L.push(`|---|${MICRO_FACTORS.map(() => "---").join("|")}|`);
  for (const c of r.candidates) {
    const cl = checklistOf(c);
    L.push(`| ${c.rank}. ${c.label} | ${MICRO_FACTORS.map((f) => checklistEntryText(cl[f])).join(" | ")} |`);
  }
  L.push("");
  L.push("## What this model cannot see");
  L.push("");
  L.push("The model sees POI density, walk-zone area, and drive times. It cannot see street-level factors — each row shows every candidate's verification status for that factor. Anything UNVERIFIED needs a foot check before deciding.");
  L.push("");
  for (const f of MICRO_FACTORS) {
    L.push(`- ${MICRO_FACTOR_DESCRIPTIONS[f]}: ${r.candidates.map((c) => `#${c.rank} ${checklistOf(c)[f].status}`).join(" · ")}`);
  }
  L.push("");
  if (r.winnerRoute) {
    L.push(`**Route to #1:** from ${r.winnerRoute.origin}, ${Math.round((r.winnerRoute.timeS ?? 0) / 60)} min / ${((r.winnerRoute.distanceM ?? 0) / 1000).toFixed(1)} km by car ${cite([r.winnerRoute.ref])}.`);
    L.push("");
  }
  if (r.winnerDrive5) {
    L.push(`**5-minute drive zone around #1** (Place Details \`drive_5\`): ${(geometryKm2(r.winnerDrive5.geometry)).toFixed(2)} km² ${cite([r.winnerDrive5.ref])}.`);
    L.push("");
  }
  if ((r.excluded ?? []).length > 0) {
    L.push("## Excluded — insufficient data");
    L.push("");
    L.push("These candidates were **not scored** — listed here so nothing is silently dropped:");
    L.push("");
    for (const x of r.excluded ?? []) {
      L.push(`- **${x.label}** — ${x.reason} ${cite(x.refs)}`);
    }
    L.push("");
  }
  if ((r.unconfirmed ?? []).length > 0) {
    L.push("## Unconfirmed competitors — verify on foot");
    L.push("");
    L.push("These competitors were listed by Places but Place Details could not confirm them (closed, delisted, or absent from the index). They are **not counted** in any competitor total or score — verify on foot before treating the area as empty.");
    L.push("");
    for (const u of r.unconfirmed ?? []) {
      L.push(`- **${u.name}** — ${u.category} · ${u.lat}, ${u.lon} — ${u.reason} ${cite(u.refs)}`);
    }
    L.push("");
  }
  if ((r.signals ?? []).length > 0) {
    L.push("## Local signals (operator-reported)");
    L.push("");
    L.push("Human-observed or operator-reported facts the model cannot fetch. They are displayed evidence only — they never alter a score.");
    L.push("");
    for (const s of r.signals ?? []) {
      L.push(`- **${SIGNAL_KIND_LABELS[s.kind]}** — ${s.street} — observed by ${s.observedBy} on ${s.observedAt}${s.note ? ` — ${s.note}` : ""}`);
    }
    L.push("");
  }
  L.push("## Limitations");
  L.push("");
  for (const l of r.limitations) L.push(`- ${l}`);
  L.push("");
  L.push("## Evidence trace");
  L.push("");
  L.push("Every `[Tn]` above is one real Geoapify request. The key is sent as a header, so these endpoints are reproducible as-is with your own key.");
  L.push("");
  L.push("| T | API | Request | Status | ms | Result | Credits≈ |");
  L.push("|---|---|---|---|---|---|---|");
  for (const c of r.calls) {
    const ep = c.endpoint.length > 90 ? c.endpoint.slice(0, 87) + "…" : c.endpoint;
    L.push(`| T${c.seq} | ${c.api} | \`${c.method} ${ep.replace(/\|/g, "%7C")}\` | ${c.status} | ${c.durationMs} | ${JSON.stringify(c.summary).replace(/\|/g, "/").slice(0, 80)} | ${c.credits} |`);
  }
  L.push("");
  L.push("---");
  L.push("Powered by [Geoapify](https://www.geoapify.com/) · © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors");
  L.push("");
  return L.join("\n");
}

function geometryKm2(g: { type: string; coordinates: unknown }): number {
  // lightweight local area (same formula as geo/grid)
  const R = 6_371_008.8;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const ringArea = (ring: number[][]): number => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += rad(ring[i + 1][0] - ring[i][0]) * (2 + Math.sin(rad(ring[i][1])) + Math.sin(rad(ring[i + 1][1])));
    return Math.abs((a * R * R) / 2);
  };
  const polys = g.type === "Polygon" ? [g.coordinates as number[][][]] : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];
  return polys.reduce((t, p) => t + p.reduce((s, ring, i) => s + (i === 0 ? 1 : -1) * ringArea(ring), 0), 0) / 1e6;
}

export function traceJsonl(r: ScoutResult): string {
  return r.calls.map((c) => JSON.stringify(c)).join("\n") + "\n";
}

/** Body for POST /v1/staticmap: isochrones + numbered candidate markers. */
export function staticMapBody(r: ScoutResult, width = 1200, height = 760): Record<string, unknown> {
  const features = r.candidates
    .filter((c) => c.isoline)
    .slice()
    .reverse()
    .map((c) => ({
      type: "Feature",
      geometry: c.isoline,
      properties: { linecolor: RANK_COLORS[(c.rank - 1) % RANK_COLORS.length], linewidth: c.rank === 1 ? 3 : 1.5, fillcolor: RANK_COLORS[(c.rank - 1) % RANK_COLORS.length], fillopacity: c.rank === 1 ? 0.28 : 0.12 },
    }));
  return {
    style: "positron",
    width,
    height,
    scaleFactor: 2,
    geojson: { type: "FeatureCollection", features },
    markers: r.candidates.map((c) => ({
      lat: c.lat,
      lon: c.lon,
      type: "awesome",
      color: RANK_COLORS[(c.rank - 1) % RANK_COLORS.length],
      size: c.rank === 1 ? "x-large" : "large",
      text: String(c.rank),
      textsize: "small",
      contentcolor: "#ffffff",
    })),
  };
}

export function renderHtml(r: ScoutResult, mapFile = "map.jpg"): string {
  const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);
  const rows = r.candidates
    .map((c) => `<tr><td><span class="dot" style="background:${RANK_COLORS[(c.rank - 1) % RANK_COLORS.length]}">${c.rank}</span></td><td>${esc(c.label)}<div class="why">${esc(c.why)}<br>Projected traffic: ${esc(formatTrafficBand(c.trafficBand ?? null))} · Coverage: ${coverageOf(c)} · Verdict: ${esc(verdictOf(c))}<br>Counts as of ${esc(asOf(r))} (Geoapify Places; walk zone: Geoapify Isoline)${isStale(asOf(r)) ? " — <b>stale</b> (older than 90 days)" : ""}.</div></td><td class="n"><b>${c.total.toFixed(2)}</b></td><td class="n">${coverageOf(c)}</td><td class="n">${c.demandTotal}</td><td class="n">${c.competitors}</td><td class="n">${c.meanDriveMin ?? "n/a"}</td><td class="refs">${[...new Set(c.refs)].map((s) => `<a href="#T${s}">T${s}</a>`).join(" ")}</td></tr>`)
    .join("");
  const top3 = [...r.candidates].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const summaryRows = top3
    .map((c) => `<tr><td><span class="dot" style="background:${RANK_COLORS[(c.rank - 1) % RANK_COLORS.length]}">${c.rank}</span></td><td>${esc(c.label)}</td><td class="n"><b>${c.total.toFixed(2)}</b></td><td>${esc(formatTrafficBand(c.trafficBand ?? null))}</td><td>${esc(verdictOf(c))}</td></tr>`)
    .join("");
  const checklistRows = r.candidates
    .map((c) => {
      const cl = checklistOf(c);
      return `<tr><td>${c.rank}. ${esc(c.label)}</td>${MICRO_FACTORS.map((f) => `<td>${esc(checklistEntryText(cl[f]))}</td>`).join("")}</tr>`;
    })
    .join("");
  const blindspot = MICRO_FACTORS.map(
    (f) => `<li><b>${esc(MICRO_FACTOR_DESCRIPTIONS[f])}:</b> ${r.candidates.map((c) => `#${c.rank} ${esc(checklistOf(c)[f].status)}`).join(" · ")}</li>`,
  ).join("");
  const trace = r.calls
    .map((c) => `<tr id="T${c.seq}"><td>T${c.seq}</td><td>${c.api}</td><td><code>${esc(c.method + " " + c.endpoint).slice(0, 160)}</code></td><td>${c.status}</td><td>${c.durationMs}</td><td>${esc(JSON.stringify(c.summary)).slice(0, 120)}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SiteScout — ${esc(r.plan.business)} in ${esc(r.area.ward?.name ?? r.plan.area)}</title>
<style>
body{margin:0;font:14px/1.5 "Open Sans",system-ui,sans-serif;color:#2E3C43;background:#F2F6F9}
main{max-width:1100px;margin:0 auto;padding:24px}
h1{font-size:26px;font-weight:400;margin:8px 0}
.meta{font-size:10px;text-transform:uppercase;color:#979EA1;letter-spacing:.02em}
.card{background:#fff;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,.24);padding:24px;margin:16px 0}
img{width:100%;border-radius:4px}
table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid #EEE;text-align:left;vertical-align:top}
th{font-size:10px;text-transform:uppercase;color:#636D72;font-weight:600}
.n{text-align:right;white-space:nowrap}.why{font-size:12px;color:#636D72}.refs a{color:#1785FB;font-size:11px;text-decoration:none}
.dot{display:inline-flex;width:22px;height:22px;border-radius:50%;color:#fff;align-items:center;justify-content:center;font-weight:600;font-size:12px}
code{font-size:11px;word-break:break-all}footer{font-size:12px;color:#636D72}
</style></head><body><main>
<div class="meta">SiteScout · ${esc(r.generatedAt)} · ${r.calls.length} Geoapify calls · ~${r.creditsEstimated} credits · Data as of ${esc(asOf(r))} · valid until ${esc(expires(r))}</div>
${isExpired(expires(r)) ? `<p><b>This memo has expired — re-run before deciding.</b></p>` : ""}
${isStale(asOf(r)) ? `<p><b>Stale data:</b> this memo's data is older than 90 days — re-run before deciding.</p>` : ""}
<h1>${esc(r.plan.business)} in ${esc(r.area.ward?.name ?? r.plan.area)}</h1>
<p>${esc(r.question)}</p>
<div class="card"><img src="${mapFile}" alt="Shortlist map with ${r.plan.walkMinutes}-minute walking isochrones"></div>
<div class="card"><h3>Executive summary</h3><p>The three spots to filter from, with their projected traffic bands and verdicts — forwardable by a franchise director.</p><table><thead><tr><th>#</th><th>Candidate</th><th class="n">Score</th><th>Projected traffic</th><th>Verdict</th></tr></thead><tbody>${summaryRows}</tbody></table><p><b>Visit the site before signing a lease.</b></p></div>
<div class="card"><table><thead><tr><th>#</th><th>Candidate</th><th class="n">Score</th><th class="n">Coverage</th><th class="n">Demand</th><th class="n">Competitors</th><th class="n">Drive (min)</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="card"><h3>Micro-feature checklist</h3><p>Hand-verified street facts (VERIFIED only by a named source — a dated site visit, a dated Street View / map imagery check, or operator confirmation; never inferred from POI density). UNVERIFIED is valid and publishable.</p><table><thead><tr><th>Candidate</th>${MICRO_FACTORS.map((f) => `<th>${esc(MICRO_FACTOR_LABELS[f])}</th>`).join("")}</tr></thead><tbody>${checklistRows}</tbody></table></div>
<div class="card"><h3>What this model cannot see</h3><p>The model sees POI density, walk-zone area, and drive times. It cannot see street-level factors — each row shows every candidate's verification status for that factor. Anything UNVERIFIED needs a foot check before deciding.</p><ul>${blindspot}</ul></div>
${(r.excluded ?? []).length > 0 ? `<div class="card"><h3>Excluded — insufficient data</h3><p>These candidates were <b>not scored</b> — listed here so nothing is silently dropped.</p><ul>${(r.excluded ?? []).map((x) => `<li><b>${esc(x.label)}</b> — ${esc(x.reason)} ${[...new Set(x.refs)].map((s) => `<a href="#T${s}">T${s}</a>`).join(" ")}</li>`).join("")}</ul></div>` : ""}
${(r.unconfirmed ?? []).length > 0 ? `<div class="card"><h3>Unconfirmed competitors — verify on foot</h3><p>These competitors were listed by Places but Place Details could not confirm them (closed, delisted, or absent from the index). They are <b>not counted</b> in any competitor total or score — verify on foot before treating the area as empty.</p><ul>${(r.unconfirmed ?? []).map((u) => `<li><b>${esc(u.name)}</b> — ${esc(u.category)} · ${u.lat}, ${u.lon} — ${esc(u.reason)} ${[...new Set(u.refs)].map((s) => `<a href="#T${s}">T${s}</a>`).join(" ")}</li>`).join("")}</ul></div>` : ""}
${(r.signals ?? []).length > 0 ? `<div class="card"><h3>Local signals (operator-reported)</h3><p>Human-observed or operator-reported facts the model cannot fetch. They are displayed evidence only — they never alter a score.</p><ul>${(r.signals ?? []).map((s) => `<li><b>${esc(SIGNAL_KIND_LABELS[s.kind])}</b> — ${esc(s.street)} — observed by ${esc(s.observedBy)} on ${esc(s.observedAt)}${s.note ? ` — ${esc(s.note)}` : ""}</li>`).join("")}</ul></div>` : ""}
<div class="card"><h3>Limitations</h3><ul>${r.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>
<div class="card"><h3>Evidence trace</h3><table><thead><tr><th>T</th><th>API</th><th>Request</th><th>Status</th><th>ms</th><th>Result</th></tr></thead><tbody>${trace}</tbody></table></div>
<footer>Powered by <a href="https://www.geoapify.com/">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors</footer>
</main></body></html>`;
}
