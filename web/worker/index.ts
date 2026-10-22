/**
 * SiteScout live demo — Cloudflare Worker (free plan).
 *
 *  /geo/*          allow-listed proxy to api.geoapify.com. The key lives only
 *                  here, as the GEOAPIFY_KEY secret. HCMC-only coordinates,
 *                  per-IP + global daily caps (D1), 24 h edge cache.
 *  /tiles/z/x/y    Geoapify "positron" raster tiles, HCMC bbox, 30-day cache.
 *  /api/plan       optional LLM planner on Workers AI (no third-party key);
 *                  the browser validates the JSON with zod before use.
 *  /api/status     today's usage vs caps (shown in the UI).
 *  everything else static assets (web/public).
 *
 * When a cap is reached the proxy answers 429 {fallback:true} and the UI
 * switches to the pre-recorded runs in /examples/.
 */
import { ASSETS as EMBEDDED } from "./assets.gen.js";

const bin = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function serveEmbedded(url: URL): Response {
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const f = EMBEDDED[path];
  if (!f) return new Response(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  const long = /\.(woff2|svg)$/.test(path) || path.startsWith("/examples/");
  return new Response(bin(f.b64), { headers: { "content-type": f.type, "cache-control": long ? "public, max-age=86400" : "public, max-age=300", "x-content-type-options": "nosniff" } });
}

// 404 layout follows the CARTO error page (centred badge, title, one line, one action); our colours/copy.
const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 — SiteScout</title><link rel="icon" href="/favicon.svg"><style>
@font-face{font-family:"Open Sans";src:url(/fonts/open-sans-latin-400-normal.woff2) format("woff2");font-weight:400}
@font-face{font-family:"Open Sans";src:url(/fonts/open-sans-latin-600-normal.woff2) format("woff2");font-weight:600}
html,body{margin:0;height:100%;background:#1785FB;color:#fff;font-family:"Open Sans",system-ui,sans-serif}
header{display:flex;justify-content:space-between;align-items:center;padding:24px 15%;font-weight:600;letter-spacing:.2em;font-size:13px}
header a{color:#fff;text-decoration:none;letter-spacing:0;font-size:13px}
main{display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 140px);text-align:center}
.badge{width:68px;height:68px;border:2px solid rgba(255,255,255,.35);border-radius:50%;display:grid;place-items:center;margin-bottom:24px}
h1{font-size:22px;font-weight:600;margin:0 0 10px}p{font-size:18px;line-height:1.5;max-width:420px;margin:0 0 26px}
.btn{background:#fff;color:#1785FB;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:9px 18px;border-radius:4px;text-decoration:none}
</style></head><body><header><span>SITESCOUT</span><a href="https://github.com/ducvuathuduc/sitescout-agent">GitHub</a></header><main>
<div class="badge"><svg width="24" height="27" viewBox="0 0 24 27"><path d="M12 1C6.5 1 2 5.3 2 10.6 2 17.6 12 26 12 26s10-8.4 10-15.4C22 5.3 17.5 1 12 1z" fill="#fff"/><circle cx="12" cy="10.5" r="3.6" fill="#1785FB"/></svg></div>
<h1>404 ERROR</h1><p>This place isn't on our map. The demo covers Ho Chi Minh City site analyses.</p><a class="btn" href="/">Back to the map</a></main></body></html>`;

export interface Env {
  GEOAPIFY_KEY: string;
  DB: D1Database;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  ASSETS?: { fetch(req: Request): Promise<Response> };
  DAILY_CREDIT_CAP?: string;
  PER_IP_CALL_CAP?: string;
  TILE_CAP?: string;
}

const UPSTREAM = "https://api.geoapify.com";
const ALLOW: Record<string, "GET" | "POST"> = {
  "/v1/geocode/search": "GET",
  "/v1/geocode/autocomplete": "GET",
  "/v1/geocode/reverse": "GET",
  "/v2/places": "GET",
  "/v2/place-details": "GET",
  "/v1/isoline": "GET",
  "/v1/routing": "GET",
  "/v1/boundaries/part-of": "GET",
  "/v1/routematrix": "POST",
};
// Greater Ho Chi Minh City
const BBOX = { minLat: 10.35, maxLat: 11.2, minLon: 106.35, maxLon: 107.05 };
const LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const json = (x: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

const today = (): string => new Date().toISOString().slice(0, 10);

function inHcmc(lat: number, lon: number): boolean {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
}

/** Reject requests that would use the key outside the demo's scope. */
function scopeError(path: string, q: URLSearchParams, body: unknown): string | null {
  const num = (k: string): number => Number(q.get(k));
  if (q.has("lat") && q.has("lon") && !inHcmc(num("lat"), num("lon"))) return "coordinates outside Ho Chi Minh City";
  if (path === "/v2/places") {
    const f = q.get("filter") ?? "";
    const cats = (q.get("categories") ?? "").split(",");
    if (cats.length > 3) return "too many categories";
    if (Number(q.get("limit") ?? 20) > 200) return "limit too high";
    const nums = f.replace(/^(rect|circle):/, "").split(",").map(Number);
    if (f.startsWith("circle:") && (!inHcmc(nums[1], nums[0]) || nums[2] > 3000)) return "circle outside scope";
    if (f.startsWith("rect:") && !(inHcmc(nums[1], nums[0]) && inHcmc(nums[3], nums[2]))) return "rect outside scope";
    if (!/^(rect|circle|geometry):/.test(f)) return "filter required";
  }
  if (path === "/v1/isoline") {
    if (Number(q.get("range")) > 1800) return "range too large";
    if (!["walk", "drive", "bicycle", "scooter", "motorcycle"].includes(q.get("mode") ?? "")) return "mode not allowed";
  }
  if (path === "/v1/routing") {
    const wps = (q.get("waypoints") ?? "").split("|");
    if (wps.length > 4 || wps.some((w) => { const [la, lo] = w.split(",").map(Number); return !inHcmc(la, lo); })) return "waypoints outside scope";
  }
  if (path === "/v1/routematrix") {
    const b = body as { sources?: Array<{ location: [number, number] }>; targets?: Array<{ location: [number, number] }> };
    const pts = [...(b?.sources ?? []), ...(b?.targets ?? [])];
    if (!pts.length || (b.sources?.length ?? 0) > 5 || (b.targets?.length ?? 0) > 10) return "matrix too large";
    if (pts.some((p) => !inHcmc(p.location?.[1], p.location?.[0]))) return "matrix outside scope";
  }
  if ((path.startsWith("/v1/geocode/search") || path.startsWith("/v1/geocode/autocomplete")) && (q.get("text") ?? "").length > 160) return "text too long";
  return null;
}

function credits(path: string, data: unknown, body: unknown): number {
  if (path === "/v2/places") return Math.max(1, Math.ceil(((data as { features?: unknown[] })?.features?.length ?? 0) / 20));
  if (path === "/v1/routematrix") {
    const b = body as { sources?: unknown[]; targets?: unknown[] };
    const s = b?.sources?.length ?? 1, t = b?.targets?.length ?? 1;
    return Math.max(s, t) * Math.min(s, t, 10);
  }
  return 1;
}

async function usage(env: Env, ip: string): Promise<{ ipCalls: number; credits: number; tiles: number; plans: number }> {
  const d = today();
  const g = await env.DB.prepare("SELECT credits, tiles, plans FROM totals WHERE day=?").bind(d).first<{ credits: number; tiles: number; plans: number }>();
  const u = await env.DB.prepare("SELECT calls FROM ip_usage WHERE day=? AND ip=?").bind(d, ip).first<{ calls: number }>();
  return { ipCalls: u?.calls ?? 0, credits: g?.credits ?? 0, tiles: g?.tiles ?? 0, plans: g?.plans ?? 0 };
}

async function bump(env: Env, ip: string, c: { calls?: number; credits?: number; tiles?: number; plans?: number }): Promise<void> {
  const d = today();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO totals(day,credits,tiles,plans,calls) VALUES(?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET credits=credits+excluded.credits, tiles=tiles+excluded.tiles, plans=plans+excluded.plans, calls=calls+excluded.calls").bind(d, c.credits ?? 0, c.tiles ?? 0, c.plans ?? 0, c.calls ?? 0),
    env.DB.prepare("INSERT INTO ip_usage(day,ip,calls) VALUES(?,?,?) ON CONFLICT(day,ip) DO UPDATE SET calls=calls+excluded.calls").bind(d, ip, c.calls ?? 0),
  ]);
}

async function proxyGeo(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const path = url.pathname.replace(/^\/geo/, "");
  const method = ALLOW[path];
  if (!method || method !== req.method) return json({ error: "endpoint not allowed in the demo" }, 404);
  const body = method === "POST" ? await req.json().catch(() => null) : undefined;
  const err = scopeError(path, url.searchParams, body);
  if (err) return json({ error: `demo scope: ${err}` }, 400);

  const upstream = `${UPSTREAM}${path}${url.search}`;
  const cacheKey = new Request(method === "GET" ? upstream : `${upstream}#${await sha(JSON.stringify(body))}`, { method: "GET" });
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), "x-sitescout-cache": "HIT" } });

  const ip = await visitor(req);
  const u = await usage(env, ip);
  const cap = Number(env.DAILY_CREDIT_CAP ?? 1500);
  const ipCap = Number(env.PER_IP_CALL_CAP ?? 180);
  if (u.credits >= cap) return json({ error: "daily live quota reached", fallback: true, used: u.credits, cap }, 429);
  if (u.ipCalls >= ipCap) return json({ error: "per-visitor daily limit reached", fallback: true, used: u.ipCalls, cap: ipCap }, 429);

  const res = await fetch(upstream, {
    method,
    headers: { "x-api-key": env.GEOAPIFY_KEY, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  const c = res.ok ? credits(path, data, body) : 0;
  ctx.waitUntil(bump(env, ip, { calls: 1, credits: c }));
  const out = new Response(text, { status: res.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-sitescout-cache": "MISS", "x-sitescout-credits": String(c) } });
  if (res.status === 200) ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}

/** Daily-rotating hash of the visitor IP — raw IPs are never stored. */
async function visitor(req: Request): Promise<string> {
  return sha(`${req.headers.get("cf-connecting-ip") ?? "0.0.0.0"}|${today()}|sitescout`);
}

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function tileInHcmc(z: number, x: number, y: number): boolean {
  if (z < 9 || z > 18) return false;
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180, lon2 = ((x + 1) / n) * 360 - 180;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat2 = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  return lon2 >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat2 <= BBOX.maxLat;
}

async function proxyTile(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const m = url.pathname.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)(@2x)?\.png$/);
  if (!m) return new Response("bad tile", { status: 400 });
  const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!tileInHcmc(z, x, y)) return new Response(null, { status: 204 });
  const upstream = `${UPSTREAM}/v1/tile/positron/${z}/${x}/${y}${m[4] ?? ""}.png`;
  const cache = caches.default;
  const key = new Request(upstream);
  const hit = await cache.match(key);
  if (hit) return hit;
  const u = await usage(env, req.headers.get("cf-connecting-ip") ?? "0.0.0.0");
  if (u.tiles >= Number(env.TILE_CAP ?? 2500)) return new Response(null, { status: 429, headers: { "x-sitescout-fallback": "tiles" } });
  const res = await fetch(upstream, { headers: { "x-api-key": env.GEOAPIFY_KEY } });
  if (!res.ok) return new Response(null, { status: res.status });
  const out = new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=2592000" } });
  ctx.waitUntil(cache.put(key, out.clone()));
  ctx.waitUntil(bump(env, "tiles", { tiles: 1 }));
  return out;
}

async function plan(req: Request, env: Env): Promise<Response> {
  if (!env.AI) return json({ error: "AI binding not configured" }, 501);
  const { question, system } = (await req.json().catch(() => ({}))) as { question?: string; system?: string };
  if (!question || question.length > 300 || !system || system.length > 4000) return json({ error: "bad request" }, 400);
  const ip = await visitor(req);
  const u = await usage(env, ip);
  if (u.plans >= 300) return json({ error: "daily AI planner quota reached", fallback: true }, 429);
  const out = (await env.AI.run(LLM_MODEL, {
    messages: [{ role: "system", content: system }, { role: "user", content: question }],
    temperature: 0,
    max_tokens: 400,
  })) as { response?: unknown };
  await bump(env, ip, { plans: 1 });
  const raw = typeof out.response === "string" ? out.response : JSON.stringify(out.response ?? "");
  return json({ raw, model: LLM_MODEL });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/geo/")) return await proxyGeo(req, env, url, ctx);
      if (url.pathname.startsWith("/tiles/")) return await proxyTile(req, env, url, ctx);
      if (url.pathname === "/api/plan" && req.method === "POST") return await plan(req, env);
      if (url.pathname === "/api/status") {
        const u = await usage(env, await visitor(req));
        return json({ day: today(), credits: u.credits, creditCap: Number(env.DAILY_CREDIT_CAP ?? 1500), yourCalls: u.ipCalls, yourCap: Number(env.PER_IP_CALL_CAP ?? 180), tiles: u.tiles, liveKey: Boolean(env.GEOAPIFY_KEY) });
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e), fallback: true }, 502);
    }
    return env.ASSETS ? env.ASSETS.fetch(req) : serveEmbedded(url);
  },
};
