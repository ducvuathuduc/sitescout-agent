# AI layer: SiteScout as an MCP server

SiteScout ships its own MCP server (`dist/mcp-server.js`, stdio) so any MCP host can run a
cited site-selection analysis on Geoapify. The deterministic engine does the geography; the model
only plans, asks for the analysis, and explains it. **"AI proposes, engine verifies."**

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
- [Claude Desktop](clients/claude-desktop.md)
- [Next to the official Geoapify MCP server](clients/geoapify-mcp-side-by-side.md)
- System prompt / project instructions: [`SYSTEM_PROMPT.md`](SYSTEM_PROMPT.md)

No Geoapify key? Leave `GEOAPIFY_API_KEY` unset and the server uses the public demo proxy
(`https://sitescout.huynhthanh.workers.dev/geo`, HCMC only, daily caps).

## Recorded transcripts (real runs, 2026-10-22)

The transcripts in [`transcripts/`](transcripts/) were recorded with [`host.mjs`](host.mjs), a ~90-line MCP host
that does what Claude Code / Cursor do (stdio server, tool list → model, execute calls, loop). The models are
open-weight models on Cloudflare Workers AI (free tier), so anyone can reproduce them at $0. They are **not**
Claude/Cursor recordings — the client guides above show those setups, but we did not record sessions in them.

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
