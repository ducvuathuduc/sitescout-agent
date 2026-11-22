import { describe, expect, it } from "vitest";
import {
  applyChecklists,
  emptyChecklist,
  verdictFor,
  type MicroChecklist,
  type Verdict,
} from "../src/engine/checklist.js";
import { parseChecklistFile } from "../src/engine/checklist-file.js";

const allVerified = (): MicroChecklist => ({
  walkability: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  curbAppeal: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  construction: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  morningShade: { status: "VERIFIED", source: "Street View 2026-10-15", observedAt: "2026-10-15" },
  motorcycleParking: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
  alleyLighting: { status: "VERIFIED", source: "site visit", observedAt: "2026-11-20" },
});

/** Minimal run shape: applyChecklists only needs candidate ids + ranks. */
const resultWithIds = (ids: string[]) => ({
  candidates: ids.map(
    (id, i) => ({ id, rank: i + 1 }) as { id: string; rank: number; checklist?: MicroChecklist; verdict?: Verdict },
  ),
});

describe("verdictFor", () => {
  it("a top-3 candidate with 2+ UNVERIFIED factors cannot be recommended", () => {
    const c = allVerified();
    c.walkability.status = "UNVERIFIED";
    c.motorcycleParking.status = "UNVERIFIED";
    expect(verdictFor(c, 1)).toBe("verify on foot before deciding");
    expect(verdictFor(c, 4)).toBe("recommend");
  });

  it("a fully verified top-3 candidate is recommended", () => {
    expect(verdictFor(allVerified(), 1)).toBe("recommend");
    expect(verdictFor(allVerified(), 3)).toBe("recommend");
  });

  it("an empty checklist is all UNVERIFIED", () => {
    const c = emptyChecklist();
    expect(Object.values(c).every((f) => f.status === "UNVERIFIED")).toBe(true);
    expect(verdictFor(c, 1)).toBe("verify on foot before deciding");
  });
});

describe("parseChecklistFile / applyChecklists", () => {
  it("a malformed checklist file fails loudly", () => {
    expect(() => parseChecklistFile("tests/fixtures/bad-checklist.json")).toThrow(/checklist/i);
  });

  it("a checklist naming an unknown candidate id fails loudly", () => {
    expect(() => applyChecklists(resultWithIds(["c1"]), { c9: allVerified() })).toThrow(/c9/);
  });

  it("a checklist for a known candidate applies its verdict", () => {
    const r = resultWithIds(["c1"]);
    const c = allVerified();
    c.walkability.status = "UNVERIFIED";
    c.motorcycleParking.status = "UNVERIFIED";
    applyChecklists(r, { c1: c });
    expect(r.candidates[0].checklist).toEqual(c);
    expect(r.candidates[0].verdict).toBe("verify on foot before deciding");
  });
});
