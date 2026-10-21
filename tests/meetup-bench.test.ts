import { describe, expect, it } from "vitest";
import { rankVenues, scoreMeetupVenue, WEIGHTS_VERSION } from "../src/scoring/model.js";
import { scoreQuestion } from "../src/bench/score.js";

/**
 * Playbook-2 fairness scoring: the venue minimizes the WORST participant's
 * travel time (min-max). Pure, deterministic, no network.
 */
describe("scoreMeetupVenue", () => {
  it("prefers the venue with the smaller worst-case travel time", () => {
    const fair = scoreMeetupVenue({
      venueId: "a",
      venueLabel: "A",
      durationsS: [600, 700, 650],
      traceRefs: [3],
    });
    const unfair = scoreMeetupVenue({
      venueId: "b",
      venueLabel: "B",
      durationsS: [300, 300, 2400],
      traceRefs: [3],
    });
    expect(fair.score).toBeGreaterThan(unfair.score);
    expect(fair.maxDurationS).toBe(700);
  });

  it("is deterministic and exposes the weights version", () => {
    const ev = { venueId: "a", venueLabel: "A", durationsS: [600, 600], traceRefs: [] };
    expect(scoreMeetupVenue(ev)).toEqual(scoreMeetupVenue(ev));
    expect(WEIGHTS_VERSION).toMatch(/^\d+\.\d+\.\d+-/);
  });

  it("rankVenues orders fairest-first, ties by venueId", () => {
    const vs = [
      scoreMeetupVenue({ venueId: "b", venueLabel: "B", durationsS: [900, 900], traceRefs: [] }),
      scoreMeetupVenue({ venueId: "a", venueLabel: "A", durationsS: [600, 600], traceRefs: [] }),
    ];
    expect(rankVenues(vs).map((v) => v.venueId)).toEqual(["a", "b"]);
  });
});

/**
 * VN-GeoBench scorer: tool-sequence match + forbidden-tool check.
 */
describe("scoreQuestion", () => {
  const q = {
    id: "geobench-05",
    expectedTools: ["geocode_address", "search_places", "transform_geometry"],
    expectedBehaviors: ["manual check"],
  };

  it("passes when expected tools appear in order (extra tools OK)", () => {
    const trace = [
      { tool: "geocode_address" },
      { tool: "list_place_categories" },
      { tool: "search_places" },
      { tool: "transform_geometry" },
    ];
    const s = scoreQuestion(q, trace);
    expect(s.pass).toBe(true);
    expect(s.toolSequence.missing).toEqual([]);
  });

  it("fails on missing tools", () => {
    const s = scoreQuestion(q, [{ tool: "geocode_address" }]);
    expect(s.pass).toBe(false);
    expect(s.toolSequence.missing).toEqual(["search_places", "transform_geometry"]);
  });

  it("fails on hallucinated isoline/isochrone tools", () => {
    const s = scoreQuestion(q, [
      { tool: "geocode_address" },
      { tool: "search_places" },
      { tool: "transform_geometry" },
      { tool: "calculate_isochrone" },
    ]);
    expect(s.pass).toBe(false);
    expect(s.forbiddenTools).toContain("calculate_isochrone");
  });

  it("keeps behavior assertions as manual (never auto-fail)", () => {
    const s = scoreQuestion(q, [
      { tool: "geocode_address" },
      { tool: "search_places" },
      { tool: "transform_geometry" },
    ]);
    expect(s.manual).toEqual(["manual check"]);
  });
});
