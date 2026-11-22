// Build web/src/memos-index.json — the chain dashboard's committed input.
//
//   node scripts/build-memo-index.mjs
//
// Reads examples/*/result.json (memo id, market, business, top candidate,
// band) + bench/outcomes/outcomes.jsonl (decisions + actuals), derives
// each memo's pipeline status (spec §2.5), computes aggregate metering,
// and writes the index. Pure functions are exported so tests can import
// this file directly (same pattern as bench/hcmc-addresses/run.mjs).
//
// Statuses: delivered when a memo exists; decided when an outcome line
// exists for the memo with a decision; outcome-recorded when that outcome
// also carries actual traffic (mean or tier non-null). draft is a valid
// status but no v2 source produces it — see the index file's _note.
// Metering is aggregate counts only (memosGenerated, marketsUsed,
// outcomesRecorded); per-account metering is NOT built — v2 has no
// accounts or auth, so the index reserves accountId: null for later
// pricing work. No price is displayed anywhere.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Derive a memo's pipeline status from its outcome lines (spec §2.5). */
export function deriveStatus(outcomes) {
  if (outcomes.length === 0) return "delivered";
  const hasTraffic = outcomes.some(
    (o) => (o.actualDailyCustomersMean ?? null) !== null || (o.actualTrafficTier ?? null) !== null,
  );
  return hasTraffic ? "outcome-recorded" : "decided";
}

function latestOutcome(list) {
  return [...list]
    .sort((a, b) => String(a.observedAt ?? "").localeCompare(String(b.observedAt ?? "")))
    .at(-1);
}

/**
 * Build the index from memo descriptors + parsed outcome lines.
 * `memos` are `{ memoId, market, business, topCandidate, band }`;
 * `outcomes` are parsed outcome objects (see src/bench/outcomes.ts).
 * `calibration` is `[{ market, version, runDate }]` (optional).
 */
export function buildMemoIndex(memos, outcomes, calibration = []) {
  const byMemo = new Map();
  for (const o of outcomes) {
    const list = byMemo.get(o.memoId) ?? [];
    list.push(o);
    byMemo.set(o.memoId, list);
  }
  const rows = memos.map((m) => {
    const list = byMemo.get(m.memoId) ?? [];
    const outcome = list.length > 0 ? latestOutcome(list) : undefined;
    return {
      memoId: m.memoId,
      market: m.market,
      business: m.business,
      status: deriveStatus(list),
      topCandidate: m.topCandidate ?? null,
      band: m.band ?? null,
      ...(outcome ? { outcome } : {}),
    };
  });
  // Orphan outcomes: the memo is missing from examples/ — show them as
  // "unknown memo" rows, never silently drop them. The band comes from
  // the outcome's projectedLow/High (copied from the memo at record time).
  const known = new Set(memos.map((m) => m.memoId));
  for (const [memoId, list] of byMemo) {
    if (known.has(memoId)) continue;
    const outcome = latestOutcome(list);
    rows.push({
      memoId,
      market: "unknown",
      business: "unknown memo",
      status: deriveStatus(list),
      topCandidate: null,
      band: outcome ? { low: outcome.projectedLow, high: outcome.projectedHigh } : null,
      outcome,
    });
  }
  rows.sort((a, b) => a.memoId.localeCompare(b.memoId));
  const realOutcomes = outcomes.filter((o) => o._example !== true);
  return {
    generatedAt: new Date().toISOString(),
    memos: rows,
    metering: {
      memosGenerated: memos.length,
      marketsUsed: [...new Set(memos.map((m) => m.market))].sort(),
      outcomesRecorded: realOutcomes.length,
    },
    calibration,
    accountId: null,
    _note:
      "draft is a valid status but no v2 source produces it (a memo exists the moment it is generated, so every indexed memo is at least delivered); " +
      "accountId is always null in v2 — v2 has no accounts or auth, so there is no account key to meter by (reserved for later pricing work); " +
      "example outcomes (_example: true) are listed as rows when their memo is missing but excluded from metering.outcomesRecorded; " +
      "orphan outcomes (memo missing from examples/) are shown as 'unknown memo' rows, never silently dropped.",
  };
}

/** Read memo descriptors from each examples/<id>/result.json. */
export function loadMemoDescriptors(examplesDir) {
  const memos = [];
  for (const d of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const path = join(examplesDir, d.name, "result.json");
    if (!existsSync(path)) continue;
    const r = JSON.parse(readFileSync(path, "utf8"));
    const candidates = Array.isArray(r.candidates) ? r.candidates : [];
    const top = candidates
      .filter((c) => typeof c.rank === "number")
      .sort((a, b) => a.rank - b.rank)[0];
    memos.push({
      memoId: d.name,
      // Recorded runs predate market profiles (no profile field): all
      // recorded memos are HCMC (Thảo Điền, Bình Thạnh, District 1).
      market: r.profile?.id ?? "vn-hcmc",
      business: r.plan?.business ?? r.question ?? d.name,
      topCandidate: top?.label ?? null,
      band:
        top?.trafficBand && typeof top.trafficBand.low === "number"
          ? { low: top.trafficBand.low, high: top.trafficBand.high }
          : null,
    });
  }
  return memos.sort((a, b) => a.memoId.localeCompare(b.memoId));
}

/** Read + JSON-parse the outcomes file (empty array when absent). */
export function loadOutcomes(outcomesPath) {
  if (!existsSync(outcomesPath)) return [];
  return readFileSync(outcomesPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        throw new Error(`${outcomesPath} line ${i + 1}: invalid JSON (${e.message})`);
      }
    });
}

/**
 * Calibration status per market: the weights version from
 * src/scoring/model.ts and the bench run date from
 * bench/bangkok-coffee/RESULTS.md (null when a market has no bench run).
 */
export function loadCalibration(root) {
  let version = "unknown";
  try {
    const m = readFileSync(join(root, "src/scoring/model.ts"), "utf8").match(/WEIGHTS_VERSION = "([^"]+)"/);
    if (m) version = m[1];
  } catch {
    // keep "unknown"
  }
  let bangkokRunDate = null;
  try {
    const m = readFileSync(join(root, "bench/bangkok-coffee/RESULTS.md"), "utf8").match(
      /^- Run date: (\d{4}-\d{2}-\d{2})/m,
    );
    if (m) bangkokRunDate = m[1];
  } catch {
    // keep null
  }
  // Phase 1 gate: the bench dataset needs >= 30 entries with >= 10 closed.
  // Below that the bench ran on example data and the gate stays open.
  let bangkokEntries;
  let bangkokClosed;
  let bangkokGateOpen = false;
  try {
    const entries = JSON.parse(readFileSync(join(root, "bench/bangkok-coffee/dataset.json"), "utf8")).entries ?? [];
    bangkokEntries = entries.length;
    bangkokClosed = entries.filter((e) => e.status === "closed").length;
    bangkokGateOpen = bangkokEntries < 30 || bangkokClosed < 10;
  } catch {
    // keep undefined/false — no dataset, no gate claim
  }
  return [
    { market: "vn-hcmc", version, runDate: null, gateOpen: false },
    { market: "th-bangkok", version, runDate: bangkokRunDate, entries: bangkokEntries, closedEntries: bangkokClosed, gateOpen: bangkokGateOpen },
  ];
}

function main() {
  const memos = loadMemoDescriptors(join(ROOT, "examples"));
  const outcomes = loadOutcomes(join(ROOT, "bench/outcomes/outcomes.jsonl"));
  const calibration = loadCalibration(ROOT);
  const index = buildMemoIndex(memos, outcomes, calibration);
  const out = join(ROOT, "web/src/memos-index.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Memo index: ${memos.length} memos, ${outcomes.length} outcome line(s) → ${out}`);
}

// Only run when this file is the entry point — importing it (e.g. from
// tests) must not regenerate the index with the importer's cwd.
const invokedAsMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsMain) main();
