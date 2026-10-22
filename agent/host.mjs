#!/usr/bin/env node
/**
 * Minimal MCP host used to record the AI transcripts in agent/transcripts/.
 *
 * It does what Claude Code / Cursor / Claude Desktop do: start the SiteScout
 * MCP server over stdio, hand its tool list to an LLM, execute the tool calls
 * the model makes, and feed results back until the model answers. Every
 * message, tool call and tool result is written to a JSONL transcript.
 *
 * LLM: any OpenAI-compatible chat-completions endpoint with tool calling.
 *   LLM_BASE_URL  e.g. https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1  (Workers AI, free tier)
 *                      https://api.groq.com/openai/v1
 *   LLM_MODEL     e.g. @cf/meta/llama-3.3-70b-instruct-fp8-fast
 *   LLM_API_KEY   bearer token (omit if a proxy injects it)
 *
 * Usage: node agent/host.mjs "<question>" agent/transcripts/<name>.jsonl
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [question, outFile = "agent/transcripts/run.jsonl"] = process.argv.slice(2);
if (!question) throw new Error('usage: node agent/host.mjs "<question>" <out.jsonl>');
const BASE = process.env.LLM_BASE_URL;
const MODEL = process.env.LLM_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
if (!BASE) throw new Error("set LLM_BASE_URL");

const system = readFileSync(new URL("./SYSTEM_PROMPT.md", import.meta.url), "utf8");
const lines = [];
const log = (o) => { lines.push(JSON.stringify({ ts: new Date().toISOString(), ...o })); };

const transport = new StdioClientTransport({ command: "node", args: ["dist/mcp-server.js"], env: process.env, stderr: "inherit" });
const client = new Client({ name: "sitescout-transcript-host", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
log({ type: "session", model: MODEL, server: client.getServerVersion(), tools: tools.map((t) => t.name) });

const oaTools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
const messages = [{ role: "system", content: system }, { role: "user", content: question }];
log({ type: "message", role: "user", content: question });

const clip = (s, n = 6000) => (s.length > n ? s.slice(0, n) + `… [truncated ${s.length - n} chars]` : s);

for (let step = 0; step < 10; step++) {
  const headers = { "content-type": "application/json" };
  if (process.env.LLM_API_KEY) headers.authorization = `Bearer ${process.env.LLM_API_KEY}`;
  const res = await fetch(`${BASE}/chat/completions`, { method: "POST", headers, body: JSON.stringify({ model: MODEL, messages, tools: oaTools, temperature: 0.2, max_tokens: 1500 }) });
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) { log({ type: "error", status: res.status, body: data }); break; }
  messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
  log({ type: "message", role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls?.map((c) => ({ name: c.function.name, arguments: c.function.arguments })) ?? [], usage: data.usage });
  if (!msg.tool_calls?.length) break;
  for (const call of msg.tool_calls) {
    let args = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* model sent bad JSON */ }
    const started = Date.now();
    let text;
    try {
      const r = await client.callTool({ name: call.function.name, arguments: args });
      // send the model the structured result when present (smaller, typed)
      text = JSON.stringify(r.structuredContent ?? r.content);
      const full = r.structuredContent ?? r.content;
      const js = JSON.stringify(full);
      log({ type: "tool_result", name: call.function.name, arguments: args, isError: !!r.isError, ms: Date.now() - started, result: js.length <= 20000 ? full : clip(js, 20000) });
    } catch (e) {
      text = JSON.stringify({ error: String(e?.message ?? e) });
      log({ type: "tool_result", name: call.function.name, arguments: args, isError: true, ms: Date.now() - started, result: { error: String(e?.message ?? e) } });
    }
    messages.push({ role: "tool", tool_call_id: call.id, content: clip(text) });
  }
}
await client.close();
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join("\n") + "\n");
console.log(`wrote ${outFile} (${lines.length} events)`);
