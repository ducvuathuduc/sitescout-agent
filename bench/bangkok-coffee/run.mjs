#!/usr/bin/env node
/**
 * Bangkok coffee calibration bench — offline runner (no API calls).
 * Scores a recorded run against bench/bangkok-coffee/dataset.json and
 * writes bench/bangkok-coffee/RESULTS.md.
 *
 * Usage: node bench/bangkok-coffee/run.mjs [recorded-run.json]
 * Default recorded run: tests/fixtures/bangkok-coffee-run.json (synthetic).
 * Run from the repo root after `npm run build`.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runBench } from "../../dist/bench/bangkok.js";

const here = new URL(".", import.meta.url);
const datasetPath = fileURLToPath(new URL("dataset.json", here));
const runPath = process.argv[2] ?? "tests/fixtures/bangkok-coffee-run.json";
const resultsPath = fileURLToPath(new URL("RESULTS.md", here));

const m = runBench(datasetPath, runPath);
const sizeShortfall =
  m.nEntries < 30 || m.nClosed < 10
    ? `> **Gate open:** dataset has ${m.nEntries} entries (${m.nClosed} closed); minimum is 30 entries with 10 closed. Replace the EXAMPLE entries in \`dataset.json\` with real entries (see COLLECTION.md) — metrics below are computed on example data, not ground truth.`
    : null;

const lines = [
  "# Bangkok coffee bench — RESULTS",
  "",
  "Offline bench: a recorded run scored against `dataset.json`. No API calls.",
  "",
  `- Run date: ${m.runDate}`,
  `- Recorded run: \`${runPath}\``,
  `- Dataset entries: ${m.nEntries} (${m.nClosed} closed)`,
  `- Matched entries (candidate within 150 m): ${m.nMatched}`,
  `- Unmatched entry ids: ${m.unmatchedIds.length ? m.unmatchedIds.join(", ") : "none"}`,
  "",
  ...(sizeShortfall ? [sizeShortfall, ""] : []),
  "## Metrics",
  "",
  `- Rank correlation (Spearman, engine score vs. traffic tier): ${m.rankCorrelation.toFixed(3)}`,
  `- Top-3 hit rate (top-3 ranked that are high/medium tier): ${m.top3HitRate.toFixed(3)}`,
  `- Dud rate (top-3 that are closed or low tier): ${m.dudRate.toFixed(3)}`,
  "",
  "No pass threshold is set — the first run establishes the baseline, and",
  "the threshold is set from the baseline in review (spec §1/H1.2).",
  "",
];
const out = lines.join("\n");
writeFileSync(resultsPath, out);
process.stdout.write(out);
process.stdout.write(`Wrote ${resultsPath}\n`);
