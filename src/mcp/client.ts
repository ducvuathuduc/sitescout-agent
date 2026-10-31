/**
 * JSON-RPC 2.0 client for the Geoapify MCP server (Streamable HTTP).
 *
 * Endpoint : https://api.geoapify.com/v1/mcp
 * Auth     : `x-api-key: <GEOAPIFY_API_KEY>` request header
 * Protocol : initialize → notifications/initialized → tools/list → tools/call
 *            (MCP protocol version 2025-06-18; session id carried in the
 *            Mcp-Session-Id header when the server issues one).
 *
 * This is the ONLY network boundary of the agent runtime. Every Geoapify
 * capability the agent uses flows through these 11 MCP tools — there is no
 * REST fallback in this module (see docs/FEEDBACK.md#1 for the one
 * capability we deliberately do NOT get from MCP: drive-time isochrones).
 *
 * Robustness:
 *  - args are validated against per-tool zod schemas BEFORE any request
 *    (src/mcp/schemas.ts) — a wrong shape fails fast, never as a wasted credit;
 *  - HTTP 429 / 5xx / network timeouts → exponential backoff, 3 attempts, jitter;
 *  - HTTP 401 → fail fast (bad key; retrying is pointless);
 *  - MCP `isError: true` → surfaced, never retried (validation failure).
 */
import { z } from "zod";
import { validateToolArgs } from "./schemas.js";

export const MCP_ENDPOINT = "https://api.geoapify.com/v1/mcp";
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** The complete Geoapify MCP tool surface (11 tools, verified 2026-10). */
export const MCP_TOOL_NAMES = [
  "geocode_address",
  "geocode_structured_address",
  "reverse_geocode_coordinates",
  "search_places",
  "list_place_categories",
  "calculate_route",
  "calculate_route_matrix",
  "combine_geometries",
  "evaluate_spatial_relation",
  "measure_geometry",
  "transform_geometry",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(JsonValue),
  ]),
);

/** Tool arguments are generic JSON; per-tool shapes are enforced via schemas.ts. */
export const ToolArgsSchema = z.record(JsonValue);
export type ToolArgs = z.infer<typeof ToolArgsSchema>;

export interface ToolCallResult {
  /** Raw `result` payload of the JSON-RPC response (MCP content blocks). */
  result: unknown;
  /** True when the MCP server returned an error instead of a result. */
  isError: boolean;
}

export class McpError extends Error {
  constructor(
    readonly code: number | string,
    message: string,
    readonly data?: unknown,
  ) {
    super(`MCP error ${code}: ${message}`);
    this.name = "McpError";
  }
}

export interface McpClientOptions {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  /** Max attempts for retryable failures (default 3). */
  maxAttempts?: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number | string; message: string; data?: unknown };
}

/** Detect `{statusCode>=400, message}` payloads inside an MCP text block. */
export function upstreamError(result: unknown): { statusCode: number; message: string } | undefined {
  const blocks = (result as { content?: Array<{ text?: unknown }> }).content;
  const text = Array.isArray(blocks) ? blocks.find((b) => typeof b?.text === "string")?.text : undefined;
  if (typeof text !== "string" || !text.includes("statusCode")) return undefined;
  try {
    const o = JSON.parse(text) as { statusCode?: unknown; message?: unknown };
    if (typeof o.statusCode === "number" && o.statusCode >= 400) {
      return { statusCode: o.statusCode, message: String(o.message ?? "") };
    }
  } catch {
    /* not JSON */
  }
  return undefined;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export class GeoapifyMcpClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private nextId = 1;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(opts: McpClientOptions) {
    if (!opts.apiKey) throw new Error("GeoapifyMcpClient: apiKey is required");
    this.apiKey = opts.apiKey;
    this.endpoint = opts.endpoint ?? MCP_ENDPOINT;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  /** MCP handshake: initialize → notifications/initialized. Idempotent. */
  async ensureSession(): Promise<void> {
    if (this.initialized) return;
    const init = await this.rawRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "sitescout-agent", version: "0.1.0" },
    });
    const serverVersion = (init as { protocolVersion?: string } | null)?.protocolVersion;
    if (serverVersion && serverVersion !== MCP_PROTOCOL_VERSION) {
      throw new McpError(
        -32600,
        `MCP protocol version mismatch: server=${serverVersion}, client=${MCP_PROTOCOL_VERSION}`,
      );
    }
    // Notification: no id, no response body expected (HTTP 202 on the wire).
    await this.rawRequest("notifications/initialized", undefined, {
      notification: true,
    });
    this.initialized = true;
  }

  private toolsCache: Array<{ name: string; description?: string }> | null = null;

  /** List tools advertised by the server (cached per client instance). */
  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    if (this.toolsCache) return this.toolsCache;
    await this.ensureSession();
    const res = await this.rawRequest("tools/list", {});
    const tools = (res as { tools?: Array<{ name: string; description?: string }> })
      .tools;
    if (!Array.isArray(tools))
      throw new McpError(-32603, "tools/list returned no tools array");
    this.toolsCache = tools;
    return tools;
  }

  /**
   * Assert the live server advertises exactly the 11 verified tools.
   * Aborts before any credit is spent when the surface has drifted.
   */
  async assertToolSurface(): Promise<void> {
    const names = new Set((await this.listTools()).map((t) => t.name));
    const missing = MCP_TOOL_NAMES.filter((n) => !names.has(n));
    if (missing.length > 0) {
      throw new McpError(
        -32603,
        `MCP tool surface drift: missing ${missing.join(", ")}. ` +
          `Aborting — run \`sitescout smoke\` to re-check the live tool surface (docs/mcp-reference.md).`,
      );
    }
  }

  /**
   * Call one MCP tool. Args are validated against the per-tool zod schema
   * BEFORE the request is sent. Retryable HTTP/network failures are retried
   * with exponential backoff + jitter; 401 fails fast; isError is surfaced.
   */
  async callTool(name: McpToolName, args: ToolArgs): Promise<ToolCallResult> {
    const validated = validateToolArgs(name, args) as ToolArgs;
    await this.ensureSession();
    const res = (await this.rawRequest("tools/call", {
      name,
      arguments: validated,
    })) as { content?: unknown; structuredContent?: unknown; isError?: boolean };
    // Keep the whole MCP result object ({content, structuredContent}); the
    // parsers in results.ts read structuredContent first, then the text block.
    // (v0.1 returned res.content — a bare array — which every parser rejected.)
    const result = Array.isArray(res.content)
      ? { content: res.content, structuredContent: res.structuredContent }
      : res;
    // Geoapify reports upstream 4xx (e.g. unsupported category) as a text
    // block {statusCode:400,...} with isError=false — surface it as an error.
    const upstream = upstreamError(result);
    return { result, isError: res.isError === true || upstream !== undefined };
  }

  private async rawRequest(
    method: string,
    params: unknown,
    opts: { notification?: boolean } = {},
  ): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.postOnce(method, params, opts.notification === true);
      } catch (err) {
        if (attempt >= this.maxAttempts || !isRetryable(err)) throw err;
        // Exponential backoff with jitter: 500ms, 1000ms, 2000ms × (0.5–1.5).
        const delay = 500 * 2 ** (attempt - 1) * (0.5 + Math.random());
        await sleep(delay);
      }
    }
  }

  private async postOnce(
    method: string,
    params: unknown,
    notification: boolean,
  ): Promise<unknown> {
    const id = notification ? undefined : this.nextId++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": this.apiKey,
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      };
      if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
      const body: Record<string, unknown> = { jsonrpc: "2.0", method };
      if (id !== undefined) body.id = id;
      if (params !== undefined) body.params = params;
      const http = await fetch(this.endpoint, {
        method: "POST",
        signal: ctrl.signal,
        headers,
        body: JSON.stringify(body),
      });
      const session = http.headers.get("mcp-session-id");
      if (session) this.sessionId = session;
      if (http.status === 401) {
        throw new McpError(401, "HTTP 401 from MCP endpoint — invalid API key (fail fast, no retry)");
      }
      if (!http.ok) {
        throw new McpError(http.status, `HTTP ${http.status} from MCP endpoint`);
      }
      if (notification) return null; // HTTP 202, no body
      const payload = (await http.json()) as JsonRpcResponse;
      if (payload.error) {
        throw new McpError(
          payload.error.code,
          payload.error.message,
          payload.error.data,
        );
      }
      return payload.result;
    } catch (err) {
      if (err instanceof McpError) throw err;
      throw new McpError(
        "NETWORK",
        `network/timeout calling ${method}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Retryable: 429/5xx HTTP and network/timeout failures. 401 never retries. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof McpError)) return false;
  if (err.code === 401) return false;
  if (err.code === "NETWORK") return true;
  return typeof err.code === "number" && (err.code === 429 || err.code >= 500);
}
