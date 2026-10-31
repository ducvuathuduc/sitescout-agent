/**
 * SiteScout live demo (browser). The SAME engine as the CLI (src/engine) runs
 * here; every Geoapify request goes through the Worker proxy (/geo/*), which
 * holds the key. The frame (left rail, floating map legend, right panel)
 * is inspired by CARTO Builder embeds; the design system is ours
 * (docs/design/DESIGN_SYSTEM.md).
 *
 * Information order: one primary action (the question) → summary of the best
 * spot → ranking → details on demand (score breakdown, compare, evidence).
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { GeoapifyApi, type CallRecord } from "../../src/engine/geoapify.js";
import { heuristicPlan, parseLlmPlan, PLANNER_SYSTEM_PROMPT, type PlanOutcome } from "../../src/engine/plan.js";
import { runScout, WEIGHTS, type ScoutResult, type CandidateResult, type Geometry } from "../../src/engine/scout.js";

/* ============================== constants ============================== */
const REPO = "https://github.com/ducvuathuduc/sitescout-agent";
const EXAMPLES = [
  { id: "thaodien-coffee", short: "Coffee · Thảo Điền", q: "Where should I open a specialty coffee shop in Thảo Điền?" },
  { id: "binhthanh-pharmacy", short: "Pharmacy · Bình Thạnh", q: "Where should I open a pharmacy in Bình Thạnh?" },
  { id: "saigon-lunch", short: "Lunch · District 1", q: "Where should I open an office-lunch restaurant in District 1?" },
];
type Mode = "walk" | "bicycle" | "motorcycle";
const MODES: Array<{ id: Mode; label: string }> = [
  { id: "walk", label: "Walk" },
  { id: "bicycle", label: "Bike" },
  { id: "motorcycle", label: "Motorbike" },
];
const BAND_MIN = [5, 10, 15];
const METRICS = [
  { k: "demand", label: "Demand", hint: "complementary places in the walk zone" },
  { k: "competition", label: "Competition", hint: "fewer direct competitors scores higher" },
  { k: "access", label: "Access", hint: "drive time from the city origins" },
  { k: "reach", label: "Reach", hint: "area covered by the walk zone" },
] as const;
type MetricKey = (typeof METRICS)[number]["k"];
/** Sequential score ramp (low → high); text colour chosen for ≥4.5:1 contrast. */
const RAMP = [
  { bg: "#C7DBFF", fg: "#0B1F44" },
  { bg: "#8DB5FA", fg: "#0B1F44" },
  { bg: "#4C8DF0", fg: "#0B1F44" },
  { bg: "#1F63D6", fg: "#FFFFFF" },
  { bg: "#0D3A8C", fg: "#FFFFFF" },
];
const STEPS = [
  { id: "plan", label: "Plan the analysis" },
  { id: "geocode", label: "Resolve the area" },
  { id: "boundaries", label: "Find the ward boundary" },
  { id: "places-area", label: "Sample places in the area" },
  { id: "candidates", label: "Generate candidate sites" },
  { id: "candidate", label: "Walk zones + places per site" },
  { id: "access", label: "Drive times from the city" },
  { id: "rank", label: "Score and rank" },
];

const I = {
  pin: (fill: string, dot: string) => `<svg width="20" height="22" viewBox="0 0 24 27" aria-hidden="true"><path d="M12 1C6.5 1 2 5.3 2 10.6 2 17.6 12 26 12 26s10-8.4 10-15.4C22 5.3 17.5 1 12 1z" fill="${fill}"/><circle cx="12" cy="10.5" r="3.6" fill="${dot}"/></svg>`,
  github: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 00-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 008 0z"/></svg>`,
  chevron: `<svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  down: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  minus: `<svg width="12" height="12" aria-hidden="true"><rect y="5.25" width="12" height="1.5" fill="currentColor"/></svg>`,
  plus: `<svg width="12" height="12" aria-hidden="true"><rect y="5.25" width="12" height="1.5" fill="currentColor"/><rect x="5.25" width="1.5" height="12" fill="currentColor"/></svg>`,
  fit: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/></svg>`,
  layers: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M7 1l6 3-6 3-6-3z"/><path d="M1 7l6 3 6-3M1 10l6 3 6-3"/></svg>`,
  play: `<svg width="10" height="11" viewBox="0 0 8 9" aria-hidden="true"><path d="M0 0l8 4.5L0 9z" fill="currentColor"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  share: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5.5 8.5l3-3M6 3.5l1.2-1.2a2.5 2.5 0 013.5 3.5L9.5 7M8 10.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L4.5 7"/></svg>`,
  pdf: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 1h5.5L11 3.5V13H3z"/><path d="M7 6v4.5M5 8.5L7 10.5 9 8.5"/></svg>`,
  plug: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 1v3M10 1v3M2.5 4h9v2.5a4.5 4.5 0 01-9 0zM7 11v2"/></svg>`,
  doc: `<svg width="14" height="14" viewBox="0 0 14 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 1h7l3 3v11H2z"/><path d="M5 7h5M5 10h5"/></svg>`,
  warn: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l7 12.5H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v4M8 11.6v.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  close: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};

/* ================================ state ================================ */
interface Bands { mode: Mode; features: Array<{ properties: { range: number }; geometry: Geometry }>; ref: number }
type Tab = "ranking" | "compare" | "evidence";
type Banner = { kind: "quota" | "error" | "info"; text: string } | null;
interface State {
  result: ScoutResult | null;
  source: { kind: "example"; id: string } | { kind: "live" } | { kind: "shared"; id: string } | null;
  calls: CallRecord[];
  bands: Map<string, Bands>;
  reachMode: Mode;
  reachLoading: boolean;
  selected: string | null;
  compare: string[];
  tab: Tab;
  layers: { zones: boolean; competitors: boolean; demand: boolean; hex: boolean };
  running: boolean;
  step: string;
  stepDetail: string;
  planner: "llm" | "heuristic";
  question: string;
  /** `spent` = API credits + map tiles × 0.25 (one budget); older Workers only sent `credits`. */
  status: { spent?: number; credits: number; creditCap: number; yourCalls: number; yourCap: number } | null;
  banner: Banner;
  openCall: number | null;
}
const S: State = {
  result: null, source: null, calls: [], bands: new Map(), reachMode: "walk", reachLoading: false, selected: null, compare: [], tab: "ranking",
  layers: { zones: true, competitors: true, demand: true, hex: false }, running: false, step: "", stepDetail: "", planner: "llm",
  question: EXAMPLES[0].q, status: null, banner: null, openCall: null,
};

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const catName = (c: string): string => c.split(".").pop()!.replace(/_/g, " ");
const pct = (x: number): string => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}`;

/* ================================ shell ================================ */
document.querySelector("#app")!.innerHTML = `
<a class="skip" href="#q">Skip to the question</a>
<nav class="rail" id="rail" aria-label="About">
  <div class="rail-logo">${I.pin("#fff", "#1570EF")}</div>
  <button class="rail-toggle" id="railToggle" aria-label="About SiteScout" aria-expanded="false">${I.chevron}</button>
  <div class="menu">
    <div class="menu-brand">${I.pin("#1570EF", "#fff")}<span>SiteScout</span></div>
    <p class="menu-eyebrow" id="menuTime">Live on Geoapify</p>
    <h2 class="menu-title">Where to open your shop in Ho Chi Minh City</h2>
    <p class="menu-desc">Ask a question. An agent plans the analysis, calls the Geoapify APIs live (walking isochrones, places, boundaries, drive times) and ranks 5–8 candidate sites. Every number links to the API call that produced it.</p>
    <div class="menu-links">
      <a class="btn btn-ghost" href="${REPO}" target="_blank" rel="noopener">${I.github} GitHub</a>
      <a class="btn btn-ghost" href="${REPO}/blob/main/docs/tutorial.md" target="_blank" rel="noopener">${I.doc} Tutorial</a>
      <button class="btn btn-ghost" data-open-mcp>${I.plug} Use from Claude / Cursor</button>
    </div>
    <p class="menu-foot">Built for the Geoapify Open Geospatial Program · data © OpenStreetMap contributors</p>
  </div>
  <a class="rail-foot" href="${REPO}" target="_blank" rel="noopener" aria-label="SiteScout on GitHub">${I.github}</a>
</nav>
<main class="stage">
  <div id="map" role="region" aria-label="Map of candidate sites"></div>
  <div class="map-ui">
    <section class="legend card" id="legend" aria-label="Map legend"></section>
    <div class="ctrls">
      <div class="ctrl-group"><button class="ctrl" id="zOut" aria-label="Zoom out">${I.minus}</button><button class="ctrl" id="zIn" aria-label="Zoom in">${I.plus}</button></div>
      <div class="ctrl-group"><button class="ctrl" id="zFit" aria-label="Fit all candidates">${I.fit}</button></div>
      <div class="attrib">Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>
    </div>
  </div>
</main>
<aside class="panel" id="panel" data-snap="half" aria-label="Analysis">
  <button class="sheet-handle" id="sheetHandle" aria-label="Resize panel"><span></span></button>
  <div class="panel-scroll" id="panelScroll">
    <header class="panel-head">
      <div class="brand">${I.pin("#1570EF", "#fff")}<span>SiteScout</span><span class="tag">HCMC</span></div>
      <div class="head-actions"><button class="icon-btn" data-open-mcp aria-label="Use from Claude or Cursor (MCP)" title="Use from Claude / Cursor (MCP)">${I.plug}</button><a class="icon-btn" href="${REPO}" target="_blank" rel="noopener" aria-label="GitHub">${I.github}</a></div>
    </header>
    <section id="ask" class="block"></section>
    <section id="state" class="block" aria-live="polite"></section>
    <section id="result"></section>
  </div>
</aside>
<div id="print" class="print-only"></div>
<dialog id="mcp" aria-labelledby="mcpTitle"></dialog>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

/* ================================= map ================================= */
const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([10.8035, 106.7375], 14);
let tileWarned = false;
let tileCheckedAt = 0;
L.tileLayer("/tiles/{z}/{x}/{y}{r}.png", { maxZoom: 18, minZoom: 10, tileSize: 256 })
  // The Worker answers 429 once the shared daily budget is used up (a tile costs 0.25 credit).
  // Tiles outside HCMC also "fail" (204), so check /api/status, at most once a minute.
  .on("tileerror", () => {
    if (tileWarned || Date.now() - tileCheckedAt < 60_000) return;
    tileCheckedAt = Date.now();
    fetch("/api/status").then((r) => r.json()).then((s: { spent?: number; creditCap?: number; tiles?: number; tileCap?: number }) => {
      const over = (s.spent !== undefined && s.creditCap !== undefined && s.spent >= s.creditCap) || (s.tiles !== undefined && s.tileCap !== undefined && s.tiles >= s.tileCap);
      if (over) { tileWarned = true; toast("Map tiles are paused: today's shared demo budget is used up. Recorded runs still work."); }
    }).catch(() => undefined);
  })
  .addTo(map);
const zonesLayer = L.layerGroup().addTo(map);
const hexLayer = L.layerGroup().addTo(map);
const poiLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const pins = new Map<string, L.Marker>();
const zones = new Map<string, L.GeoJSON>();
L.DomEvent.disableClickPropagation($(".map-ui"));
L.DomEvent.disableScrollPropagation($(".map-ui"));
$("#zIn").onclick = () => map.zoomIn();
$("#zOut").onclick = () => map.zoomOut();
$("#zFit").onclick = () => fit();

function rampIdx(c: CandidateResult, r: ScoutResult): number {
  const ts = r.candidates.map((x) => x.total);
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const u = hi - lo < 1e-9 ? 1 : (c.total - lo) / (hi - lo);
  return Math.min(4, Math.floor(u * 4.999));
}

function fit(pad = 48): void {
  const r = S.result;
  if (!r || !r.candidates.length) return;
  const b = L.latLngBounds(r.candidates.map((c) => [c.lat, c.lon] as [number, number]));
  for (const z of zones.values()) b.extend(z.getBounds());
  const wide = window.innerWidth >= 960;
  map.fitBounds(b, { paddingTopLeft: [wide ? 300 : pad, pad], paddingBottomRight: [pad, wide ? pad : Math.round(window.innerHeight * 0.45)] });
}

function drawMap(refit = false): void {
  const r = S.result;
  zonesLayer.clearLayers(); pinLayer.clearLayers(); poiLayer.clearLayers(); hexLayer.clearLayers();
  pins.clear(); zones.clear();
  if (!r) return;
  const focus = S.selected ?? r.candidates.find((c) => c.rank === 1)?.id ?? null;
  // walk zones: faint outlines for every candidate, bands (or a fill) for the focused one
  for (const c of [...r.candidates].sort((a, b) => b.rank - a.rank)) {
    if (!c.isoline) continue;
    const on = c.id === focus;
    const g = L.geoJSON({ type: "Feature", properties: {}, geometry: c.isoline } as GeoJSON.Feature, {
      style: { color: "#1F63D6", weight: on ? 1.5 : 1, opacity: on ? 0.9 : 0.45, fillColor: "#1F63D6", fillOpacity: on && !S.bands.get(c.id) ? 0.18 : 0.04, dashArray: on ? undefined : "3 3" },
    });
    g.on("click", () => select(c.id));
    zones.set(c.id, g);
    if (S.layers.zones) g.addTo(zonesLayer);
  }
  const bands = focus ? S.bands.get(focus) : undefined;
  if (bands && S.layers.zones) {
    const op = [0.3, 0.2, 0.12];
    [...bands.features].reverse().forEach((f, j) => {
      const i = bands.features.length - 1 - j;
      L.geoJSON({ type: "Feature", properties: {}, geometry: f.geometry } as GeoJSON.Feature, { interactive: false, style: { color: "#1F63D6", weight: 1, opacity: 0.55, fillColor: "#1F63D6", fillOpacity: op[i] ?? 0.1 } }).addTo(zonesLayer);
    });
  }
  // POIs (deduplicated): competitors = red diamonds, demand = teal dots
  const seen = new Set<string>();
  const pts: Array<CandidateResult["pois"][number]> = [];
  const sources = S.selected ? r.candidates.filter((c) => c.id === S.selected) : r.candidates;
  for (const c of sources) for (const p of c.pois) {
    const k = `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pts.push(p);
  }
  for (const p of pts) {
    if (p.kind === "competitor" ? !S.layers.competitors : !S.layers.demand) continue;
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: `<i class="poi poi-${p.kind}"></i>`, iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: false })
      .bindTooltip(`<b>${esc(p.name)}</b><br>${p.kind === "competitor" ? "Competitor" : "Demand"} · ${esc(catName(p.category))}`, { direction: "top", offset: [0, -6] })
      .addTo(poiLayer);
  }
  if (S.layers.hex) drawHex(r);
  // candidate pins, coloured by score
  for (const c of r.candidates) {
    const col = RAMP[rampIdx(c, r)];
    const sel = S.selected === c.id;
    const dim = S.selected !== null && !sel;
    const m = L.marker([c.lat, c.lon], {
      icon: L.divIcon({ className: "", html: `<div class="pin ${sel ? "sel" : ""} ${dim ? "dim" : ""}" style="background:${col.bg};color:${col.fg}" aria-label="Candidate ${c.rank}">${c.rank}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      riseOnHover: true, zIndexOffset: sel ? 1000 : 100 - c.rank, title: `#${c.rank} ${c.label}`,
    });
    m.on("click", () => select(c.id));
    m.on("mouseover", () => hover(c.id, true));
    m.on("mouseout", () => hover(c.id, false));
    m.addTo(pinLayer);
    pins.set(c.id, m);
  }
  if (refit) fit();
}

/** Hex density of competitors (red) vs demand (teal) from the POIs already fetched — no extra credits. */
function drawHex(r: ScoutResult): void {
  const sizeM = 120;
  const lat0 = r.area.anchor.lat;
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180), my = 110_540;
  const w = Math.sqrt(3) * sizeM, h = 1.5 * sizeM;
  const bins = new Map<string, { q: number; r: number; comp: number; dem: number }>();
  const seen = new Set<string>();
  for (const c of r.candidates) for (const p of c.pois) {
    const k = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const x = (p.lon - r.area.anchor.lon) * mx, y = (p.lat - lat0) * my;
    const rr = Math.round(y / h);
    const qq = Math.round((x - (rr & 1 ? w / 2 : 0)) / w);
    const key = `${qq},${rr}`;
    const b = bins.get(key) ?? { q: qq, r: rr, comp: 0, dem: 0 };
    if (p.kind === "competitor") b.comp++; else b.dem++;
    bins.set(key, b);
  }
  const max = Math.max(1, ...[...bins.values()].map((b) => b.comp + b.dem));
  for (const b of bins.values()) {
    const cx = b.q * w + (b.r & 1 ? w / 2 : 0), cy = b.r * h;
    const ring = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return [lat0 + (cy + sizeM * Math.sin(a)) / my, r.area.anchor.lon + (cx + sizeM * Math.cos(a)) / mx] as [number, number];
    });
    const share = b.comp / (b.comp + b.dem);
    const color = share >= 0.5 ? "#D93036" : "#0E9384";
    L.polygon(ring, { color, weight: 0.5, opacity: 0.6, fillColor: color, fillOpacity: 0.12 + 0.5 * ((b.comp + b.dem) / max), interactive: true })
      .bindTooltip(`${b.comp} competitor${b.comp === 1 ? "" : "s"} · ${b.dem} demand`, { sticky: true })
      .addTo(hexLayer);
  }
}

function hover(id: string, on: boolean): void {
  document.querySelectorAll(`[data-row="${id}"]`).forEach((el) => el.classList.toggle("hover", on));
  pins.get(id)?.getElement()?.firstElementChild?.classList.toggle("hover", on);
  const z = zones.get(id);
  if (z && S.selected !== id) z.setStyle({ opacity: on ? 0.9 : 0.45, weight: on ? 2 : 1 });
}

/* =============================== legend ================================ */
function renderLegend(): void {
  const r = S.result;
  const title = r ? `${cap(r.plan.business)} · ${r.area.ward?.name && r.area.ward.name !== "unknown ward" ? r.area.ward.name : r.plan.area.split(",")[0]}` : "SiteScout";
  const focus = r ? S.selected ?? r.candidates.find((c) => c.rank === 1)?.id : undefined;
  const bands = focus ? S.bands.get(focus) : undefined;
  const modeLbl = (m: Mode): string => MODES.find((x) => x.id === m)!.label.toLowerCase();
  const zoneRow = bands
    ? `<div class="lg-bands">${BAND_MIN.map((m, i) => `<span><i style="opacity:${[1, 0.66, 0.4][i]}"></i>${m}′</span>`).join("")}<em>${modeLbl(bands.mode)} time from #${r!.candidates.find((c) => c.id === focus)!.rank}</em></div>`
    : `<div class="lg-row"><i class="sw sw-zone"></i>${r ? r.plan.walkMinutes : 10}-min walk zone</div>`;
  const sw = (on: boolean, k: keyof State["layers"], label: string, icon: string): string =>
    `<label class="lg-toggle"><input type="checkbox" data-layer="${k}" ${on ? "checked" : ""}>${icon}<span>${label}</span></label>`;
  $("#legend").innerHTML = `
    <div class="lg-title" title="${esc(title)}">${esc(title)}</div>
    ${r ? `<div class="lg-sub">${S.running ? "Running live…" : S.source?.kind === "live" ? `Live run · ${r.calls.length} Geoapify calls` : S.source?.kind === "shared" ? "Shared run" : `Recorded run · ${r.generatedAt.slice(0, 10)}`}</div>` : ""}
    <div class="lg-sec"><div class="lg-k">Candidates · score</div><div class="lg-ramp">${RAMP.map((c) => `<i style="background:${c.bg}"></i>`).join("")}</div><div class="lg-ends"><span>lower</span><span>higher</span></div></div>
    <div class="lg-sec">${zoneRow}</div>
    <div class="lg-sec lg-layers">
      ${sw(S.layers.zones, "zones", "Walk zones", `<i class="sw sw-zone"></i>`)}
      ${sw(S.layers.competitors, "competitors", r ? `Competitors · ${esc(catName(r.plan.competitorCategory))}` : "Competitors", `<i class="poi poi-competitor"></i>`)}
      ${sw(S.layers.demand, "demand", "Demand places", `<i class="poi poi-demand"></i>`)}
      ${sw(S.layers.hex, "hex", "Density hexagons", `<i class="sw sw-hex"></i>`)}
    </div>`;
  document.querySelectorAll<HTMLInputElement>("[data-layer]").forEach((el) => (el.onchange = () => {
    S.layers[el.dataset.layer as keyof State["layers"]] = el.checked;
    drawMap();
  }));
}

/* ================================= ask ================================= */
function renderAsk(): void {
  const st = S.status;
  const used = st ? (st.spent ?? st.credits) : 0;
  const left = st ? Math.max(0, Math.floor(st.creditCap - used)) : null;
  $("#ask").innerHTML = `
    <label class="h1" for="q">Where should you open your shop?</label>
    <p class="muted">Name a business and an area in Ho Chi Minh City — English or Vietnamese.</p>
    <div class="ask-box ${S.running ? "busy" : ""}">
      <textarea id="q" rows="2" maxlength="200" ${S.running ? "disabled" : ""} placeholder="e.g. Mở tiệm bánh mì ở Quận 3">${esc(S.question)}</textarea>
      <div class="ask-row">
        <div class="seg" role="radiogroup" aria-label="Planner">
          <button role="radio" aria-checked="${S.planner === "llm"}" data-planner="llm" title="An LLM on Workers AI writes the plan; zod validates it">AI plan</button>
          <button role="radio" aria-checked="${S.planner === "heuristic"}" data-planner="heuristic" title="Deterministic keyword rules">Rules</button>
        </div>
        <button class="btn btn-primary" id="run" ${S.running ? "disabled" : ""}>${S.running ? `<span class="spin" aria-hidden="true"></span> Analyzing…` : `${I.play} Analyze`}</button>
      </div>
    </div>
    <div class="examples"><span class="muted xs">Recorded examples · instant, no credits</span>
      <div class="chips">${EXAMPLES.map((e) => `<button class="chip ${S.source?.kind === "example" && S.source.id === e.id ? "on" : ""}" data-ex="${e.id}" ${S.running ? "disabled" : ""}>${esc(e.short)}</button>`).join("")}</div>
    </div>
    ${st ? `<div class="quota" title="Shared daily Geoapify budget for this demo: live API calls plus map tiles (4 tiles = 1 credit)"><div class="quota-bar"><i style="width:${pct(used / st.creditCap)}%"></i></div><span>${left} of ${st.creditCap} live credits left today · a live run uses ~85–140</span></div>` : ""}`;
  document.querySelectorAll<HTMLButtonElement>("[data-planner]").forEach((b) => (b.onclick = () => { S.planner = b.dataset.planner as State["planner"]; renderAsk(); }));
  const q = $<HTMLTextAreaElement>("#q");
  q.oninput = () => { S.question = q.value; };
  q.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void run(); } };
  document.querySelectorAll<HTMLButtonElement>("[data-ex]").forEach((b) => (b.onclick = () => {
    const ex = EXAMPLES.find((x) => x.id === b.dataset.ex)!;
    S.question = ex.q;
    void loadExample(ex.id);
  }));
  $("#run").onclick = () => void run();
}

/* ======================== progress / banners ========================== */
function renderState(): void {
  const el = $("#state");
  if (S.running) {
    const idx = STEPS.findIndex((s) => s.id === S.step);
    const credits = S.calls.reduce((a, c) => a + c.credits, 0);
    el.innerHTML = `<div class="card progress">
      <div class="progress-head"><span class="h3">Agent plan</span><span class="muted xs">${S.calls.length} calls · ~${credits} credits</span></div>
      <ol class="steps">${STEPS.map((s, i) => {
        const st = i < idx ? "done" : i === idx ? "active" : "todo";
        return `<li class="step ${st}"><span class="dot">${st === "done" ? I.check : st === "active" ? `<span class="spin"></span>` : ""}</span><span>${s.label}${st === "active" && S.stepDetail ? ` <em>${esc(S.stepDetail)}</em>` : ""}</span></li>`;
      }).join("")}</ol>
      ${S.calls.length ? `<div class="last-call mono xs">T${S.calls[S.calls.length - 1].seq} · ${esc(S.calls[S.calls.length - 1].api)} · ${S.calls[S.calls.length - 1].durationMs} ms</div>` : ""}
    </div>`;
    return;
  }
  const b = S.banner;
  if (b) {
    el.innerHTML = `<div class="banner banner-${b.kind}" role="${b.kind === "info" ? "status" : "alert"}">${I.warn}<div><strong>${b.kind === "quota" ? "Live quota used up" : b.kind === "error" ? "The live run stopped" : "Note"}</strong><p>${esc(b.text)}</p>
      ${b.kind === "error" ? `<div class="banner-actions"><button class="btn btn-sm" id="retry">Retry</button><button class="btn btn-sm btn-ghost" id="retryRules">Retry with rules planner</button></div>` : ""}</div>
      <button class="icon-btn" id="bannerClose" aria-label="Dismiss">${I.close}</button></div>`;
    $("#bannerClose").onclick = () => { S.banner = null; renderState(); };
    const rt = document.querySelector<HTMLButtonElement>("#retry");
    if (rt) rt.onclick = () => void run();
    const rr = document.querySelector<HTMLButtonElement>("#retryRules");
    if (rr) rr.onclick = () => { S.planner = "heuristic"; renderAsk(); void run(); };
    return;
  }
  el.innerHTML = "";
}

/* =============================== result ================================ */
const callBySeq = (seq: number): CallRecord | undefined => S.calls.find((c) => c.seq === seq);
const refBtn = (seq: number | undefined): string => (seq === undefined ? "" : `<button class="ref" data-call="${seq}" title="${esc(callBySeq(seq)?.api ?? "Geoapify call")}">T${seq}</button>`);
const refsOf = (c: CandidateResult, api: string): number[] => c.refs.filter((s) => callBySeq(s)?.api === api);
function rankOf(r: ScoutResult, c: CandidateResult, k: MetricKey): number {
  return [...r.candidates].sort((a, b) => b.scores[k] - a.scores[k]).findIndex((x) => x.id === c.id) + 1;
}
const matrixRef = (r: ScoutResult): number | undefined => r.calls.find((x) => x.api === "route-matrix")?.seq;

/** "Why this spot": one evidence-linked sentence per scoring factor. */
function explain(r: ScoutResult, c: CandidateResult): Array<{ k: MetricKey; text: string; refs: number[] }> {
  const n = r.candidates.length;
  const topDem = Object.entries(c.demand).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${catName(k)}`).join(", ") || "none found";
  const drive = r.origins.map((o, i) => (o.lat !== undefined ? `${o.query.split(",")[0]} ${c.driveMinByOrigin[i] !== null && c.driveMinByOrigin[i] !== undefined ? Math.round(c.driveMinByOrigin[i] as number) + "′" : "n/a"}` : "")).filter(Boolean).join(", ");
  return [
    { k: "demand", text: `${c.demandTotal} demand places inside the ${r.plan.walkMinutes}-min walk zone (${topDem}) — #${rankOf(r, c, "demand")} of ${n}.`, refs: refsOf(c, "places") },
    { k: "competition", text: `${c.competitors} direct competitor${c.competitors === 1 ? "" : "s"} (${catName(r.plan.competitorCategory)}) in the same zone — #${rankOf(r, c, "competition")} of ${n} for low competition.`, refs: refsOf(c, "places") },
    { k: "access", text: c.meanDriveMin !== null ? `${Math.round(c.meanDriveMin)} min average drive (${drive}) — #${rankOf(r, c, "access")} of ${n}.` : "Drive times unavailable; scored neutral.", refs: [matrixRef(r)].filter((x): x is number => x !== undefined) },
    { k: "reach", text: `The walk zone covers ${(c.isolineAreaM2 / 1e6).toFixed(2)} km² — #${rankOf(r, c, "reach")} of ${n}.`, refs: refsOf(c, "isoline") },
  ];
}

function bars(c: CandidateResult): string {
  return `<div class="bd">${METRICS.map((m) => `<div class="bd-row" title="${esc(m.hint)}"><span class="bd-k">${m.label}<em>${Math.round(WEIGHTS[m.k] * 100)}%</em></span><span class="bd-track"><i class="bd-${m.k}" style="width:${pct(c.scores[m.k])}%"></i></span><span class="bd-v">${c.scores[m.k].toFixed(2)}</span></div>`).join("")}</div>`;
}

function renderResult(): void {
  const el = $("#result");
  const r = S.result;
  if (!r) {
    el.innerHTML = S.running ? "" : `<div class="block empty"><div class="empty-art">${I.pin("#C7DBFF", "#1570EF")}</div><p class="h3">No analysis yet</p><p class="muted">Pick a recorded example or ask your own question to rank candidate sites.</p></div>`;
    return;
  }
  const best = [...r.candidates].sort((a, b) => a.rank - b.rank)[0];
  const col = RAMP[rampIdx(best, r)];
  const tabs: Array<[Tab, string]> = [["ranking", "Ranking"], ["compare", "Compare"], ["evidence", `Evidence · ${S.calls.length}`]];
  el.innerHTML = `
  <section class="block summary">
    <div class="eyebrow">Best spot for a ${esc(r.plan.business)}</div>
    <button class="best" data-select="${best.id}" data-row="${best.id}">
      <span class="badge badge-lg" style="background:${col.bg};color:${col.fg}">1</span>
      <span class="best-main"><span class="best-label">${esc(best.label)}</span><span class="muted xs">${esc(r.area.ward?.name ?? r.plan.area)}</span></span>
      <span class="score"><b>${best.total.toFixed(2)}</b><span class="xs muted">score</span></span>
    </button>
    <div class="kpis">
      <div class="kpi"><b>${best.demandTotal}</b><span>demand places</span></div>
      <div class="kpi"><b>${best.competitors}</b><span>competitors</span></div>
      <div class="kpi"><b>${best.meanDriveMin !== null ? Math.round(best.meanDriveMin) + "′" : "n/a"}</b><span>avg drive</span></div>
      <div class="kpi"><b>${(best.isolineAreaM2 / 1e6).toFixed(2)}</b><span>km² walk zone</span></div>
    </div>
    <details class="plan"><summary>How the agent planned this ${I.down}</summary>
      <dl>
        <dt>Area</dt><dd>${esc(r.plan.area)}</dd>
        <dt>Planner</dt><dd>${r.planner === "llm" ? `AI · ${esc((r.plannerModel ?? "").split("/").pop())}` : "Rules"}</dd>
        <dt>Competitors</dt><dd><code>${esc(r.plan.competitorCategory)}</code></dd>
        <dt>Demand</dt><dd>${r.plan.demandCategories.map((d) => `<code>${esc(d)}</code>`).join(" ")}</dd>
        <dt>Walk zone</dt><dd>${r.plan.walkMinutes} min · ${r.candidates.length} candidates</dd>
        <dt>Origins</dt><dd>${r.plan.origins.map((o) => esc(o.split(",")[0])).join(" · ")}</dd>
        ${r.planNotes.length ? `<dt>Notes</dt><dd>${esc(r.planNotes.join("; "))}</dd>` : ""}
      </dl>
    </details>
    <div class="actions">
      <button class="btn btn-sm" id="share">${I.share} Share link</button>
      <button class="btn btn-sm" id="pdf">${I.pdf} Export PDF</button>
    </div>
  </section>
  <div class="tabs" role="tablist" aria-label="Result views">${tabs.map(([t, l]) => `<button role="tab" id="tab-${t}" aria-selected="${S.tab === t}" aria-controls="pane" tabindex="${S.tab === t ? 0 : -1}" data-tab="${t}">${l}</button>`).join("")}</div>
  <section class="block pane" id="pane" role="tabpanel" aria-labelledby="tab-${S.tab}">${S.tab === "ranking" ? rankingHtml(r) : S.tab === "compare" ? compareHtml(r) : evidenceHtml()}</section>
  ${r.limitations.length ? `<details class="block limits"><summary>Limitations (${r.limitations.length}) ${I.down}</summary><ul>${r.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>` : ""}`;
  wireResult();
}

function rankingHtml(r: ScoutResult): string {
  const max = Math.max(...r.candidates.map((c) => c.total), 0.01);
  return `<p class="muted xs pane-hint">Select a site for its score breakdown and evidence. Tick up to 3 to compare.</p>
  <ul class="rank">${[...r.candidates].sort((a, b) => a.rank - b.rank).map((c) => {
    const col = RAMP[rampIdx(c, r)];
    const open = S.selected === c.id;
    const cmp = S.compare.includes(c.id);
    return `<li class="rank-item ${open ? "open" : ""}" data-row="${c.id}">
      <div class="rank-row">
        <button class="rank-btn" data-select="${c.id}" aria-expanded="${open}">
          <span class="badge" style="background:${col.bg};color:${col.fg}">${c.rank}</span>
          <span class="rank-main"><span class="rank-label">${esc(c.label)}</span><span class="rank-bar"><i style="width:${((c.total / max) * 100).toFixed(1)}%;background:${col.bg}"></i></span></span>
          <span class="rank-score">${c.total.toFixed(2)}</span>
        </button>
        <label class="cmp" title="Compare"><input type="checkbox" data-cmp="${c.id}" ${cmp ? "checked" : ""} ${!cmp && S.compare.length >= 3 ? "disabled" : ""}><span class="sr">Compare #${c.rank}</span></label>
      </div>
      ${open ? detailHtml(r, c) : ""}
    </li>`;
  }).join("")}</ul>`;
}

function detailHtml(r: ScoutResult, c: CandidateResult): string {
  const b = S.bands.get(c.id);
  return `<div class="detail">
    ${bars(c)}
    <div class="h4">Why this spot</div>
    <ul class="why">${explain(r, c).map((e) => `<li><span class="why-k bd-${e.k}"></span><span>${esc(e.text)} ${e.refs.map(refBtn).join("")}</span></li>`).join("")}</ul>
    <div class="h4">Reach explorer <span class="muted xs">5 · 10 · 15 min bands</span></div>
    <div class="reach">
      <div class="seg" role="radiogroup" aria-label="Travel mode">${MODES.map((m) => `<button role="radio" aria-checked="${S.reachMode === m.id}" data-mode="${m.id}">${m.label}</button>`).join("")}</div>
      <button class="btn btn-sm" id="reachGo" ${S.reachLoading ? "disabled" : ""}>${S.reachLoading ? `<span class="spin"></span> Loading` : b && b.mode === S.reachMode ? "Shown on map" : "Show bands"}</button>
    </div>
    <p class="muted xs">${b ? `Showing ${MODES.find((m) => m.id === b.mode)!.label.toLowerCase()} bands ${refBtn(b.ref)}.` : ""} One Geoapify Isoline call with three ranges (counted as 6 credits: 1 per 5 minutes of each band); cached at the edge.</p>
  </div>`;
}

function compareHtml(r: ScoutResult): string {
  const ids = S.compare.length >= 2 ? S.compare : [...r.candidates].sort((a, b) => a.rank - b.rank).slice(0, 3).map((c) => c.id);
  const cs = ids.map((id) => r.candidates.find((c) => c.id === id)!).filter(Boolean).sort((a, b) => a.rank - b.rank);
  const row = (label: string, vals: number[], fmt: (v: number) => string, higher = true, barMax?: number): string => {
    const best = higher ? Math.max(...vals) : Math.min(...vals);
    const mx = barMax ?? Math.max(...vals, 1e-9);
    return `<tr><th scope="row">${label}</th>${vals.map((v) => `<td class="${v === best ? "win" : ""}"><span class="cv">${fmt(v)}</span><span class="cbar"><i style="width:${pct(v / mx)}%"></i></span></td>`).join("")}</tr>`;
  };
  const [a, b] = cs;
  const deltas = a && b ? METRICS.map((m) => ({ m, d: (a.scores[m.k] - b.scores[m.k]) * WEIGHTS[m.k] })).sort((x, y) => y.d - x.d) : [];
  const lead = deltas.filter((x) => x.d > 0.005).slice(0, 2).map((x) => x.m.label.toLowerCase());
  const lag = deltas.filter((x) => x.d < -0.005).map((x) => x.m.label.toLowerCase());
  return `<p class="muted xs pane-hint">${S.compare.length >= 2 ? "Your selection." : "Top 3 by default — tick sites in Ranking to change."} Best value per row is highlighted.</p>
  <div class="table-wrap"><table class="cmp-table">
    <thead><tr><th></th>${cs.map((c) => { const col = RAMP[rampIdx(c, r)]; return `<th scope="col"><button class="th-btn" data-select="${c.id}" data-row="${c.id}"><span class="badge" style="background:${col.bg};color:${col.fg}">${c.rank}</span><span class="th-label">${esc(c.label)}</span></button></th>`; }).join("")}</tr></thead>
    <tbody>
      ${row("Total score", cs.map((c) => c.total), (v) => v.toFixed(2), true, 1)}
      ${METRICS.map((m) => row(`${m.label} <em>${Math.round(WEIGHTS[m.k] * 100)}%</em>`, cs.map((c) => c.scores[m.k]), (v) => v.toFixed(2), true, 1)).join("")}
      ${row("Demand places", cs.map((c) => c.demandTotal), (v) => String(v))}
      ${row("Competitors", cs.map((c) => c.competitors), (v) => String(v), false)}
      ${row("Avg drive (min)", cs.map((c) => c.meanDriveMin ?? 0), (v) => (v ? String(Math.round(v)) : "n/a"), false)}
      ${row("Walk zone (km²)", cs.map((c) => c.isolineAreaM2 / 1e6), (v) => v.toFixed(2))}
    </tbody></table></div>
  ${a && b ? `<div class="callout"><b>Why #${a.rank} beats #${b.rank}:</b> ${lead.length ? `stronger ${lead.join(" and ")}` : "a small edge across factors"}${lag.length ? `, despite weaker ${lag.join(", ")}` : ""} — ${a.total.toFixed(2)} vs ${b.total.toFixed(2)}. ${[...new Set([...refsOf(a, "places").slice(0, 1), ...refsOf(b, "places").slice(0, 1), matrixRef(r)])].filter((x): x is number => x !== undefined).map(refBtn).join("")}</div>` : ""}`;
}

function summ(c: CallRecord): string {
  const s = c.summary as Record<string, unknown>;
  if (c.error) return c.error.slice(0, 40);
  if (s.count !== undefined) return `${s.count} results · ${String(s.categories ?? "").split(",")[0]}`;
  if (s.levels) return String(s.levels).split(" ⊂ ")[1] ?? String(s.levels);
  if (s.top) return String(s.top).split(",")[0];
  if (s.bands !== undefined) return `${s.mode} bands ${s.range}`;
  if (s.mode) return `${s.mode} ${Number(s.range) / 60} min`;
  if (s.cells !== undefined) return `${s.sources}×${s.targets} matrix`;
  if (s.timeS !== undefined) return `${Math.round(Number(s.timeS) / 60)} min route`;
  if (s.features) return String(s.features);
  return "";
}

function evidenceHtml(): string {
  const calls = S.calls;
  const credits = calls.reduce((a, c) => a + c.credits, 0);
  const max = Math.max(...calls.map((c) => c.durationMs), 1);
  return `<p class="muted xs pane-hint">${calls.length} Geoapify calls · ~${credits} credits. Every [Tn] in the analysis points here. Keys are never shown — requests go through the demo proxy.</p>
  <ul class="calls">${calls.map((c) => `<li id="call-${c.seq}" class="call ${S.openCall === c.seq ? "open" : ""}">
    <button class="call-btn" data-open-call="${c.seq}" aria-expanded="${S.openCall === c.seq}">
      <span class="call-id mono">T${c.seq}</span><span class="call-api">${esc(c.api)}</span><span class="call-sum">${esc(summ(c))}</span><span class="call-ms mono">${c.durationMs} ms</span>
      <span class="call-bar"><i style="width:${((c.durationMs / max) * 100).toFixed(1)}%"></i></span>
    </button>
    ${S.openCall === c.seq ? `<div class="call-detail mono xs"><div><b>${esc(c.method)}</b> ${esc(c.endpoint)}</div><div>status ${c.status} · ${c.credits} credit${c.credits === 1 ? "" : "s"}${c.error ? ` · ${esc(c.error)}` : ""}</div></div>` : ""}
  </li>`).join("")}</ul>`;
}

function wireResult(): void {
  document.querySelectorAll<HTMLButtonElement>("#result [data-select]").forEach((b) => (b.onclick = () => select(b.dataset.select!)));
  document.querySelectorAll<HTMLElement>("#result [data-row]").forEach((el) => {
    el.onmouseenter = () => hover(el.dataset.row!, true);
    el.onmouseleave = () => hover(el.dataset.row!, false);
  });
  document.querySelectorAll<HTMLInputElement>("[data-cmp]").forEach((el) => (el.onchange = () => {
    const id = el.dataset.cmp!;
    S.compare = el.checked ? [...S.compare, id].slice(0, 3) : S.compare.filter((x) => x !== id);
    renderResult();
  }));
  const tabsEl = document.querySelectorAll<HTMLButtonElement>("[data-tab]");
  tabsEl.forEach((b, i) => {
    b.onclick = () => setTab(b.dataset.tab as Tab);
    b.onkeydown = (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = tabsEl[(i + (e.key === "ArrowRight" ? 1 : tabsEl.length - 1)) % tabsEl.length];
      setTab(n.dataset.tab as Tab);
      document.querySelector<HTMLButtonElement>(`[data-tab="${n.dataset.tab}"]`)?.focus();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-open-call]").forEach((b) => (b.onclick = () => {
    const s = Number(b.dataset.openCall);
    S.openCall = S.openCall === s ? null : s;
    renderResult();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => (b.onclick = () => { S.reachMode = b.dataset.mode as Mode; renderResult(); }));
  const rg = document.querySelector<HTMLButtonElement>("#reachGo");
  if (rg) rg.onclick = () => void loadBands();
  const sh = document.querySelector<HTMLButtonElement>("#share");
  if (sh) sh.onclick = () => void shareLink();
  const pdf = document.querySelector<HTMLButtonElement>("#pdf");
  if (pdf) pdf.onclick = () => exportPdf();
}

function setTab(t: Tab): void {
  S.tab = t;
  renderResult();
  updateHash();
}

/** Evidence chips anywhere ([Tn]) open the Evidence tab at that call. */
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("[data-call]") as HTMLElement | null;
  if (!a) return;
  e.preventDefault();
  S.openCall = Number(a.dataset.call);
  S.tab = "evidence";
  renderResult();
  const row = document.querySelector<HTMLElement>(`#call-${a.dataset.call}`);
  row?.scrollIntoView({ block: "center", behavior: "smooth" });
  row?.animate([{ background: "#E8F0FE" }, { background: "transparent" }], { duration: 1600 });
  row?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
});

function select(id: string | null): void {
  S.selected = S.selected === id ? null : id;
  if (S.selected) S.tab = "ranking";
  drawMap();
  renderLegend();
  renderResult();
  updateHash();
  const r = S.result;
  if (r && S.selected) {
    const z = zones.get(S.selected);
    const c = r.candidates.find((x) => x.id === S.selected)!;
    const wide = window.innerWidth >= 960;
    if (z) map.fitBounds(z.getBounds(), { paddingTopLeft: [wide ? 300 : 32, 48], paddingBottomRight: [48, wide ? 48 : Math.round(window.innerHeight * 0.5)], maxZoom: 16 });
    else map.panTo([c.lat, c.lon]);
    document.querySelector(`.rank-item[data-row="${S.selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (window.innerWidth < 960 && $("#panel").dataset.snap === "peek") setSnap("half");
  }
}

/* ======================= reach explorer (live) ======================== */
async function loadBands(): Promise<void> {
  const r = S.result;
  const id = S.selected;
  if (!r || !id || S.reachLoading) return;
  const have = S.bands.get(id);
  if (have && have.mode === S.reachMode) return;
  const c = r.candidates.find((x) => x.id === id)!;
  S.reachLoading = true;
  renderResult();
  try {
    const api = new GeoapifyApi({ baseUrl: `${location.origin}/geo`, creditCap: 10 });
    const out = await api.isolineBands({ lat: c.lat, lon: c.lon, mode: S.reachMode, ranges: BAND_MIN.map((m) => m * 60) });
    const seq = Math.max(...S.calls.map((x) => x.seq), -1) + 1;
    const rec = { ...api.calls[api.calls.length - 1], seq };
    S.calls = [...S.calls, rec];
    S.bands.set(id, { mode: S.reachMode, features: out.features as unknown as Bands["features"], ref: seq });
    toast(`${MODES.find((m) => m.id === S.reachMode)!.label} bands added · T${seq}`);
    const outer = out.features[out.features.length - 1];
    if (outer) {
      const wide = window.innerWidth >= 960;
      setTimeout(() => map.fitBounds(L.geoJSON(outer as unknown as GeoJSON.Feature).getBounds(), { paddingTopLeft: [wide ? 300 : 24, 40], paddingBottomRight: [40, wide ? 40 : Math.round(window.innerHeight * 0.5)] }), 0);
    }
    void refreshStatus();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast(/429|quota|limit/i.test(msg) ? "Live quota used up — bands unavailable today" : `Bands failed: ${msg.slice(0, 60)}`);
  } finally {
    S.reachLoading = false;
    drawMap();
    renderLegend();
    renderResult();
  }
}

/* ============================ share / PDF ============================= */
function updateHash(): void {
  if (!S.source || S.source.kind === "live") return;
  const p = new URLSearchParams();
  if (S.source.kind === "example") p.set("ex", S.source.id); else p.set("r", S.source.id);
  if (S.selected) p.set("sel", S.selected);
  if (S.tab !== "ranking") p.set("tab", S.tab);
  history.replaceState(null, "", `#${p.toString()}`);
}

async function shareLink(): Promise<void> {
  const r = S.result;
  if (!r || !S.source) return;
  if (S.source.kind === "live") {
    try {
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...r, calls: S.calls, bands: Object.fromEntries(S.bands) }) });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? `HTTP ${res.status}`);
      S.source = { kind: "shared", id: body.id };
      updateHash();
    } catch (e) {
      toast(`Could not create a link: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  } else updateHash();
  const url = location.href;
  try { await navigator.clipboard.writeText(url); toast("Link copied — opens this exact analysis"); } catch { toast(url); }
}

function exportPdf(): void {
  const r = S.result;
  if (!r) return;
  const best = [...r.candidates].sort((a, b) => a.rank - b.rank);
  $("#print").innerHTML = `<header class="pr-head"><div>${I.pin("#1570EF", "#fff")} <b>SiteScout</b> · site-selection report</div><div>${esc(new Date().toISOString().slice(0, 10))} · ${esc(location.host)}</div></header>
    <h1>${esc(r.question)}</h1>
    <p>${esc(cap(r.plan.business))} · ${esc(r.area.ward?.name ?? r.plan.area)} · planner ${r.planner === "llm" ? "AI" : "rules"} · competitors <code>${esc(r.plan.competitorCategory)}</code> · demand ${r.plan.demandCategories.map((d) => `<code>${esc(d)}</code>`).join(" ")} · ${r.plan.walkMinutes}-min walk zones</p>
    <table class="pr-table"><thead><tr><th>#</th><th>Site</th><th>Score</th>${METRICS.map((m) => `<th>${m.label}</th>`).join("")}<th>Demand</th><th>Comp.</th><th>Drive</th></tr></thead><tbody>
    ${best.map((c) => `<tr><td>${c.rank}</td><td>${esc(c.label)}</td><td><b>${c.total.toFixed(2)}</b></td>${METRICS.map((m) => `<td>${c.scores[m.k].toFixed(2)}</td>`).join("")}<td>${c.demandTotal}</td><td>${c.competitors}</td><td>${c.meanDriveMin !== null ? Math.round(c.meanDriveMin) + "′" : "n/a"}</td></tr>`).join("")}
    </tbody></table>
    ${best.slice(0, 3).map((c) => `<h2>#${c.rank} ${esc(c.label)}</h2><ul>${explain(r, c).map((e) => `<li>${esc(e.text)} ${e.refs.map((s) => `[T${s}]`).join(" ")}</li>`).join("")}</ul>`).join("")}
    <h2>Evidence (${S.calls.length} Geoapify calls)</h2><ol class="pr-calls">${S.calls.map((c) => `<li value="${c.seq}">T${c.seq} ${esc(c.api)} — ${esc(c.method)} ${esc(c.endpoint.slice(0, 110))} · ${c.status} · ${c.durationMs} ms</li>`).join("")}</ol>
    ${r.limitations.length ? `<h2>Limitations</h2><ul>${r.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
    <p class="pr-foot">Powered by Geoapify · © OpenMapTiles © OpenStreetMap contributors · ${esc(REPO)}</p>`;
  document.body.classList.add("printing");
  map.invalidateSize();
  fit(24);
  setTimeout(() => {
    window.print();
    document.body.classList.remove("printing");
    map.invalidateSize();
  }, 700);
}

/* ================================ MCP ================================= */
function openMcp(): void {
  const d = $<HTMLDialogElement>("#mcp");
  const claude = `git clone ${REPO}.git && cd sitescout-agent && npm ci && npm run build\nclaude mcp add sitescout -e GEOAPIFY_API_KEY=YOUR_KEY -- node "$PWD/dist/mcp-server.js"`;
  const cursor = JSON.stringify({ mcpServers: { sitescout: { command: "node", args: ["/ABSOLUTE/PATH/sitescout-agent/dist/mcp-server.js"], env: { GEOAPIFY_API_KEY: "YOUR_KEY" } } } }, null, 2);
  d.innerHTML = `<div class="dlg-head"><h2 id="mcpTitle" class="h2">Use SiteScout from your AI assistant</h2><button class="icon-btn" id="mcpClose" aria-label="Close">${I.close}</button></div>
    <p class="muted">The same engine ships as an MCP server with five tools (<code>plan_site_question</code>, <code>scout_site</code>, <code>resolve_place</code>, <code>walk_isochrone</code>, <code>get_evidence</code>). Bring your own free Geoapify key.</p>
    <div class="h4">Claude Code</div><div class="code"><pre>${esc(claude)}</pre><button class="btn btn-sm" data-copy="claude">Copy</button></div>
    <div class="h4">Cursor / Claude Desktop (<code>mcp.json</code>)</div><div class="code"><pre>${esc(cursor)}</pre><button class="btn btn-sm" data-copy="cursor">Copy</button></div>
    <p class="muted xs">Then ask: “Where should I open a pharmacy in Bình Thạnh?” — the assistant calls <code>scout_site</code> and cites the Geoapify calls. <a href="${REPO}#-use-it-from-your-ai-tool" target="_blank" rel="noopener">Full guide</a></p>`;
  const texts: Record<string, string> = { claude, cursor };
  d.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((b) => (b.onclick = async () => {
    try { await navigator.clipboard.writeText(texts[b.dataset.copy!]); b.textContent = "Copied"; } catch { b.textContent = "Select & copy"; }
  }));
  $("#mcpClose").onclick = () => d.close();
  d.showModal();
}
document.querySelectorAll<HTMLButtonElement>("[data-open-mcp]").forEach((b) => (b.onclick = () => openMcp()));
$("#mcp").addEventListener("click", (e) => { if (e.target === $("#mcp")) $<HTMLDialogElement>("#mcp").close(); });

/* ================================ rail ================================ */
$("#railToggle").onclick = () => {
  const open = $("#rail").classList.toggle("open");
  $("#railToggle").setAttribute("aria-expanded", String(open));
};
document.addEventListener("click", (e) => {
  const rail = $("#rail");
  if (rail.classList.contains("open") && !rail.contains(e.target as Node)) { rail.classList.remove("open"); $("#railToggle").setAttribute("aria-expanded", "false"); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#rail").classList.contains("open")) $("#rail").classList.remove("open");
  if (e.key === "Escape" && S.selected && !$<HTMLDialogElement>("#mcp").open) select(null);
});

/* ======================== mobile bottom sheet ========================= */
function setSnap(s: "peek" | "half" | "full"): void {
  $("#panel").dataset.snap = s;
  setTimeout(() => map.invalidateSize(), 250);
}
(() => {
  const h = $("#sheetHandle");
  let y0 = 0, h0 = 0, moved = false;
  h.onclick = () => { if (moved) return; const s = $("#panel").dataset.snap; setSnap(s === "peek" ? "half" : s === "half" ? "full" : "peek"); };
  h.addEventListener("pointerdown", (e) => { y0 = e.clientY; h0 = $("#panel").getBoundingClientRect().height; moved = false; h.setPointerCapture(e.pointerId); });
  h.addEventListener("pointermove", (e) => {
    if (!h.hasPointerCapture(e.pointerId)) return;
    const dy = y0 - e.clientY;
    if (Math.abs(dy) > 6) moved = true;
    if (moved) { $("#panel").style.height = `${Math.max(120, Math.min(window.innerHeight * 0.92, h0 + dy))}px`; }
  });
  h.addEventListener("pointerup", (e) => {
    if (!moved) return;
    const frac = (h0 + (y0 - e.clientY)) / window.innerHeight;
    $("#panel").style.height = "";
    setSnap(frac < 0.33 ? "peek" : frac < 0.7 ? "half" : "full");
    setTimeout(() => { moved = false; }, 0);
  });
})();

/* ================================ toast =============================== */
let toastT = 0;
function toast(msg: string): void {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = window.setTimeout(() => t.classList.remove("on"), 2800);
}

/* ================================ data ================================ */
function renderAll(): void {
  renderLegend();
  renderAsk();
  renderState();
  renderResult();
}

function setResult(r: ScoutResult, source: NonNullable<State["source"]>, extraCalls: CallRecord[] = []): void {
  S.result = r;
  S.source = source;
  S.calls = [...r.calls, ...extraCalls];
  S.selected = null;
  S.compare = [];
  S.openCall = null;
  renderAll();
  drawMap(true);
}

async function loadExample(id: string, sel?: string, tab?: Tab): Promise<void> {
  const [res, bres] = await Promise.all([fetch(`/examples/${id}.json`), fetch(`/examples/${id}.bands.json`).catch(() => null)]);
  const r = (await res.json()) as ScoutResult;
  S.bands = new Map();
  let extra: CallRecord[] = [];
  if (bres && bres.ok) {
    const b = (await bres.json()) as { mode: Mode; candidates: Record<string, { features: Bands["features"]; ref: number }>; calls: CallRecord[] };
    for (const [cid, v] of Object.entries(b.candidates)) S.bands.set(cid, { mode: b.mode, features: v.features, ref: v.ref });
    extra = b.calls;
  }
  S.banner = S.banner?.kind === "quota" || S.banner?.kind === "error" ? S.banner : null;
  setResult(r, { kind: "example", id }, extra);
  if (tab) S.tab = tab;
  if (sel && r.candidates.some((c) => c.id === sel)) select(sel); else { renderResult(); updateHash(); }
}

async function loadShared(id: string, sel?: string, tab?: Tab): Promise<void> {
  const res = await fetch(`/api/share/${id}`);
  if (!res.ok) {
    S.banner = { kind: "info", text: "That shared link has expired or does not exist — showing a recorded example instead." };
    await loadExample(EXAMPLES[0].id);
    return;
  }
  const r = (await res.json()) as ScoutResult & { bands?: Record<string, Bands> };
  S.bands = new Map(Object.entries(r.bands ?? {}));
  S.question = r.question;
  S.banner = null;
  setResult(r, { kind: "shared", id });
  if (tab) S.tab = tab;
  if (sel) select(sel); else renderResult();
}

function nearestExample(q: string): string {
  const s = q.toLowerCase();
  if (/thu[oố]c|pharm/.test(s)) return "binhthanh-pharmacy";
  if (/qu[aá]n|lunch|restaurant|c[oơ]m|ph[oở]|food|nh[aà] h[aà]ng/.test(s)) return "saigon-lunch";
  return "thaodien-coffee";
}

async function plan(q: string): Promise<PlanOutcome> {
  if (S.planner === "heuristic") return heuristicPlan(q);
  try {
    const res = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, system: PLANNER_SYSTEM_PROMPT }) });
    const body = (await res.json()) as { raw?: string; model?: string; error?: string };
    if (!res.ok || !body.raw) throw new Error(body.error ?? `HTTP ${res.status}`);
    const notes: string[] = [];
    return { plan: parseLlmPlan(body.raw, notes, q), planner: "llm", model: body.model, notes, raw: body.raw };
  } catch (e) {
    const fb = heuristicPlan(q);
    return { ...fb, notes: [`AI plan rejected (${e instanceof Error ? e.message : String(e)}) — rules fallback`, ...fb.notes] };
  }
}

async function run(): Promise<void> {
  if (S.running) return;
  const q = S.question.trim();
  if (q.length < 6) { toast("Type a question first — a business and an area"); $("#q").focus(); return; }
  S.running = true;
  S.banner = null;
  S.calls = [];
  S.selected = null;
  S.step = "plan";
  S.stepDetail = "";
  S.result = null;
  S.source = { kind: "live" };
  S.bands = new Map();
  history.replaceState(null, "", location.pathname);
  zonesLayer.clearLayers(); pinLayer.clearLayers(); poiLayer.clearLayers(); hexLayer.clearLayers();
  renderAll();
  if (window.innerWidth < 960) setSnap("half");
  const api = new GeoapifyApi({ baseUrl: `${location.origin}/geo`, creditCap: 250, onCall: (c) => { S.calls = [...S.calls, c]; renderState(); } });
  try {
    const planned = await plan(q);
    S.step = "geocode";
    renderState();
    const r = await runScout(q, planned, {
      api,
      onEvent: (e) => {
        if (e.type === "stage") {
          S.step = e.stage;
          S.stepDetail = e.stage === "candidate" ? e.detail ?? "" : "";
          if (e.stage === "access") S.stepDetail = "";
          renderState();
        }
        if (e.type === "candidate" && e.candidate.isoline) {
          const g = L.geoJSON({ type: "Feature", properties: {}, geometry: e.candidate.isoline } as GeoJSON.Feature, { style: { color: "#1F63D6", weight: 1, fillColor: "#1F63D6", fillOpacity: 0.15 } }).addTo(zonesLayer);
          L.marker([e.candidate.lat, e.candidate.lon], { icon: L.divIcon({ className: "", html: `<div class="pin pending"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(pinLayer);
          map.fitBounds(g.getBounds(), { padding: [120, 120], maxZoom: 15 });
        }
      },
    });
    S.step = "rank";
    renderState();
    S.running = false;
    setResult(r, { kind: "live" });
    void refreshStatus();
  } catch (e) {
    S.running = false;
    const msg = e instanceof Error ? e.message : String(e);
    // Messages come from the Worker's 429 body (`error`) or the engine's own per-run cap (CreditCapError).
    const visitorCap = /per-visitor/i.test(msg);
    const runCap = /credit cap \d+ reached/i.test(msg);
    const capped = visitorCap || runCap || /429|quota|limit reached/i.test(msg);
    S.banner = !capped
      ? { kind: "error", text: `${msg.slice(0, 140)}. Showing the closest recorded run instead.` }
      : visitorCap
        ? { kind: "quota", text: "You have used today's live-call limit for one visitor, so this question could not run live. Showing the closest recorded run instead — the limit resets at 07:00 (UTC+7)." }
        : runCap
          ? { kind: "quota", text: "This question needed more credits than one live run may use (250), so it stopped early. Showing the closest recorded run instead." }
          : { kind: "quota", text: "Today's shared live budget is used up, so this question could not run live. Showing the closest recorded run instead — live runs reset at 07:00 (UTC+7)." };
    await loadExample(nearestExample(q));
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const s = (await (await fetch("/api/status")).json()) as State["status"];
    if (!s || typeof s.credits !== "number") return;
    S.status = s;
    $("#menuTime").textContent = `Live on Geoapify · ${Math.round(s.spent ?? s.credits)}/${s.creditCap} credits used today`;
    if (!S.running) renderAsk();
  } catch {
    /* static preview */
  }
}

/* ================================ boot ================================ */
window.addEventListener("resize", () => map.invalidateSize());
const hp = new URLSearchParams(location.hash.slice(1));
const hTab = (["ranking", "compare", "evidence"] as Tab[]).find((t) => t === hp.get("tab"));
renderAll();
if (hp.get("r")) void loadShared(hp.get("r")!, hp.get("sel") ?? undefined, hTab);
else {
  const ex = EXAMPLES.find((e) => e.id === hp.get("ex")) ?? EXAMPLES[0];
  S.question = ex.q;
  void loadExample(ex.id, hp.get("sel") ?? undefined, hTab);
}
void refreshStatus();
