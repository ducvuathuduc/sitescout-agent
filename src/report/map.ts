/**
 * Visual report renderer — standalone interactive HTML map (Leaflet + Geoapify tiles).
 *
 * `renderVisualReport()` emits ONE self-contained HTML file (no build step):
 *  - Leaflet via CDN, Geoapify raster tiles as basemap
 *    (https://maps.geoapify.com/v1/tile/{style}/{z}/{x}/{y}.png?apiKey=…)
 *  - Overlay layers in the SiteScout palette:
 *      catchment buffers (indigo), competitors (rose), complementary POIs (emerald),
 *      ranked shortlist (numbered amber badges)
 *  - Evidence-trace side panel: every [T#] chip scrolls to / highlights the trace entry
 *  - Attribution: "Powered by Geoapify" + © OpenStreetMap contributors, always visible
 *
 * API key handling: the renderer NEVER takes a real key. Committed examples
 * under examples/<playbook>/ always embed GEOAPIFY_TILE_KEY_PLACEHOLDER;
 * the key-swap step (replace the placeholder with your key) is documented in
 * README.md and docs/tutorial.md. This makes a key leak structurally impossible.
 */
export const GEOAPIFY_TILE_KEY_PLACEHOLDER = "GEOAPIFY_API_KEY_PLACEHOLDER";
export interface MapMarker {
  lat: number;
  lon: number;
  label: string;
  kind: "competitor" | "complementary" | "shortlist" | "origin" | "venue";
  /** For shortlist markers: rank number shown in the badge. */
  rank?: number;
  /** Trace seq numbers backing this marker's claim. */
  traceRefs?: number[];
}

export interface MapPolygon {
  /** GeoJSON Polygon/MultiPolygon geometry object. */
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  label: string;
  kind: "catchment" | "coverage" | "buffer-ring";
  traceRefs?: number[];
}

export interface TracePanelEntry {
  seq: number;
  tool: string;
  summary: string;
  durationMs: number;
  error?: string;
}

export interface ShortlistCard {
  rank: number;
  label: string;
  total: number;
  subscores: { competition: number; complementarity: number; catchment: number; accessibility: number };
  why: string;
  traceRefs: number[];
}

export interface VisualReportInput {
  title: string;
  question: string;
  generatedAt: string;
  tracePath: string;
  /** Center + zoom for the initial view. */
  view: { lat: number; lon: number; zoom: number };
  markers: MapMarker[];
  polygons: MapPolygon[];
  shortlist: ShortlistCard[];
  trace: TracePanelEntry[];
  limitations: string[];
}

const KIND_COLOR: Record<MapMarker["kind"], string> = {
  competitor: "#f43f5e",
  complementary: "#10b981",
  shortlist: "#f59e0b",
  origin: "#3b82f6",
  venue: "#8b5cf6",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderVisualReport(
  input: VisualReportInput,
  apiKey: string = GEOAPIFY_TILE_KEY_PLACEHOLDER,
): string {
  const data = JSON.stringify({
    markers: input.markers,
    polygons: input.polygons,
    shortlist: input.shortlist,
    trace: input.trace,
    kindColor: KIND_COLOR,
  }).replace(/</g, "\\u003c");

  const cards = input.shortlist
    .map((c) => {
      const chips = c.traceRefs.map((t) => `<button class="tchip" data-seq="${t}">T${t}</button>`).join(" ");
      const bars = (Object.entries(c.subscores) as Array<[string, number]>)
        .map(
          ([k, v]) =>
            `<div class="sub"><span>${k}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div><b>${v.toFixed(2)}</b></div>`,
        )
        .join("");
      return `<article class="card${c.rank === 1 ? " winner" : ""}">
        <div class="rank">${c.rank}</div>
        <div class="card-body"><h3>${esc(c.label)}</h3>
        <div class="total">Total <b>${c.total.toFixed(2)}</b></div>${bars}
        <p class="why">${esc(c.why)}</p><div class="chips">${chips}</div></div></article>`;
    })
    .join("\n");

  const traceRows = input.trace
    .map(
      (t) => `<div class="trow" id="t-${t.seq}"><code>T${t.seq}</code> <b>${esc(t.tool)}</b>
        <span>${esc(t.summary)}</span><em>${t.durationMs} ms${t.error ? " · ⚠ " + esc(t.error) : ""}</em></div>`,
    )
    .join("\n");

  const limitations = input.limitations.map((l) => `<li>${esc(l)}</li>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)} — SiteScout visual report</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
:root{--paper:#fff;--ink:#0b0d10;--ink2:#3d4450;--ink3:#8a93a3;--line:#e7eaf0;--wash:#f6f7f9;
--accent:#1f3a5f;--gold:#b8860b;--radius:12px;--gap:16px}
*{box-sizing:border-box}body{margin:0;font:15px/1.6 Inter,system-ui,sans-serif;color:var(--ink);background:var(--wash)}
header.hero{background:var(--accent);color:#fff;padding:28px 32px}
header.hero h1{margin:0 0 6px;font-size:26px;font-weight:700;letter-spacing:-.02em}
header.hero p{margin:0;opacity:.85;max-width:70ch}
main{display:grid;grid-template-columns:1fr 340px;gap:var(--gap);padding:var(--gap);max-width:1440px;margin:0 auto}
#map{height:520px;border-radius:var(--radius);border:1px solid var(--line);z-index:0}
section{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:20px;margin-top:var(--gap)}
h2{font-size:18px;letter-spacing:-.01em;margin:0 0 12px}
.card{display:flex;gap:14px;border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-bottom:12px;background:#fff}
.card.winner{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
.rank{flex:0 0 40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700}
.card.winner .rank{background:var(--gold)}
.card h3{margin:0 0 4px;font-size:16px}.total{font-size:13px;color:var(--ink2)}
.sub{display:grid;grid-template-columns:110px 1fr 40px;gap:8px;align-items:center;font-size:12px;color:var(--ink2);margin-top:4px}
.bar{background:var(--wash);border-radius:4px;height:8px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
.why{font-size:13px;color:var(--ink2)}.chips{margin-top:6px}
.tchip{font:600 11px "JetBrains Mono",monospace;border:1px solid var(--line);background:var(--wash);border-radius:6px;padding:2px 8px;cursor:pointer}
.tchip:hover{background:var(--accent);color:#fff}
aside.panel{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:16px;position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}
.trow{font-size:12px;padding:8px;border-bottom:1px solid var(--line)}.trow code{font-family:monospace;background:var(--wash);padding:1px 6px;border-radius:4px}
.trow em{display:block;color:var(--ink3);font-style:normal}.trow.hl{background:#fff8e1}
footer{padding:24px 32px;color:var(--ink3);font-size:12px}
ul.lim{margin:0;padding-left:18px;color:var(--ink2);font-size:13px}
@media print{aside.panel,header.hero .noprint{display:none}main{grid-template-columns:1fr}#map{height:420px}}
@media (max-width:900px){main{grid-template-columns:1fr}aside.panel{position:static;max-height:none}}
</style></head><body>
<header class="hero"><h1>${esc(input.title)}</h1><p>${esc(input.question)}</p>
<p style="font-size:12px;margin-top:8px">Generated ${esc(input.generatedAt)} · trace <code>${esc(input.tracePath)}</code> (${input.trace.length} tool calls)</p></header>
<main><div>
<div id="map"></div>
<section><h2>Ranked shortlist</h2>${cards || "<p>No candidates scored in this run.</p>"}</section>
<section><h2>Limitations — read before acting</h2><ul class="lim">${limitations}</ul></section>
</div>
<aside class="panel"><h2>Evidence trace</h2><p style="font-size:12px;color:var(--ink3)">Every claim cites a tool call. Click a <b>T#</b> chip to highlight its entry.</p>${traceRows}</aside>
</main>
<footer>Map data © OpenStreetMap contributors · Tiles by <a href="https://www.geoapify.com/">Geoapify</a> · SiteScout visual report</footer>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>const D=${data};
const map=L.map('map').setView([${input.view.lat},${input.view.lon}],${input.view.zoom});
L.tileLayer('https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}',{maxZoom:19,attribution:'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | © OpenStreetMap contributors'}).addTo(map);
D.polygons.forEach(p=>{L.geoJSON(p.geometry,{style:{color:'#6366f1',weight:2,fillOpacity:0.12}}).bindPopup('<b>'+p.label+'</b>').addTo(map);});
D.markers.forEach(m=>{const c=D.kindColor[m.kind]||'#666';
 const icon=L.divIcon({className:'',html:'<div style="background:'+c+';color:#fff;border-radius:50%;width:26px;height:26px;display:grid;place-items:center;font:700 12px Inter;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">'+(m.rank||'')+'</div>',iconSize:[26,26],iconAnchor:[13,13]});
 L.marker([m.lat,m.lon],{icon}).bindPopup('<b>'+m.label+'</b><br>'+m.kind).addTo(map);});
document.querySelectorAll('.tchip').forEach(b=>b.addEventListener('click',()=>{const el=document.getElementById('t-'+b.dataset.seq);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('hl');setTimeout(()=>el.classList.remove('hl'),1600);}}));
</script></body></html>`;
}
