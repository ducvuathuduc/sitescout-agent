#!/usr/bin/env node
/**
 * Measure what the demo proxy's edge cache saves: run the same live analysis
 * twice through the public proxy and record, per call, whether the Worker
 * answered from its cache (x-sitescout-cache: HIT) or asked Geoapify (MISS).
 *
 *   npm run build
 *   node scripts/measure-cache.mjs [out.json] ["question"]
 *
 * No Geoapify key is needed: the proxy holds it. The first run spends roughly
 * one live analysis of the shared demo budget; the second should spend almost
 * nothing. Credits per call are SiteScout's estimate (src/engine/geoapify.ts
 * estimateCredits), the same model the Worker uses (web/worker/budget.ts).
 */
import { writeFileSync } from "node:fs";
import { GeoapifyApi } from "../dist/engine/geoapify.js";
import { heuristicPlan } from "../dist/engine/plan.js";
import { runScout } from "../dist/engine/scout.js";

const PROXY = process.env.SITESCOUT_GEOAPIFY_BASE ?? "https://sitescout.huynhthanh.workers.dev/geo";
const [out = "cache-test.json", question = "Where should I open a specialty coffee shop in Thảo Điền?"] = process.argv.slice(2);

async function once(label) {
  const byUrl = new Map(); // request URL -> x-sitescout-cache of its latest response
  let fetches = 0;
  const fetchImpl = async (input, init) => {
    const res = await fetch(input, init);
    fetches++;
    byUrl.set(String(input), res.headers.get("x-sitescout-cache") ?? "-");
    return res;
  };
  const api = new GeoapifyApi({ baseUrl: PROXY, fetchImpl, creditCap: 400 });
  const t0 = Date.now();
  await runScout(question, heuristicPlan(question), { api });
  const ms = Date.now() - t0;
  const calls = api.calls.map((c) => ({ seq: c.seq, api: c.api, status: c.status, credits: c.credits, cache: byUrl.get(PROXY + c.endpoint) ?? "-" }));
  const hits = calls.filter((c) => c.cache === "HIT").length;
  const misses = calls.filter((c) => c.cache === "MISS").length;
  const credits = api.calls.reduce((a, c) => a + c.credits, 0);
  const missCredits = calls.filter((c) => c.cache === "MISS").reduce((a, c) => a + c.credits, 0);
  console.log(`${label}: ${api.calls.length} calls, ${fetches} HTTP requests, ${misses} MISS, ${hits} HIT, ${Math.round(ms / 1000)} s, estimated credits of all calls ${credits}, of MISS calls ${missCredits}`);
  return { label, ms, calls: api.calls.length, fetches, hits, misses, credits, missCredits, perCall: calls };
}

const before = await (await fetch(PROXY.replace(/\/geo$/, "/api/status"))).json();
const first = await once("run 1");
const second = await once("run 2");
const after = await (await fetch(PROXY.replace(/\/geo$/, "/api/status"))).json();
const result = { measuredAt: new Date().toISOString(), proxy: PROXY, question, statusBefore: before, statusAfter: after, runs: [first, second] };
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`proxy counter: credits ${before.credits} -> ${after.credits}${after.spent !== undefined ? `, spent ${before.spent} -> ${after.spent}` : ""}`);
console.log(`wrote ${out}`);
