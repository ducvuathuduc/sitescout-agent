#!/usr/bin/env node
/**
 * HCMC geocoding benchmark: 55 queries × 3 strategies against the live Geoapify APIs.
 *   A  /v1/geocode/search        (lang=vi, countrycode vn, biased to HCMC)
 *   B  /v1/geocode/autocomplete  (same)
 *   C  SiteScout resolvePlace()  (autocomplete-first chain, src/engine/scout.ts)
 * Usage: GEOAPIFY_API_KEY=… node bench/hcmc-addresses/run.mjs [from] [to]
 * Appends one JSON line per query to bench/hcmc-addresses/results.jsonl (~5 credits/query).
 * ONLY_SITESCOUT=1 → re-run strategy C only into results-sitescout-v1.1.jsonl (after a resolver change).
 */
import { readFileSync, appendFileSync } from "node:fs";
import { GeoapifyApi } from "../../dist/engine/geoapify.js";
import { resolvePlace } from "../../dist/engine/scout.js";
import { haversineM } from "../../dist/geo/grid.js";

const here = new URL(".", import.meta.url);
const { items } = JSON.parse(readFileSync(new URL("addresses.json", here), "utf8"));
const [from = 0, to = items.length] = process.argv.slice(2).map(Number);
const HCMC = [106.7009, 10.7769];
const OLD_WARD = /\b(Quận\s*\d+|Phường\s*\d+|Bến Nghé|Đa Kao|Võ Thị Sáu|Nguyễn Thái Bình|Phạm Ngũ Lão|Thảo Điền|An Phú|Thủ Thiêm|Quận Bình Thạnh|Quận Phú Nhuận|Quận Tân Bình|Thành phố Thủ Đức)\b/;

function judge(item, r) {
  if (!r) return { found: false };
  const d = haversineM({ lat: r.lat, lon: r.lon }, item.ref);
  const label = [r.formatted, r.suburb, r.district, r.city].filter(Boolean).join(" | ");
  return {
    found: true,
    formatted: r.formatted,
    resultType: r.result_type,
    confidence: r.rank?.confidence ?? null,
    suburb: r.suburb ?? null,
    district: r.district ?? null,
    city: r.city ?? null,
    distanceM: Math.round(d),
    withinTolerance: d <= item.toleranceM,
    cityMislabelledThuDuc: !item.inThuDucOld && /Thủ Đức/.test(`${r.city ?? ""} ${r.county ?? ""} ${r.formatted ?? ""}`),
    containsPre2025Name: OLD_WARD.test(label) && !item.inThuDucOld,
    expectedNewWardInLabel: item.expectedNewWard ? label.includes(item.expectedNewWard) : null,
  };
}

const pool = 3;
let i = from;
async function worker() {
  for (;;) {
    const idx = i++;
    if (idx >= Math.min(to, items.length)) return;
    const item = items[idx];
    const api = new GeoapifyApi({ apiKey: process.env.GEOAPIFY_API_KEY, baseUrl: process.env.SITESCOUT_GEOAPIFY_BASE, creditCap: 20 });
    const out = { id: item.id, group: item.group, query: item.query, toleranceM: item.toleranceM };
    const only = process.env.ONLY_SITESCOUT === "1";
    if (!only) try { out.search = judge(item, (await api.geocode(item.query, { lang: "vi", limit: 1, biasLonLat: HCMC })).results[0]); } catch (e) { out.search = { error: String(e.message) }; }
    if (!only) try { out.autocomplete = judge(item, (await api.autocomplete(item.query, { lang: "vi", limit: 1, biasLonLat: HCMC })).results[0]); } catch (e) { out.autocomplete = { error: String(e.message) }; }
    try { const { hit, via } = await resolvePlace(api, item.query); out.sitescout = { ...judge(item, hit), via: via ?? null }; } catch (e) { out.sitescout = { error: String(e.message) }; }
    out.credits = api.creditsSpent;
    out.ts = new Date().toISOString();
    appendFileSync(new URL(only ? "results-sitescout-v1.1.jsonl" : "results.jsonl", here), JSON.stringify(out) + "\n");
    process.stdout.write(`${item.id} c:${out.sitescout.withinTolerance ? "✓" : "✗"}\n`);
  }
}
await Promise.all(Array.from({ length: pool }, worker));
