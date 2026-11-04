# Codex CLI

## 1. Requirements

Install Node.js 20+ and Codex CLI. From the SiteScout checkout, run:

```sh
npm ci && npm run build
```

A free [Geoapify key](https://myprojects.geoapify.com) is optional for SiteScout.
Without `GEOAPIFY_API_KEY`, SiteScout uses the public HCMC demo proxy at
`https://sitescout.huynhthanh.workers.dev/geo`, with scope and daily limits.
`SITESCOUT_GEOAPIFY_BASE`, if set, overrides that base URL; unset it for the default behavior.
The separate Geoapify MCP server requires a key.

## 2. Add SiteScout's server

CLI form, using an absolute path (works in PowerShell or a POSIX shell):

```sh
codex mcp add sitescout -- node "/absolute/path/to/sitescout-agent/dist/mcp-server.js"
```

Alternatively, merge this into `~/.codex/config.toml` (or `$CODEX_HOME/config.toml`
when you have set a custom home):

```toml
[mcp_servers.sitescout]
command = "node"
args = ["/absolute/path/to/sitescout-agent/dist/mcp-server.js"]
env = {}
env_vars = ["GEOAPIFY_API_KEY"]
tool_timeout_sec = 180
```

`command` and `args` launch the stdio process. `env` sets explicit process variables;
`env_vars` forwards named variables from Codex's environment. Leave the key unset for
the proxy, or set `GEOAPIFY_API_KEY` in the environment before launching Codex for direct REST access.
Use forward slashes in Windows TOML paths, for example `C:/work/sitescout-agent/dist/mcp-server.js`.

## 3. Add the Geoapify MCP server

The official endpoint uses streamable HTTP and the `x-api-key` header.
Set `GEOAPIFY_API_KEY` in the environment before launching Codex, then run:

```sh
codex mcp add geoapify --url https://api.geoapify.com/v1/mcp
```

Add the header mapping to the resulting table in `config.toml`:

```toml
[mcp_servers.geoapify]
url = "https://api.geoapify.com/v1/mcp"
env_http_headers = { "x-api-key" = "GEOAPIFY_API_KEY" }
```

The [complete example](codex.config.example.toml) includes both servers.
`http_headers = { "x-api-key" = "YOUR_KEY" }` is the static-value alternative;
prefer `env_http_headers` to keep the key out of the file.
`bearer_token_env_var` reads a variable for an `Authorization: Bearer` header;
it does not supply Geoapify's `x-api-key` header. The installed CLI's `mcp add`
has no custom-header flag, so the URL command alone does not finish authentication.
These fields are described in the [official OpenAI documentation](https://developers.openai.com/codex/mcp).
The add/list flags were checked with Codex CLI 0.166.0.

## 4. Check it is connected

```sh
codex mcp list
```

This lists configuration, not a successful handshake. Restart Codex, run `/mcp`,
and check that `sitescout` offers these five tools:
`plan_site_question`, `scout_site`, `resolve_place`, `walk_isochrone`, `get_evidence`.
Ask it to call `plan_site_question` first; this needs no Geoapify credits.
Check `geoapify` separately in `/mcp` after setting the key.
Use [SYSTEM_PROMPT.md](../SYSTEM_PROMPT.md) as project instructions.

## 5. One example question

> Where should I open a specialty coffee shop in Thảo Điền? Cite every number and retrieve the request behind the top site's competitor count.

Expected SiteScout tools: `plan_site_question` → `scout_site` → `get_evidence`. Check `areaCheck` before
explaining the result.

A real Codex session with both servers is recorded in
[04b-thaodien-coffee-codex-two-servers.jsonl](../transcripts/04b-thaodien-coffee-codex-two-servers.jsonl)
(2026-11-04, Codex CLI 0.166.0) and walked through in
[docs/mcp.md](../../docs/mcp.md#recorded-two-server-session-04b-codex-cli). To record your own, run one question
with `codex exec --json` and these servers configured. With web search on, the model may skip SiteScout (session
04a), so name the SiteScout tools in the question or add `web_search = "disabled"` to `config.toml`.

## 6. Troubleshooting

- Process fails to start: build first and check the absolute script path; use an absolute Node executable path if Node is missing from Codex's PATH.
- Geoapify returns 401: restart Codex with `GEOAPIFY_API_KEY` available and check the `env_http_headers` mapping. OAuth login does not replace this header.
- SiteScout gets a proxy quota error: wait for the daily reset or provide your own key. Configuration listing does not test proxy availability.
- A full analysis times out: the example raises `tool_timeout_sec` to 180; restart Codex after editing it.
