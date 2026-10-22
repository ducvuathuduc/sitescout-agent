/**
 * SiteScout live demo (browser). The SAME engine as the CLI (src/engine)
 * runs here; every Geoapify request goes through the Worker proxy (/geo/*),
 * which holds the key. Layout cloned from the CARTO Builder embed (see
 * docs/design/REFERENCE_RESEARCH.md); content, icons and branding are ours.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { GeoapifyApi, type CallRecord } from "../../src/engine/geoapify.js";
import { heuristicPlan, parseLlmPlan, PLANNER_SYSTEM_PROMPT, type PlanOutcome } from "../../src/engine/plan.js";
import { runScout, type ScoutResult, type CandidateResult } from "../../src/engine/scout.js";

const EXAMPLES = [
  { id: "thaodien-coffee", q: "Where should I open a specialty coffee shop in Thảo Điền?" },
  { id: "binhthanh-pharmacy", q: "Where should I open a pharmacy in Bình Thạnh?" },
  { id: "saigon-lunch", q: "Where should I open an office-lunch restaurant in District 1?" },
];

const ICON = {
  logo: `<svg width="24" height="27" viewBox="0 0 24 27" fill="none"><path d="M12 1C6.5 1 2 5.3 2 10.6 2 17.6 12 26 12 26s10-8.4 10-15.4C22 5.3 17.5 1 12 1z" fill="#fff"/><circle cx="12" cy="10.5" r="3.6" fill="#1785FB"/></svg>`,
  logoBlue: `<svg width="24" height="27" viewBox="0 0 24 27" fill="none"><path d="M12 1C6.5 1 2 5.3 2 10.6 2 17.6 12 26 12 26s10-8.4 10-15.4C22 5.3 17.5 1 12 1z" fill="#1785FB"/><circle cx="12" cy="10.5" r="3.6" fill="#fff"/></svg>`,
  chevron: `<svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
  github: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 00-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 008 0z"/></svg>`,
  doc: `<svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 1h7l3 3v11H2z"/><path d="M5 7h5M5 10h5"/></svg>`,
  minus: `<svg width="12" height="2"><rect width="12" height="1.5" fill="currentColor"/></svg>`,
  plus: `<svg width="12" height="12"><rect y="5.25" width="12" height="1.5" fill="currentColor"/><rect x="5.25" width="1.5" height="12" fill="currentColor"/></svg>`,
  search: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="4" cy="4" r="3"/><path d="M6.3 6.3L9 9"/></svg>`,
  play: `<svg width="8" height="9" viewBox="0 0 8 9"><path d="M0 0l8 4.5L0 9z" fill="currentColor"/></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="7" cy="7" r="6"/><path d="M7 6v4M7 4v.5"/></svg>`,
  sparkle: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 0l1.6 5.4L14 7l-5.4 1.6L7 14l-1.6-5.4L0 7l5.4-1.6z"/></svg>`,
};

interface State {
  result: ScoutResult | null;
  recorded: boolean;
  recordedNote: string;
  selected: string | null;
  calls: CallRecord[];
  running: boolean;
  stage: string;
  planner: "llm" | "heuristic";
  question: string;
  status: { credits: number; creditCap: number; yourCalls: number; yourCap: number } | null;
  error: string;
}
const S: State = { result: null, recorded: true, recordedNote: "", selected: null, calls: [], running: false, stage: "", planner: "llm", question: EXAMPLES[0].q, status: null, error: "" };

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

document.querySelector("#app")!.innerHTML = `
<nav class="rail" id="rail">
  <div class="rail-logo">${ICON.logo}</div>
  <button class="rail-toggle" id="railToggle" aria-label="About SiteScout">${ICON.chevron}</button>
  <div class="menu">
    <div class="menu-brand">${ICON.logoBlue}<span>SITESCOUT</span></div>
    <div class="menu-actions"><a href="https://github.com/ducvuathuduc/sitescout-agent" target="_blank" rel="noopener" aria-label="GitHub">${ICON.github}</a><a href="https://github.com/ducvuathuduc/sitescout-agent/blob/main/docs/tutorial.md" target="_blank" rel="noopener" aria-label="Tutorial">${ICON.doc}</a></div>
    <div class="menu-time" id="menuTime">LIVE ON GEOAPIFY</div>
    <div class="menu-title" title="SiteScout — Ho Chi Minh City">SiteScout — Ho Chi Minh City</div>
    <div class="menu-desc">
      <p>Ask where to open a shop. An agent plans the analysis, calls the Geoapify APIs live — walking isochrones, places, boundaries, drive times — and ranks 5–8 candidate sites.</p>
      <p>Every number links to the API call that produced it. Built for the Geoapify Open Geospatial Program.</p>
    </div>
    <div class="menu-foot"><span class="rail-foot-ico">${ICON.logoBlue}</span><span>Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a></span></div>
  </div>
  <a class="rail-foot" href="https://github.com/ducvuathuduc/sitescout-agent" target="_blank" rel="noopener" aria-label="GitHub" style="color:#fff">${ICON.github}</a>
</nav>
<div id="map"></div>
<aside class="widgets">
  <section class="widget" id="wAsk"></section>
  <section class="widget" id="wList"></section>
  <section class="widget grow" id="wCalls"></section>
</aside>`;

/* ------------------------------- map ------------------------------------ */
const map = L.map("map", { zoomControl: false, attributionControl: true, preferCanvas: false }).setView([10.8035, 106.7375], 14);
const tiles = L.tileLayer("/tiles/{z}/{x}/{y}{r}.png", { maxZoom: 18, minZoom: 10, tileSize: 256 }).addTo(map);
let tileErrors = 0;
tiles.on("tileerror", () => {
  tileErrors++;
});
const layer = L.layerGroup().addTo(map);
const mapEl = $("#map");
mapEl.insertAdjacentHTML(
  "beforeend",
  `<div class="legend" id="legend"></div>
   <div class="ctrls"><div class="ctrl-group"><button class="ctrl" id="zOut" aria-label="Zoom out">${ICON.minus}</button><button class="ctrl" id="zIn" aria-label="Zoom in">${ICON.plus}</button></div>
   <div class="ctrl-group"><button class="ctrl" id="zFit" aria-label="Fit shortlist">${ICON.search}</button></div>
   <div class="attrib"><span class="ctrl">${ICON.info}</span>Powered by&nbsp;<a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a>&nbsp;| ©&nbsp;<a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>&nbsp;©&nbsp;<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div></div>`,
);
for (const id of ["legend"]) L.DomEvent.disableClickPropagation($(`#${id}`));
$("#zIn").onclick = () => map.zoomIn();
$("#zOut").onclick = () => map.zoomOut();
$("#zFit").onclick = () => fit();
$("#railToggle").onclick = () => $("#rail").classList.toggle("open");
document.addEventListener("click", (e) => {
  const rail = $("#rail");
  if (rail.classList.contains("open") && !rail.contains(e.target as Node)) rail.classList.remove("open");
});

const polys = new Map<string, L.Polygon | L.GeoJSON>();
const pins = new Map<string, L.Marker>();

function fit(): void {
  const r = S.result;
  if (!r || !r.candidates.length) return;
  const b = L.latLngBounds(r.candidates.map((c) => [c.lat, c.lon] as [number, number]));
  for (const p of polys.values()) b.extend((p as L.GeoJSON).getBounds());
  map.fitBounds(b, { padding: [60, 60] });
}

function drawResult(r: ScoutResult): void {
  layer.clearLayers();
  polys.clear();
  pins.clear();
  const ordered = [...r.candidates].sort((a, b) => b.rank - a.rank);
  for (const c of ordered) {
    if (c.isoline) {
      const g = L.geoJSON({ type: "Feature", properties: {}, geometry: c.isoline } as GeoJSON.Feature, {
        style: { color: "#1785FB", weight: 1, fillColor: "#1785FB", fillOpacity: c.rank === 1 ? 0.7 : 0.45, opacity: 0.9 },
      });
      g.on("click", () => select(c.id, true));
      g.addTo(layer);
      polys.set(c.id, g);
    }
  }
  for (const c of r.candidates) {
    const m = L.marker([c.lat, c.lon], { icon: L.divIcon({ className: "", html: `<div class="pin">${c.rank}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] }), riseOnHover: true });
    m.on("click", () => select(c.id, true));
    m.addTo(layer);
    pins.set(c.id, m);
  }
  fit();
}

function popupHtml(c: CandidateResult, r: ScoutResult): string {
  const callLinks = [...new Set(c.refs)].map((s) => `<a href="#" data-call="${s}">T${s}</a>`).join("");
  const drive = r.origins.filter((o) => o.lat !== undefined).map((o, i) => `${esc(o.query.split(",")[0])} ${c.driveMinByOrigin[i] ?? "n/a"}′`).join(" · ");
  return `<div class="iw"><ul class="iw-list">
    <li><div class="iw-k">#${c.rank} candidate</div><div class="iw-v"><b>${esc(c.label)}</b></div></li>
    <li><div class="iw-k">score</div><div class="iw-v"><b>${c.total.toFixed(2)}</b> · demand ${c.scores.demand.toFixed(2)} · competition ${c.scores.competition.toFixed(2)} · access ${c.scores.access.toFixed(2)} · reach ${c.scores.reach.toFixed(2)}</div></li>
    <li><div class="iw-k">${r.plan.walkMinutes}-min walk</div><div class="iw-v">${(c.isolineAreaM2 / 1e6).toFixed(2)} km² · ${c.demandTotal} demand POIs · ${c.competitors} competitors</div></li>
    <li><div class="iw-k">drive time</div><div class="iw-v">${drive || "n/a"}</div></li>
    <li><div class="iw-k">evidence (Geoapify calls)</div><div class="iw-v iw-refs">${callLinks}</div></li>
  </ul></div>`;
}

function select(id: string | null, openPopup = false): void {
  S.selected = S.selected === id ? null : id;
  const r = S.result;
  if (!r) return;
  for (const c of r.candidates) {
    const on = S.selected === null || S.selected === c.id;
    const p = polys.get(c.id) as L.GeoJSON | undefined;
    p?.setStyle({ fillOpacity: S.selected === c.id ? 0.75 : on ? (c.rank === 1 ? 0.7 : 0.45) : 0.12, opacity: on ? 0.9 : 0.25 });
    const el = pins.get(c.id)?.getElement()?.firstElementChild;
    el?.classList.toggle("off", !on);
  }
  if (S.selected) {
    const c = r.candidates.find((x) => x.id === S.selected)!;
    const p = polys.get(c.id) as L.GeoJSON | undefined;
    if (p) map.fitBounds(p.getBounds(), { padding: [80, 80], maxZoom: 16 });
    if (openPopup || true) pins.get(c.id)?.bindPopup(popupHtml(c, r), { closeButton: true, autoPan: true, offset: [0, -6] }).openPopup();
  } else {
    map.closePopup();
  }
  renderList();
}

map.on("popupclose", () => {
  if (S.selected) {
    S.selected = null;
    select(null);
  }
});
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("[data-call]") as HTMLElement | null;
  if (!a) return;
  e.preventDefault();
  const row = document.querySelector(`#call-${a.dataset.call}`);
  row?.scrollIntoView({ block: "center", behavior: "smooth" });
  row?.classList.add("flash");
  (row as HTMLElement | null)?.animate([{ background: "#e8f2ff" }, { background: "transparent" }], { duration: 1200 });
});

/* ------------------------------ widgets --------------------------------- */
function renderLegend(): void {
  const r = S.result;
  const title = r ? `${cap(r.plan.business)} — ${r.area.ward?.name ?? r.plan.area}` : "SiteScout";
  const sub = S.running ? `Running · ${esc(S.stage)}` : S.recorded && r ? `Recorded run · ${r.generatedAt.slice(0, 10)}` : r ? `Live run · ${r.calls.length} Geoapify calls · ${(r.durationMs / 1000).toFixed(0)} s` : "";
  $("#legend").innerHTML = `<div class="legend-title" title="${esc(title)}">${esc(title)}</div>
    <div class="legend-row"><span class="legend-dot"></span>${r ? r.plan.walkMinutes : 10} minute walk time</div>
    ${sub ? `<div class="legend-sub">${sub}</div>` : ""}`;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function renderAsk(): void {
  const st = S.status;
  const quota = st ? `${st.credits}/${st.creditCap} credits today` : "";
  $("#wAsk").innerHTML = `<div class="w-loader ${S.running ? "on" : ""}"></div>
    <div class="w-head"><div class="w-title">question</div><div class="w-opts" title="Planner">${ICON.sparkle}</div></div>
    <div class="w-filter"><span>${S.running ? "running live" : "ask in English or Vietnamese"}</span><span><button class="link ${S.planner === "llm" ? "" : "off"}" id="pLlm">AI plan</button><button class="link ${S.planner === "heuristic" ? "" : "off"}" id="pRules">rules</button></span></div>
    <textarea class="w-input" id="q" rows="2" maxlength="200" ${S.running ? "disabled" : ""}>${esc(S.question)}</textarea>
    <ul class="w-list">${EXAMPLES.map((e, i) => `<li class="w-item"><button class="w-btn ex" data-i="${i}"><div class="w-row"><span class="w-label">${esc(e.q)}</span><span class="w-count">rec</span></div></button></li>`).join("")}</ul>
    <div class="w-nav"><button id="run" ${S.running ? "disabled" : ""}>${ICON.play} run live analysis</button></div>
    ${S.result && !S.running ? `<div class="w-note">PLAN (${S.result.planner === "llm" ? "AI · " + esc((S.result.plannerModel ?? "").split("/").pop() ?? "") : "rules"}): ${esc(S.result.plan.business)} · competitors ${esc(S.result.plan.competitorCategory)} · demand ${esc(S.result.plan.demandCategories.join(", "))} · ${S.result.plan.walkMinutes}′ walk${S.result.planNotes.length ? " · " + esc(S.result.planNotes.join("; ")) : ""}</div>` : ""}
    ${S.error ? `<div class="w-note warn">${esc(S.error)}</div>` : `<div class="w-note">${quota ? esc(quota) + " · " : ""}live calls via a rate-limited proxy; recorded runs load instantly</div>`}`;
  $("#pLlm").onclick = () => { S.planner = "llm"; renderAsk(); };
  $("#pRules").onclick = () => { S.planner = "heuristic"; renderAsk(); };
  ($("#q") as HTMLTextAreaElement).oninput = (e) => { S.question = (e.target as HTMLTextAreaElement).value; };
  ($("#q") as HTMLTextAreaElement).onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void run(); } };
  document.querySelectorAll<HTMLButtonElement>(".ex").forEach((b) => (b.onclick = () => { const ex = EXAMPLES[Number(b.dataset.i)]; S.question = ex.q; void loadRecorded(ex.id); }));
  $("#run").onclick = () => void run();
}

function renderList(): void {
  const r = S.result;
  const sel = S.selected;
  const head = `<div class="w-loader ${S.running ? "on" : ""}"></div><div class="w-head"><div class="w-title">shortlist</div><div class="w-opts">${ICON.info}</div></div>`;
  if (!r || !r.candidates.length) {
    $("#wList").innerHTML = `${head}<div class="w-filter"><span>no candidates yet</span></div><div class="w-empty">${S.running ? "Generating candidates and walking isochrones…" : "Run a question to rank candidate sites."}</div>`;
    return;
  }
  const max = Math.max(...r.candidates.map((c) => c.total), 0.01);
  $("#wList").innerHTML = `${head}
    <div class="w-filter"><span>${sel ? "1 selected" : "all selected"}</span>${sel ? `<button class="link" id="all">all</button>` : `<span style="color:var(--ink-3);font-weight:400">score</span>`}</div>
    <ul class="w-list ${sel ? "has-sel" : ""}">${r.candidates
      .map((c) => `<li class="w-item"><button class="w-btn ${sel === c.id ? "sel" : ""}" data-id="${c.id}" title="${esc(c.why)}"><div class="w-row"><span class="w-label">${c.rank}. ${esc(c.label)}</span><span class="w-count">${c.total.toFixed(2)}</span></div><div class="w-bar"><i style="width:${((c.total / max) * 100).toFixed(1)}%"></i></div></button></li>`)
      .join("")}</ul>
    <div class="w-nav"><button id="why">${ICON.search} why #1: ${esc(r.candidates[0].why.slice(0, 40))}…</button></div>`;
  document.querySelectorAll<HTMLButtonElement>("#wList .w-btn").forEach((b) => (b.onclick = () => select(b.dataset.id!, true)));
  const all = document.querySelector<HTMLButtonElement>("#all");
  if (all) all.onclick = () => select(null);
  $("#why").onclick = () => select(r.candidates[0].id, true);
}

function renderCalls(): void {
  const calls = S.calls;
  const max = Math.max(...calls.map((c) => c.durationMs), 1);
  const credits = calls.reduce((a, c) => a + c.credits, 0);
  $("#wCalls").innerHTML = `<div class="w-loader ${S.running ? "on" : ""}"></div>
    <div class="w-head"><div class="w-title">geoapify calls</div><div class="w-opts">${ICON.info}</div></div>
    <div class="w-filter"><span>${calls.length} calls · ~${credits} credits</span><span style="color:var(--ink-3);font-weight:400">ms</span></div>
    <ul class="w-list" id="callList">${calls
      .map((c) => `<li class="w-item" id="call-${c.seq}"><div class="w-btn" title="${esc(c.method + " " + c.endpoint)}"><div class="w-row"><span class="w-label">T${c.seq} · ${esc(c.api)} <span style="font-weight:400;color:var(--ink-3)">${esc(summ(c))}</span></span><span class="w-count">${c.durationMs}</span></div><div class="w-bar"><i style="width:${((c.durationMs / max) * 100).toFixed(1)}%"></i></div></div></li>`)
      .join("")}</ul>`;
  const list = document.querySelector("#callList");
  if (S.running && list) list.scrollTop = list.scrollHeight;
}

function summ(c: CallRecord): string {
  const s = c.summary as Record<string, unknown>;
  if (c.error) return c.error.slice(0, 30);
  if (s.count !== undefined) return `${s.count} · ${String(s.categories ?? "").split(",")[0]}`;
  if (s.levels) return String(s.levels).split(" ⊂ ")[1] ?? String(s.levels);
  if (s.top) return String(s.top).split(",")[0];
  if (s.mode) return `${s.mode} ${Number(s.range) / 60}′`;
  if (s.cells !== undefined) return `${s.sources}×${s.targets}`;
  if (s.timeS !== undefined) return `${Math.round(Number(s.timeS) / 60)}′`;
  if (s.features) return String(s.features);
  return "";
}

function renderAll(): void {
  renderLegend();
  renderAsk();
  renderList();
  renderCalls();
}

/* ------------------------------ data ------------------------------------ */
async function loadRecorded(id: string, note = ""): Promise<void> {
  const res = await fetch(`/examples/${id}.json`);
  const r = (await res.json()) as ScoutResult;
  S.result = r;
  S.recorded = true;
  S.recordedNote = note;
  S.selected = null;
  S.calls = r.calls;
  S.error = note;
  renderAll();
  drawResult(r);
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
    return { plan: parseLlmPlan(body.raw, notes), planner: "llm", model: body.model, notes, raw: body.raw };
  } catch (e) {
    const fb = heuristicPlan(q);
    return { ...fb, notes: [`AI plan rejected (${e instanceof Error ? e.message : String(e)}) — rules fallback`, ...fb.notes] };
  }
}

async function run(): Promise<void> {
  if (S.running) return;
  const q = S.question.trim();
  if (q.length < 6) return;
  S.running = true;
  S.error = "";
  S.calls = [];
  S.selected = null;
  S.stage = "planning";
  S.result = null;
  layer.clearLayers();
  renderAll();
  const api = new GeoapifyApi({
    baseUrl: `${location.origin}/geo`,
    creditCap: 250,
    onCall: (c) => {
      S.calls = [...S.calls, c];
      renderCalls();
    },
  });
  const liveCands: L.Layer[] = [];
  try {
    const planned = await plan(q);
    const r = await runScout(q, planned, {
      api,
      onEvent: (e) => {
        if (e.type === "stage") {
          S.stage = e.detail ? `${e.stage} ${e.detail}` : e.stage;
          renderLegend();
        }
        if (e.type === "candidate" && e.candidate.isoline) {
          const g = L.geoJSON({ type: "Feature", properties: {}, geometry: e.candidate.isoline } as GeoJSON.Feature, { style: { color: "#1785FB", weight: 1, fillColor: "#1785FB", fillOpacity: 0.45 } }).addTo(layer);
          liveCands.push(g);
          map.fitBounds(g.getBounds(), { padding: [120, 120], maxZoom: 15 });
        }
      },
    });
    S.result = r;
    S.recorded = false;
    S.running = false;
    renderAll();
    drawResult(r);
    void refreshStatus();
  } catch (e) {
    S.running = false;
    const msg = e instanceof Error ? e.message : String(e);
    const capped = /429/.test(msg) || /quota|limit/i.test(msg);
    const ex = nearestExample(q);
    await loadRecorded(ex, capped ? "Live quota for today is used up — showing the closest recorded run instead." : `Live run failed (${msg.slice(0, 80)}) — showing a recorded run.`);
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const s = await (await fetch("/api/status")).json();
    S.status = s;
    $("#menuTime").textContent = `LIVE ON GEOAPIFY · ${s.credits}/${s.creditCap} CREDITS TODAY`;
    if (!S.running) renderAsk();
  } catch {
    /* static preview */
  }
}

renderAll();
void loadRecorded(EXAMPLES[0].id);
void refreshStatus();
