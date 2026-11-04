# AI layer: SiteScout as an MCP server

SiteScout's MCP server runs as `node dist/mcp-server.js` over stdio and offers five tools for
site-selection analysis in Ho Chi Minh City. Claude Code, Cursor, Codex CLI, Kiro and Claude Desktop
can run it next to the official Geoapify MCP server. The engine calls Geoapify REST APIs and returns
evidence references; the host model plans the question and explains the result. A Geoapify key is
optional for SiteScout, which defaults to the public HCMC demo proxy without one; the official
Geoapify MCP server requires a key.

| Tool | What it does | Geoapify APIs behind it | Credits |
|---|---|---|---|
| `plan_site_question` | question → validated plan (business, categories, area, walk minutes, origins) | none (category catalog is bundled) | 0 |
| `scout_site` | full analysis → ranked shortlist, isochrones, `[Tn]` citations, `areaCheck`, `topCandidateCalls` | Autocomplete, Geocoding, Reverse, Boundaries, Isoline, Places, Route Matrix, Routing, Place Details | ~85–140 |
| `resolve_place` | Vietnamese place text → best match + confidence | Autocomplete, Geocoding | 1–3 |
| `walk_isochrone` | point + minutes → isoline polygon | Isoline | 1 per 5 minutes (10 min = 2) |
| `get_evidence` | `[Tn]` → the exact request (no key), status, summary | none (reads the last run) | 0 |

Every tool declares an `outputSchema` and returns `structuredContent`.

Which Geoapify calls sit behind each tool, and where the Geoapify MCP server is used instead of REST:
[docs/mcp.md](../docs/mcp.md).

## Setup per client

- [Claude Code](clients/claude-code.md)
- [Cursor](clients/cursor.md)
- [Codex CLI](clients/codex.md) · [config example](clients/codex.config.example.toml)
- [Kiro](clients/kiro.md) · [config example](clients/kiro.mcp.example.json)
- [Claude Desktop](clients/claude-desktop.md)
- [Next to the official Geoapify MCP server](clients/geoapify-mcp-side-by-side.md)
- System prompt / project instructions: [`SYSTEM_PROMPT.md`](SYSTEM_PROMPT.md)

No Geoapify key? Leave `GEOAPIFY_API_KEY` unset and the server uses the public demo proxy
(`https://sitescout.huynhthanh.workers.dev/geo`, HCMC only, daily caps).

## Recorded transcripts (real runs)

Sessions 01 to 03c in [`transcripts/`](transcripts/) were recorded with [`host.mjs`](host.mjs), a ~90-line MCP host
that does what Claude Code / Cursor do (stdio server, tool list → model, execute calls, loop). The models are
open-weight models on Cloudflare Workers AI (free tier), so anyone can reproduce them at $0.

Sessions 04a and 04b were recorded on 2026-11-04 with **Codex CLI 0.166.0** (`codex exec --json`, model
`gpt-6.1-sol` from the Codex config), with SiteScout's server and the official Geoapify MCP server connected at the
same time ([config](clients/codex.config.example.toml)). They are not Claude Code or Cursor recordings; those hosts
use the same two servers with the configs in their guides. The walk-through is in
[docs/mcp.md](../docs/mcp.md#recorded-two-server-session-04b-codex-cli).

We kept the failed sessions on purpose: they are why the server looks the way it does.

| File | Model | Outcome | What we changed because of it |
|---|---|---|---|
| `01-thaodien-coffee-en.jsonl` | Llama 3.3 70B | ✅ correct shortlist, cited | — (note: the model garbled "Thảo Điền" → "Thàở Điện" in its tool call; Geoapify autocomplete still resolved Phường An Khánh) |
| `02a-binhthanh-pharmacy-vi-llama-garbled-area.jsonl` | Llama 3.3 70B | ❌ model garbled "Bình Thạnh" in the tool call, analysis landed in **Phường Tân Sơn Nhất**, model still said "Bình Thạnh" | Added `areaCheck` (resolved area must share a token with the requested area) + a ⚠️ banner; prompt rule "copy the question verbatim" |
| `02b-…-invalid-category.jsonl` | Llama 4 Scout 17B | ❌ model invented categories ("Nhà thuốc") and called `scout_site` before reading the plan; run failed | `scout_site` now drops invalid category overrides with a note and keeps the planner's validated ones (`mergeOverrides`) |
| `02c-…-no-tool-calls-hallucinated.jsonl` | Llama 4 Scout 17B | ❌ model printed tool calls as text and invented an answer with fake `[T1]` refs | Nothing server-side can fix this; documented as a model limitation. Use a model with reliable tool calling |
| `02d-binhthanh-pharmacy-vi.jsonl` | Mistral Small 3.1 24B | ✅ correct area (Phường Thạnh Mỹ Tây, around Hàng Xanh), Vietnamese answer, cited, limitations reported | — |
| `03a-saigon-lunch-evidence-en-wrong-ref.jsonl` | Mistral Small 3.1 | ⚠️ ranking right, but cited a reverse-geocode call as the source of a competitor count | Each candidate now has `evidence: {label, isochrone, poiCounts, driveTimes}` |
| `03b-…-invented-endpoint.jsonl` | Mistral Small 3.1 | ❌ instead of calling `get_evidence`, wrote a plausible but **fake** Places URL (`filter=circle:…`) | `scout_site` returns `topCandidateCalls` (the real requests); prompt: "Never write a Geoapify URL yourself" |
| `03c-saigon-lunch-evidence-en.jsonl` | Mistral Small 3.1 | ✅ honoured the 7-minute walk override, quoted the real `geometry:<isoline id>` Places request | — |
| `04a-thaodien-coffee-codex-two-servers-web-search.jsonl` | Codex CLI, gpt-6.1-sol | ⚠️ with web search on, the model never called SiteScout; it used 8 web searches and 3 Geoapify MCP tools and picked a site from news articles | Recorded question now names the SiteScout tools; the 04b run turns web search off |
| `04b-thaodien-coffee-codex-two-servers.jsonl` | Codex CLI, gpt-6.1-sol | ✅ both servers: SiteScout `plan_site_question` → `scout_site` → Geoapify `list_place_categories`, `search_places` → SiteScout `get_evidence` ×6; every number cited | Reported the full category-list cost as [FEEDBACK.md](../docs/FEEDBACK.md) #7 |

### What worked
- The plan → scout → explain loop with a typed plan schema: models reliably override one or two fields
  (walk minutes, area) when the user asks.
- Returning `structuredContent` with refs per metric: the model's citations became correct once each number had
  an obvious ref next to it.
- Geoapify autocomplete is tolerant of the diacritic damage small models do to Vietnamese text.

### What was difficult / needed human correction
- Small open models mangle Vietnamese diacritics inside tool arguments (Llama 3.3) — silent wrong-area runs are the
  worst failure mode for a location tool, hence `areaCheck`.
- Models reconstruct API URLs from memory rather than calling an evidence tool. Put the evidence in the main result.
- Some models on some providers emit tool calls as plain text (Llama 4 Scout here); hosts must not treat that as an
  answer.

Reproduce:

```bash
npm ci && npm run build
export LLM_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1 LLM_API_KEY=<CF_TOKEN>
export LLM_MODEL=@cf/mistralai/mistral-small-3.1-24b-instruct GEOAPIFY_API_KEY=<KEY>
node agent/host.mjs "Where should I open a pharmacy in Bình Thạnh?" agent/transcripts/mine.jsonl
```
