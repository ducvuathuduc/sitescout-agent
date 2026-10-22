// Pre-record 5/10/15-min walking bands for the top-3 candidates of each recorded example,
// through the demo proxy (the key never leaves the Worker). ~3 credits per call, 9 calls.
// Usage: node web/scripts/bake-bands.mjs [https://sitescout.huynhthanh.workers.dev]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const base = process.argv[2] ?? "https://sitescout.huynhthanh.workers.dev";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of readdirSync(join(root, "examples"))) {
  const f = join(root, "examples", d, "result.json");
  if (!existsSync(f)) continue;
  const r = JSON.parse(readFileSync(f, "utf8"));
  let seq = Math.max(...r.calls.map((c) => c.seq)) + 1;
  const out = { mode: "walk", ranges: [300, 600, 900], generatedAt: new Date().toISOString(), candidates: {}, calls: [] };
  for (const c of [...r.candidates].sort((a, b) => a.rank - b.rank).slice(0, 3)) {
    const endpoint = `/v1/isoline?lat=${c.lat}&lon=${c.lon}&type=time&mode=walk&range=300,600,900`;
    let data;
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
      const res = await fetch(base + "/geo" + endpoint + (data?.properties?.id ? `&id=${data.properties.id}` : ""));
      data = await res.json();
      if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
      if (data.features?.length) break;
      await sleep(1000);
    }
    const feats = [...data.features].sort((a, b) => a.properties.range - b.properties.range).map((x) => ({ type: "Feature", properties: { range: x.properties.range }, geometry: x.geometry }));
    out.candidates[c.id] = { features: feats, ref: seq };
    out.calls.push({ seq, api: "isoline", method: "GET", endpoint, status: 200, durationMs: Date.now() - t0, summary: { mode: "walk", range: "300,600,900", bands: feats.length }, credits: 3, ts: new Date().toISOString() });
    seq++;
    console.log(d, c.id, feats.length, "bands");
  }
  writeFileSync(join(root, "examples", d, "bands.json"), JSON.stringify(out));
}
