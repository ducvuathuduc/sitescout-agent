/**
 * Direct Geoapify REST client — runtime-agnostic (Node ≥20, Cloudflare
 * Workers, browsers): only `fetch`, no Node built-ins.
 *
 * Covers the Geoapify APIs that fit site selection:
 *   Geocoding (search, autocomplete, reverse), Batch Geocoding, Places,
 *   Place Details, Isoline, Route Matrix, Routing, Boundaries (part-of /
 *   consists-of), Static Maps. Map Tiles are proxied by the web demo.
 *
 * Auth: the key travels in the `x-api-key` header (never in a URL), so
 * trace logs and committed artefacts can include every request URL verbatim
 * without leaking it.
 *
 * Every request is recorded through `onCall` (seq, API, endpoint, params,
 * status, duration, summary, estimated credits) — this is the evidence trace
 * the reports cite as [Tn].
 */

export const GEOAPIFY_BASE = "https://api.geoapify.com";

export type GeoapifyApiName =
  | "geocoding"
  | "autocomplete"
  | "reverse-geocoding"
  | "batch-geocoding"
  | "places"
  | "place-details"
  | "isoline"
  | "route-matrix"
  | "routing"
  | "boundaries"
  | "static-maps";

export interface CallRecord {
  seq: number;
  api: GeoapifyApiName;
  method: "GET" | "POST";
  /** Path + query string WITHOUT any key, e.g. `/v1/isoline?lat=…`. */
  endpoint: string;
  body?: unknown;
  status: number;
  durationMs: number;
  /** Small human-readable digest of the response. */
  summary: Record<string, unknown>;
  /** Estimated Geoapify credits (see estimateCredits). */
  credits: number;
  error?: string;
  ts: string;
}

export interface GeoapifyOptions {
  /** Real key (Worker secret / env). In the Hark sandbox a proxy injects it. */
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onCall?: (r: CallRecord) => void;
  /** Abort after this many credits in one run (default 400). */
  creditCap?: number;
  timeoutMs?: number;
}

export class GeoapifyError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly endpoint: string,
  ) {
    super(`Geoapify ${status} on ${endpoint}: ${message}`);
    this.name = "GeoapifyError";
  }
}

export class CreditCapError extends Error {
  constructor(cap: number) {
    super(`credit cap ${cap} reached — run stopped before overspending`);
    this.name = "CreditCapError";
  }
}

type Params = Record<string, string | number | boolean | undefined>;

export interface Feature<P = Record<string, unknown>> {
  type: "Feature";
  properties: P;
  geometry: { type: string; coordinates: unknown };
}
export interface FeatureCollection<P = Record<string, unknown>> {
  type: "FeatureCollection";
  features: Array<Feature<P>>;
}

export interface GeocodeResult {
  formatted?: string;
  name?: string;
  lat: number;
  lon: number;
  result_type?: string;
  place_id?: string;
  rank?: { confidence?: number; match_type?: string };
  bbox?: { lon1: number; lat1: number; lon2: number; lat2: number };
  suburb?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  [k: string]: unknown;
}

export interface PlaceProps {
  name?: string;
  formatted?: string;
  lat: number;
  lon: number;
  categories: string[];
  place_id: string;
  address_line1?: string;
  distance?: number;
  [k: string]: unknown;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Credit model from https://www.geoapify.com/pricing-details/ (read 2026-10-31).
 * Isoline: 1 credit for each 5 minutes; a multi-range request is counted as
 * the sum of its ranges (the conservative reading). `range` is in seconds.
 * Boundaries: 1 credit per 20 results, plus 1 per result when a polygon
 * (geometry other than "point") is returned.
 */
export function estimateCredits(api: GeoapifyApiName, info: { results?: number; sources?: number; targets?: number; items?: number; range?: number; ranges?: number[]; geometry?: string }): number {
  switch (api) {
    case "boundaries": {
      const n = info.results ?? 0;
      return Math.max(1, Math.ceil(n / 20)) + (info.geometry && info.geometry !== "point" ? n : 0);
    }
    case "places":
      return Math.max(1, Math.ceil((info.results ?? 20) / 20));
    case "route-matrix": {
      const s = info.sources ?? 1;
      const t = info.targets ?? 1;
      return Math.max(s, t) * Math.min(s, t, 10);
    }
    case "batch-geocoding":
      return Math.max(1, Math.ceil((info.items ?? 1) / 2));
    case "isoline": {
      const ranges = info.ranges ?? (info.range !== undefined ? [info.range] : []);
      if (ranges.length === 0) return 1;
      return ranges.reduce((sum, r) => sum + Math.max(1, Math.ceil(r / 300)), 0);
    }
    default:
      return 1;
  }
}

export class GeoapifyApi {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private seq = 0;
  private spent = 0;
  readonly calls: CallRecord[] = [];

  constructor(private readonly opts: GeoapifyOptions = {}) {
    this.base = opts.baseUrl ?? GEOAPIFY_BASE;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  get creditsSpent(): number {
    return this.spent;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { accept: "application/json" };
    if (this.opts.apiKey) h["x-api-key"] = this.opts.apiKey;
    if (json) h["content-type"] = "application/json";
    return h;
  }

  private qs(params: Params): string {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
    return u.toString();
  }

  /** Core request with retry (429/5xx), timeout, credit cap and trace. */
  private async request<T>(
    api: GeoapifyApiName,
    method: "GET" | "POST",
    path: string,
    params: Params,
    body: unknown,
    summarize: (data: T) => Record<string, unknown>,
    credits: (data: T) => number,
    raw = false,
  ): Promise<{ data: T; record: CallRecord }> {
    const cap = this.opts.creditCap ?? 400;
    if (this.spent >= cap) throw new CreditCapError(cap);
    const endpoint = `${path}${Object.keys(params).length ? "?" + this.qs(params) : ""}`;
    const seq = this.seq++;
    const started = Date.now();
    let attempt = 0;
    for (;;) {
      attempt++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 30_000);
      let status = 0;
      try {
        const res = await this.fetchImpl(this.base + endpoint, {
          method,
          headers: this.headers(body !== undefined),
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });
        status = res.status;
        // The demo proxy marks "daily budget used up" 429s; retrying cannot help there.
        const quota = status === 429 && res.headers?.get("x-sitescout-fallback") != null;
        if ((status === 429 || status >= 500) && attempt < 3 && !quota) {
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }
        const data = (raw ? await res.arrayBuffer() : await res.json().catch(() => ({}))) as T;
        if (status >= 400) {
          // Geoapify errors carry `message`; the demo proxy's own answers carry `error`.
          const msg = String((data as { message?: unknown; error?: unknown })?.message ?? (data as { error?: unknown })?.error ?? res.statusText);
          const record = this.record({ seq, api, method, endpoint, body, status, durationMs: Date.now() - started, summary: { error: msg }, credits: 0, error: msg });
          throw Object.assign(new GeoapifyError(status, msg, endpoint), { record });
        }
        const c = status === 202 ? 0 : credits(data);
        this.spent += c;
        const record = this.record({ seq, api, method, endpoint, body, status, durationMs: Date.now() - started, summary: summarize(data), credits: c });
        return { data, record };
      } catch (e) {
        if (e instanceof GeoapifyError) throw e;
        if (attempt < 3 && (e as Error).name === "AbortError") continue;
        const msg = e instanceof Error ? e.message : String(e);
        this.record({ seq, api, method, endpoint, body, status, durationMs: Date.now() - started, summary: { error: msg }, credits: 0, error: msg });
        throw e;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  private record(r: Omit<CallRecord, "ts">): CallRecord {
    const rec: CallRecord = { ...r, ts: new Date().toISOString() };
    // keep large bodies out of the trace
    if (rec.body && JSON.stringify(rec.body).length > 4000) rec.body = { omitted: true, bytes: JSON.stringify(rec.body).length };
    this.calls.push(rec);
    this.opts.onCall?.(rec);
    return rec;
  }

  /* ---------------------------- Geocoding ---------------------------- */

  async geocode(text: string, o: { lang?: string; limit?: number; type?: string; biasLonLat?: [number, number] } = {}): Promise<{ results: GeocodeResult[]; seq: number }> {
    const { data, record } = await this.request<{ results?: GeocodeResult[] }>(
      "geocoding", "GET", "/v1/geocode/search",
      { text, lang: o.lang ?? "vi", limit: o.limit ?? 5, type: o.type, filter: "countrycode:vn", bias: o.biasLonLat ? `proximity:${o.biasLonLat[0]},${o.biasLonLat[1]}` : undefined, format: "json" },
      undefined,
      (d) => ({ count: d.results?.length ?? 0, top: d.results?.[0]?.formatted, type: d.results?.[0]?.result_type, confidence: d.results?.[0]?.rank?.confidence }),
      () => 1,
    );
    return { results: data.results ?? [], seq: record.seq };
  }

  async autocomplete(text: string, o: { lang?: string; limit?: number; biasLonLat?: [number, number] } = {}): Promise<{ results: GeocodeResult[]; seq: number }> {
    const { data, record } = await this.request<{ results?: GeocodeResult[] }>(
      "autocomplete", "GET", "/v1/geocode/autocomplete",
      { text, lang: o.lang ?? "vi", limit: o.limit ?? 5, filter: "countrycode:vn", bias: o.biasLonLat ? `proximity:${o.biasLonLat[0]},${o.biasLonLat[1]}` : undefined, format: "json" },
      undefined,
      (d) => ({ count: d.results?.length ?? 0, top: d.results?.[0]?.formatted }),
      () => 1,
    );
    return { results: data.results ?? [], seq: record.seq };
  }

  async reverse(lat: number, lon: number, o: { lang?: string; type?: string } = {}): Promise<{ result?: GeocodeResult; seq: number }> {
    const { data, record } = await this.request<{ results?: GeocodeResult[] }>(
      "reverse-geocoding", "GET", "/v1/geocode/reverse",
      { lat, lon, lang: o.lang ?? "vi", type: o.type, format: "json" },
      undefined,
      (d) => ({ top: d.results?.[0]?.formatted, type: d.results?.[0]?.result_type }),
      () => 1,
    );
    return { result: data.results?.[0], seq: record.seq };
  }

  /**
   * Batch geocoding (async job): POST the list, then poll the job URL until
   * results are ready. Used by the HCMC address benchmark.
   */
  async batchGeocode(addresses: string[], o: { lang?: string; pollMs?: number; maxPolls?: number } = {}): Promise<{ results: Array<GeocodeResult & { query?: { text?: string } }>; seqs: number[] }> {
    const seqs: number[] = [];
    const params = { lang: o.lang ?? "vi", filter: "countrycode:vn" };
    const { data: job, record } = await this.request<{ id?: string; url?: string; status?: string }>(
      "batch-geocoding", "POST", "/v1/batch/geocode/search", params, addresses,
      (d) => ({ job: d.id, status: d.status ?? "pending", items: addresses.length }),
      () => 0,
    );
    seqs.push(record.seq);
    if (!job.id) throw new Error("batch geocoding: no job id returned");
    for (let i = 0; i < (o.maxPolls ?? 30); i++) {
      await sleep(o.pollMs ?? 2000);
      const { data, record: r } = await this.request<unknown>(
        "batch-geocoding", "GET", "/v1/batch/geocode/search", { id: job.id, format: "json" }, undefined,
        (d) => (Array.isArray(d) ? { ready: true, results: d.length } : { ready: false, status: (d as { status?: string })?.status }),
        (d) => (Array.isArray(d) ? estimateCredits("batch-geocoding", { items: d.length }) : 0),
      );
      seqs.push(r.seq);
      if (Array.isArray(data)) return { results: data as Array<GeocodeResult & { query?: { text?: string } }>, seqs };
    }
    throw new Error("batch geocoding: job did not finish in time");
  }

  /* ----------------------------- Places ------------------------------ */

  async places(o: { categories: string[]; filter: string; bias?: string; limit?: number; lang?: string; conditions?: string }): Promise<{ features: Array<Feature<PlaceProps>>; seq: number }> {
    const { data, record } = await this.request<FeatureCollection<PlaceProps>>(
      "places", "GET", "/v2/places",
      { categories: o.categories.join(","), filter: o.filter, bias: o.bias, limit: o.limit ?? 100, lang: o.lang ?? "vi", conditions: o.conditions },
      undefined,
      (d) => ({ count: d.features?.length ?? 0, categories: o.categories.join(",") }),
      (d) => estimateCredits("places", { results: d.features?.length ?? 0 }),
    );
    return { features: data.features ?? [], seq: record.seq };
  }

  /** Place Details — extra features such as walk_10 / drive_5 isochrones. */
  async placeDetails(o: { id?: string; lat?: number; lon?: number; features?: string[]; lang?: string }): Promise<{ features: Feature[]; seq: number }> {
    const { data, record } = await this.request<FeatureCollection>(
      "place-details", "GET", "/v2/place-details",
      { id: o.id, lat: o.lat, lon: o.lon, features: (o.features ?? ["details"]).join(","), lang: o.lang ?? "vi" },
      undefined,
      (d) => ({ features: (d.features ?? []).map((f) => String(f.properties?.feature_type ?? "?")).join(",") }),
      // 1 credit, plus 1 for each 5 minutes of an isochrone feature such as walk_10 / drive_5 (pricing-details)
      () => 1 + (o.features ?? []).reduce((s, f) => { const m = /^(walk|drive)_(\d+)$/.exec(f); return s + (m ? Math.ceil(Number(m[2]) / 5) : 0); }, 0),
    );
    return { features: data.features ?? [], seq: record.seq };
  }

  /* ----------------------------- Isoline ----------------------------- */

  /** Isoline (isochrone/isodistance). Polls when the API answers 202 pending. */
  async isoline(o: { lat: number; lon: number; mode: "walk" | "drive" | "bicycle" | "scooter" | "motorcycle" | "approximated_transit"; type?: "time" | "distance"; range: number; traffic?: "free_flow" | "approximated" }): Promise<{ feature: Feature; id: string; seq: number }> {
    const params: Params = { lat: o.lat, lon: o.lon, type: o.type ?? "time", mode: o.mode, range: o.range, traffic: o.traffic };
    for (let i = 0; i < 10; i++) {
      const { data, record } = await this.request<FeatureCollection & { properties?: { id?: string } }>(
        "isoline", "GET", "/v1/isoline", params, undefined,
        (d) => ({ mode: o.mode, range: o.range, type: o.type ?? "time", id: d.features?.[0]?.properties?.id ?? d.properties?.id, geometry: d.features?.[0]?.geometry?.type ?? "pending" }),
        () => estimateCredits("isoline", (o.type ?? "time") === "time" ? { range: o.range } : {}),
      );
      const f = data.features?.[0];
      if (f) return { feature: f, id: String(f.properties.id ?? ""), seq: record.seq };
      const pendingId = data.properties?.id;
      if (pendingId) params.id = pendingId;
      await sleep(1000);
    }
    throw new Error("isoline: still pending after 10 polls");
  }

  /** Several isochrone bands (e.g. 5/10/15 min) in ONE request; features sorted by range ascending. */
  async isolineBands(o: { lat: number; lon: number; mode: "walk" | "bicycle" | "scooter" | "motorcycle" | "drive"; ranges: number[] }): Promise<{ features: Feature[]; seq: number }> {
    const params: Params = { lat: o.lat, lon: o.lon, type: "time", mode: o.mode, range: o.ranges.join(",") };
    for (let i = 0; i < 10; i++) {
      const { data, record } = await this.request<FeatureCollection & { properties?: { id?: string } }>(
        "isoline", "GET", "/v1/isoline", params, undefined,
        (d) => ({ mode: o.mode, range: o.ranges.join(","), type: "time", bands: d.features?.length ?? 0, geometry: d.features?.length ? "bands" : "pending" }),
        () => estimateCredits("isoline", { ranges: o.ranges }),
      );
      if (data.features?.length) {
        const fs = [...data.features].sort((a, b) => Number(a.properties.range ?? 0) - Number(b.properties.range ?? 0));
        return { features: fs, seq: record.seq };
      }
      const pendingId = data.properties?.id;
      if (pendingId) params.id = pendingId;
      await sleep(1000);
    }
    throw new Error("isoline: still pending after 10 polls");
  }

  /* ----------------------------- Routing ----------------------------- */

  async routeMatrix(o: { sources: Array<{ lat: number; lon: number }>; targets: Array<{ lat: number; lon: number }>; mode: string; traffic?: "free_flow" | "approximated" }): Promise<{ timesS: number[][]; distancesM: number[][]; seq: number }> {
    const body = {
      mode: o.mode,
      traffic: o.traffic,
      sources: o.sources.map((p) => ({ location: [p.lon, p.lat] })),
      targets: o.targets.map((p) => ({ location: [p.lon, p.lat] })),
    };
    const { data, record } = await this.request<{ sources_to_targets?: Array<Array<{ time?: number | null; distance?: number | null }>> }>(
      "route-matrix", "POST", "/v1/routematrix", {}, body,
      (d) => ({ sources: o.sources.length, targets: o.targets.length, cells: (d.sources_to_targets ?? []).flat().length }),
      () => estimateCredits("route-matrix", { sources: o.sources.length, targets: o.targets.length }),
    );
    const rows = data.sources_to_targets ?? [];
    return {
      timesS: rows.map((r) => r.map((c) => (typeof c?.time === "number" ? c.time : NaN))),
      distancesM: rows.map((r) => r.map((c) => (typeof c?.distance === "number" ? c.distance : NaN))),
      seq: record.seq,
    };
  }

  async routing(o: { waypoints: Array<{ lat: number; lon: number }>; mode: string; traffic?: "free_flow" | "approximated" }): Promise<{ feature?: Feature<{ time?: number; distance?: number }>; seq: number }> {
    const { data, record } = await this.request<FeatureCollection<{ time?: number; distance?: number }>>(
      "routing", "GET", "/v1/routing",
      { waypoints: o.waypoints.map((p) => `${p.lat},${p.lon}`).join("|"), mode: o.mode, traffic: o.traffic, format: "geojson" },
      undefined,
      (d) => ({ timeS: d.features?.[0]?.properties?.time, distanceM: d.features?.[0]?.properties?.distance }),
      () => Math.max(1, o.waypoints.length - 1),
    );
    return { feature: data.features?.[0], seq: record.seq };
  }

  /* ---------------------------- Boundaries --------------------------- */

  async boundariesPartOf(lat: number, lon: number, o: { lang?: string; geometry?: "point" | "geometry_1000" | "geometry_5000" | "geometry_10000" } = {}): Promise<{ features: Feature[]; seq: number }> {
    const { data, record } = await this.request<FeatureCollection>(
      "boundaries", "GET", "/v1/boundaries/part-of",
      { lat, lon, lang: o.lang ?? "vi", geometry: o.geometry ?? "geometry_1000" },
      undefined,
      (d) => ({ levels: (d.features ?? []).map((f) => String(f.properties?.name ?? "?")).join(" ⊂ ") }),
      (d) => estimateCredits("boundaries", { results: d.features?.length ?? 0, geometry: o.geometry ?? "geometry_1000" }),
    );
    return { features: data.features ?? [], seq: record.seq };
  }

  async boundariesConsistsOf(id: string, o: { lang?: string; sublevel?: number } = {}): Promise<{ features: Feature[]; seq: number }> {
    const { data, record } = await this.request<FeatureCollection>(
      "boundaries", "GET", "/v1/boundaries/consists-of",
      { id, lang: o.lang ?? "vi", sublevel: o.sublevel, geometry: "geometry_1000" },
      undefined,
      (d) => ({ parts: d.features?.length ?? 0 }),
      (d) => estimateCredits("boundaries", { results: d.features?.length ?? 0, geometry: "geometry_1000" }),
    );
    return { features: data.features ?? [], seq: record.seq };
  }

  /* ---------------------------- Static Maps -------------------------- */

  /** Static map PNG/JPEG (POST body supports markers + GeoJSON overlays). */
  async staticMap(body: Record<string, unknown>): Promise<{ bytes: ArrayBuffer; seq: number }> {
    const { data, record } = await this.request<ArrayBuffer>(
      "static-maps", "POST", "/v1/staticmap", {}, body,
      (d) => ({ bytes: (d as ArrayBuffer).byteLength, width: body.width, height: body.height }),
      () => 1,
      true,
    );
    return { bytes: data, seq: record.seq };
  }
}
