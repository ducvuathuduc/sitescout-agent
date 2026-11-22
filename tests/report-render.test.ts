/**
 * MCP report (src/report/render.ts) memo v2 tests — the HCMC-only MCP path
 * renders the same executive summary, checklist, blindspot section, expiry
 * notice and Visit sentence as the REST memo. The MCP path has no checklist
 * input, so missing checklists default to all-UNVERIFIED; the traffic band
 * is unavailable while no profile carries a trafficScale.
 */
import { describe, expect, it } from "vitest";
import { SITE_SELECTION_QUESTIONS } from "../src/playbooks/site-selection/questions.js";
import { DEFAULT_WEIGHTS } from "../src/scoring/model.js";
import { emptyChecklist, type MicroChecklist } from "../src/engine/checklist.js";
import { renderReport, type SiteReportData } from "../src/report/render.js";

const scores = {
  competition: 0.8,
  complementarity: 0.7,
  catchment: 0.6,
  accessibility: 0.9,
  cost: 0.5,
};

function fixtureData(): SiteReportData {
  const c1 = emptyChecklist();
  c1.walkability = { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" };
  c1.curbAppeal = { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" };
  c1.construction = { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" };
  c1.morningShade = { status: "VERIFIED", source: "Street View 2026-10-15", observedAt: "2026-10-15" };
  // 2 UNVERIFIED on #1 → "verify on foot before deciding".
  const checklists: Record<string, MicroChecklist> = { c1 };
  return {
    question: SITE_SELECTION_QUESTIONS[0],
    scored: [
      { candidateId: "c1", candidateLabel: "Xuân Thủy — Thảo Điền", scores, total: 0.72, weights: DEFAULT_WEIGHTS, evidenceRefs: [1, 2] },
      { candidateId: "c2", candidateLabel: "Thảo Điền — Nguyễn Văn Hưởng", scores, total: 0.61, weights: DEFAULT_WEIGHTS, evidenceRefs: [3, 4] },
      { candidateId: "c3", candidateLabel: "Thảo Điền — Quốc Hương", scores, total: 0.45, weights: DEFAULT_WEIGHTS, evidenceRefs: [5] },
    ],
    excluded: [],
    trace: [],
    weightsVersion: "2.0.0-unified",
    creditsReport: "0 credits",
    checklists,
    dataAsOf: "2026-11-22",
    expiresAt: "2026-12-22",
  };
}

describe("renderReport memo v2", () => {
  it("renders the executive summary, checklist, blindspot section, and expiry notice", () => {
    const md = renderReport(fixtureData());
    expect(md).toContain("What this model cannot see");
    expect(md).toContain("Data as of 2026-11-22");
    expect(md).toContain("valid until 2026-12-22");
    expect(md).toContain("verify on foot before deciding");
    expect(md).toContain("Visit the site before signing a lease.");
    expect(md).toContain("traffic projection unavailable — no bench data yet");
    expect(md).not.toMatch(/calibrated/i);
  });

  it("defaults missing checklists to all-UNVERIFIED", () => {
    const data = fixtureData();
    data.checklists = undefined;
    const md = renderReport(data);
    expect(md).toContain("UNVERIFIED");
    expect(md).not.toContain("VERIFIED —");
  });

  it("attributes the MCP walk zone to a circular buffer, never to Geoapify Isoline", () => {
    // The MCP path's catchments are transform_geometry buffers (the
    // Limitations section says so); the MCP server exposes no Isoline tool.
    const md = renderReport(fixtureData());
    expect(md).toContain("walk zone: circular buffer (no Isoline tool on the MCP server)");
    expect(md).not.toContain("walk zone: Geoapify Isoline");
  });
});
