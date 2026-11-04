# Cursor

## 1. Requirements

Install Node.js 20+ and Cursor. From the SiteScout checkout, run:

```sh
npm ci && npm run build
```

A free [Geoapify key](https://myprojects.geoapify.com) is optional for SiteScout.
Without `GEOAPIFY_API_KEY`, SiteScout uses the public HCMC demo proxy at
`https://sitescout.huynhthanh.workers.dev/geo`, with scope and daily limits.
`SITESCOUT_GEOAPIFY_BASE`, if set, overrides that base URL; unset it for the default behavior.
The separate Geoapify MCP server requires a key.

## 2. Add SiteScout's server

Command-line form: run this Node command in Bash (including Git Bash on Windows)
from the checkout. It merges SiteScout into `.cursor/mcp.json`, preserving other servers:

```sh
node <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const file = '.cursor/mcp.json';
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
config.mcpServers ??= {};
config.mcpServers.sitescout = {
  command: 'node', args: [path.resolve('dist/mcp-server.js')], env: {}
};
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
JS
```

Or edit `.cursor/mcp.json` (workspace) or `~/.cursor/mcp.json` (user) and merge:

```json
{
  "mcpServers": {
    "sitescout": {
      "command": "node",
      "args": ["/absolute/path/to/sitescout-agent/dist/mcp-server.js"],
      "env": {}
    }
  }
}
```

Use forward slashes in Windows JSON paths. For direct REST access, set the key before starting Cursor
and optionally map `"env": { "GEOAPIFY_API_KEY": "${env:GEOAPIFY_API_KEY}" }`.
Keep `env` empty for the key-free setup. The [Cursor MCP docs](https://cursor.com/docs/context/mcp)
describe configuration locations and `${env:NAME}` interpolation.

## 3. Add the Geoapify MCP server

The official endpoint uses streamable HTTP and the `x-api-key` header.
Set `GEOAPIFY_API_KEY` in Cursor's environment, then merge this entry alongside
`sitescout` under `mcpServers` in the same file:

```json
{
  "mcpServers": {
    "geoapify": {
      "url": "https://api.geoapify.com/v1/mcp",
      "headers": { "x-api-key": "${env:GEOAPIFY_API_KEY}" }
    }
  }
}
```

Cursor's `headers` field supports environment interpolation. Restart Cursor after changing its environment.
See [both servers together](geoapify-mcp-side-by-side.md) for their different roles.

## 4. Check it is connected

Open Cursor Settings → Tools & MCP. Enable `sitescout` and check its five tools:
`plan_site_question`, `scout_site`, `resolve_place`, `walk_isochrone`, `get_evidence`.
In Agent mode ask it to call `plan_site_question` first; this needs no Geoapify credits.
Check the `geoapify` connection separately with a key set.
Use [SYSTEM_PROMPT.md](../SYSTEM_PROMPT.md) as a Cursor rule.

## 5. One example question

> Where should I open a specialty coffee shop in Thảo Điền? Cite every number and retrieve the request behind the top site's competitor count.

Expected SiteScout tools: `plan_site_question` → `scout_site` → `get_evidence`.
These are expected calls, not a recorded Cursor session. Check `areaCheck` before explaining the result.

## 6. Troubleshooting

- Process fails to start: build first and check the absolute script path; use an absolute Node executable path if Node is missing from Cursor's PATH.
- Tools do not appear: check that the server is enabled and the config is valid JSON; restart Cursor after editing.
- Geoapify returns 401: use Cursor's `${env:GEOAPIFY_API_KEY}` syntax and make the variable available to the app before it starts.
- SiteScout reports a proxy quota error: wait for the daily reset or use your own key. The proxy accepts only HCMC requests.
