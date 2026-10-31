#!/usr/bin/env node
/**
 * Reproduce one Geoapify MCP session against the live server:
 *   initialize -> notifications/initialized -> tools/list -> tools/call (search_places)
 *
 * Mirrors src/mcp/client.ts (headers, session id, protocol check, upstream-error check).
 * No dependencies. Node 18+ (uses global fetch and AbortSignal.timeout).
 *
 * Usage:
 *   PowerShell:  $env:GEOAPIFY_API_KEY = "<your key>"; node scripts/mcp-example.mjs
 *   bash:        GEOAPIFY_API_KEY=<your key> node scripts/mcp-example.mjs
 *
 * The tools/call spends credits. The key is read from the environment only and is never printed.
 */

const ENDPOINT = "https://api.geoapify.com/v1/mcp";
const PROTOCOL_VERSION = "2025-06-18";
// The 11 tools SiteScout's `ask` pipeline uses (MCP_TOOL_NAMES in src/mcp/client.ts). The server may list more,
// e.g. get_timezone in Geoapify's 2026-10-31 tool index.
const USED_TOOLS = [
  "geocode_address", "geocode_structured_address", "reverse_geocode_coordinates", "search_places",
  "list_place_categories", "calculate_route", "calculate_route_matrix", "combine_geometries",
  "evaluate_spatial_relation", "measure_geometry", "transform_geometry",
];
const SEARCH_ARGS = {
  category: "catering.cafe",
  lat: 10.8034834,
  lon: 106.7375412,
  radius_meters: 800,
  limit: 5,
};

const apiKey = process.env.GEOAPIFY_API_KEY;
if (!apiKey) {
  console.error("GEOAPIFY_API_KEY is not set. Export it and run again. No request was sent.");
  process.exit(1);
}

let nextId = 1;
let sessionId = null;

function fail(message) {
  console.error(`mcp-example: ${message}`);
  process.exit(1);
}

/** A JSON body is one message. A text/event-stream body carries one `data:` line per message. */
function messagesFrom(text, contentType) {
  if (!contentType.includes("text/event-stream")) return [JSON.parse(text)];
  const dataLines = text.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) return [JSON.parse(text)];
  return dataLines.map((line) => JSON.parse(line.slice("data:".length).trim()));
}

/** Same rule as upstreamError() in src/mcp/client.ts: an upstream 4xx arrives as a text block. */
function upstreamError(result) {
  const block = result?.content?.find((b) => typeof b?.text === "string");
  if (!block || !block.text.includes("statusCode")) return undefined;
  try {
    const body = JSON.parse(block.text);
    if (typeof body.statusCode === "number" && body.statusCode >= 400) {
      return { statusCode: body.statusCode, message: String(body.message ?? "") };
    }
  } catch {
    /* not JSON: not an upstream error */
  }
  return undefined;
}

async function rpc(method, params) {
  const isNotification = method.startsWith("notifications/");
  const id = isNotification ? undefined : nextId++;
  const body = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
  if (params !== undefined) body.params = params;

  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-api-key": apiKey,
    "MCP-Protocol-Version": PROTOCOL_VERSION,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const issued = res.headers.get("mcp-session-id");
  if (issued) sessionId = issued;
  if (res.status === 401) fail("HTTP 401: the key was rejected. Check GEOAPIFY_API_KEY.");
  if (!res.ok) fail(`HTTP ${res.status} on ${method}.`);
  if (isNotification) return null; // the server answers 202 with no body

  const text = await res.text();
  const reply = messagesFrom(text, res.headers.get("content-type") ?? "").find((m) => m.id === id);
  if (!reply) fail(`no JSON-RPC reply with id ${id} for ${method}.`);
  if (reply.error) fail(`${method} returned error ${reply.error.code}: ${reply.error.message}`);
  return reply.result;
}

async function main() {
  const init = await rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "sitescout-mcp-example", version: "0.1.0" },
  });
  if (init?.protocolVersion && init.protocolVersion !== PROTOCOL_VERSION) {
    fail(`protocol mismatch: server=${init.protocolVersion}, client=${PROTOCOL_VERSION}`);
  }
  console.log(`initialize: protocol ${init?.protocolVersion ?? "(not reported)"}, session ${sessionId ? "issued" : "not issued"}`);

  await rpc("notifications/initialized");
  console.log("notifications/initialized: sent");

  const list = await rpc("tools/list", {});
  const names = (list.tools ?? []).map((t) => t.name);
  console.log(`tools/list: ${names.length} tools`);
  console.log(`  ${names.join(", ")}`);
  const missing = USED_TOOLS.filter((n) => !names.includes(n));
  if (missing.length) console.warn(`warning: tools SiteScout uses are missing: ${missing.join(", ")}`);
  if (!names.includes("search_places")) fail("search_places is not in tools/list.");

  console.log(`tools/call search_places arguments: ${JSON.stringify(SEARCH_ARGS)}`);
  const call = await rpc("tools/call", { name: "search_places", arguments: SEARCH_ARGS });
  const upstream = upstreamError(call);
  if (call.isError || upstream) {
    const why = upstream ? `${upstream.statusCode} ${upstream.message}` : "isError=true";
    fail(`search_places failed: ${why}`);
  }

  const textBlock = call.content?.find((b) => typeof b?.text === "string");
  const data = call.structuredContent ?? (textBlock ? JSON.parse(textBlock.text) : undefined);
  if (!data || !Array.isArray(data.results)) fail("search_places returned no results array.");
  console.log(`result: count=${data.count}, returned=${data.results.length}`);
  for (const place of data.results) {
    console.log(`  - ${place.name} | ${place.lat}, ${place.lon} | ${place.distance} m`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
