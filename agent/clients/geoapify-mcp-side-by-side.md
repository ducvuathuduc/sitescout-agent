# Using SiteScout next to the official Geoapify MCP server

Register both servers under different names in the same host:

| Server | Transport | Role | Key |
|---|---|---|---|
| `sitescout` | stdio: `node /absolute/path/to/sitescout-agent/dist/mcp-server.js` | Plan, rank sites using walking catchments, retrieve evidence | Optional; without it, uses the public HCMC demo proxy |
| `geoapify` | streamable HTTP: `https://api.geoapify.com/v1/mcp` | Geocoding, nearby places, routing and geometry follow-ups | Required, sent in `x-api-key` |

SiteScout has five tools: `plan_site_question`, `scout_site`, `resolve_place`,
`walk_isochrone`, `get_evidence` ([server source](../../src/mcp-server.ts)).
It calls Geoapify REST APIs internally; adding the official MCP server does not
change that. Without `GEOAPIFY_API_KEY`, its default base is
`https://sitescout.huynhthanh.workers.dev/geo` (HCMC only, daily caps).
`SITESCOUT_GEOAPIFY_BASE` overrides the base when set. The official Geoapify server has no key-free proxy mode.

## Choose your host

Each guide includes local setup, a Geoapify connection, connection checks and troubleshooting.
Use the header syntax for that host:

| Host | Guide | Config file | Geoapify header configuration |
|---|---|---|---|
| Claude Code | [Setup](claude-code.md) | `.mcp.json` | `type: "http"`, `headers` with `${GEOAPIFY_API_KEY}` |
| Cursor | [Setup](cursor.md) | `.cursor/mcp.json` or `~/.cursor/mcp.json` | `url`, `headers` with `${env:GEOAPIFY_API_KEY}` |
| Codex CLI | [Setup](codex.md) · [example](codex.config.example.toml) | `~/.codex/config.toml` | `env_http_headers` maps `x-api-key` to `GEOAPIFY_API_KEY` |
| Kiro | [Setup](kiro.md) · [example](kiro.mcp.example.json) | `.kiro/settings/mcp.json` or `~/.kiro/settings/mcp.json` | `url`, `headers` with `${GEOAPIFY_API_KEY}` |
| Claude Desktop | [Setup](claude-desktop.md) | `claude_desktop_config.json` | `mcp-remote` stdio bridge sends `x-api-key` over HTTP |

Do not copy a host's variable syntax into another host's file. Keep real keys out of
shared files; examples use `YOUR_KEY` or an environment variable reference.
Geoapify documents [the endpoint and API-key header](https://apidocs.geoapify.com/docs/mcp/).

## One question using both

> Where should I open a specialty coffee shop in Thảo Điền? Cite every number and retrieve the request behind the top site's competitor count. Then list the nearest cafés to the top site from Geoapify.

Expected calls: SiteScout `plan_site_question` → `scout_site` → `get_evidence`,
then Geoapify `search_places` using the top site's coordinates and `catering.cafe`.
The host may choose a different sequence. This is an expected session, not a recording.
The [existing transcripts](../README.md#recorded-transcripts-real-runs-2026-10-22)
used a separate host and open-weight models on Workers AI.

For MCP versus REST, the recorded tool surface and the evidence format, read
[docs/mcp.md](../../docs/mcp.md). To record a Claude Code session with both servers,
follow [record-claude-code.md](record-claude-code.md).
