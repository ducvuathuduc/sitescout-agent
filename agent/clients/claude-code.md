# Claude Code

## 1. Requirements

Install Node.js 20+ and Claude Code. From the SiteScout checkout, run:

```sh
npm ci && npm run build
```

A free [Geoapify key](https://myprojects.geoapify.com) is optional for SiteScout.
Without `GEOAPIFY_API_KEY`, SiteScout uses the public HCMC demo proxy at
`https://sitescout.huynhthanh.workers.dev/geo`, with scope and daily limits.
`SITESCOUT_GEOAPIFY_BASE`, if set, overrides that base URL; unset it for the default behavior.
The separate Geoapify MCP server requires a key.

## 2. Add SiteScout's server

CLI form, using an absolute path:

```sh
claude mcp add --scope project --transport stdio sitescout -- node "/absolute/path/to/sitescout-agent/dist/mcp-server.js"
```

Alternatively, merge this into `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "sitescout": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/sitescout-agent/dist/mcp-server.js"],
      "env": {}
    }
  }
}
```

Use forward slashes in Windows JSON paths, such as `C:/work/sitescout-agent/dist/mcp-server.js`.
For direct REST access, set `GEOAPIFY_API_KEY` before launching Claude Code;
you can explicitly forward it with `"env": { "GEOAPIFY_API_KEY": "${GEOAPIFY_API_KEY}" }`.
Keep `env` empty for the key-free setup. See the [Claude Code MCP docs](https://code.claude.com/docs/en/mcp).

## 3. Add the Geoapify MCP server

The official endpoint uses streamable HTTP and the `x-api-key` header.
After setting `GEOAPIFY_API_KEY` in your environment, run this in Bash or PowerShell
(single quotes preserve the variable reference for the host):

```sh
claude mcp add --scope project --transport http geoapify https://api.geoapify.com/v1/mcp --header 'x-api-key: ${GEOAPIFY_API_KEY}'
```

Or merge this entry alongside `sitescout` under `mcpServers` in `.mcp.json`:

```json
{
  "mcpServers": {
    "geoapify": {
      "type": "http",
      "url": "https://api.geoapify.com/v1/mcp",
      "headers": { "x-api-key": "${GEOAPIFY_API_KEY}" }
    }
  }
}
```

Claude Code expands environment references in `.mcp.json` headers. See
[both servers together](geoapify-mcp-side-by-side.md) for their different roles.

## 4. Check it is connected

```sh
claude mcp list
```

Start Claude Code in the project, approve the project servers when prompted, and run `/mcp`.
Check `sitescout` is connected with five tools: `plan_site_question`, `scout_site`,
`resolve_place`, `walk_isochrone`, `get_evidence`. Ask it to call `plan_site_question`
first; this needs no Geoapify credits. Check `geoapify` separately with a key set.
Use [SYSTEM_PROMPT.md](../SYSTEM_PROMPT.md) as instructions in `CLAUDE.md`.

## 5. One example question

> Where should I open a specialty coffee shop in Thảo Điền? Cite every number and retrieve the request behind the top site's competitor count.

Expected SiteScout tools: `plan_site_question` → `scout_site` → `get_evidence`.
These are expected calls, not a recorded Claude Code session. Check `areaCheck` before explaining the result.

## 6. Troubleshooting

- Process fails to start: build first and check the absolute script path; use an absolute Node executable path if Node is missing from Claude Code's PATH.
- Server is missing: run Claude Code in the project containing `.mcp.json` and approve the project server in `/mcp`.
- Geoapify returns 401: make the key available before launching Claude Code and check `x-api-key`; Geoapify does not use an OAuth login here.
- SiteScout reports a proxy quota error: wait for the daily reset or use your own key. Check that the question is within HCMC.
