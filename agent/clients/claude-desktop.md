# Claude Desktop

## 1. Requirements

Install Node.js 20+ and Claude Desktop. From the SiteScout checkout, run:

```sh
npm ci && npm run build
```

A free [Geoapify key](https://myprojects.geoapify.com) is optional for SiteScout.
Without `GEOAPIFY_API_KEY`, SiteScout uses the public HCMC demo proxy at
`https://sitescout.huynhthanh.workers.dev/geo`, with scope and daily limits.
`SITESCOUT_GEOAPIFY_BASE`, if set, overrides that base URL; unset it for the default behavior.
The separate Geoapify MCP server requires a key. Its setup below also downloads
the [mcp-remote bridge](https://github.com/punkpeye/mcp-remote) through npm.

## 2. Add SiteScout's server

Claude Desktop's local-server setup uses `claude_desktop_config.json`:
Windows `%APPDATA%\Claude\claude_desktop_config.json`, or
macOS `~/Library/Application Support/Claude/claude_desktop_config.json`.
Open it through Settings → Developer → Edit Config.

Command-line form: run this Node command in Bash (Git Bash on Windows) from the checkout.
It merges SiteScout into the Desktop config, preserving other servers:

```sh
node <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Use Windows or macOS');
const base = process.platform === 'win32' ? process.env.APPDATA : path.join(os.homedir(), 'Library/Application Support');
const file = path.join(base, 'Claude', 'claude_desktop_config.json');
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
config.mcpServers ??= {};
config.mcpServers.sitescout = {
  command: 'node', args: [path.resolve('dist/mcp-server.js')], env: {}
};
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
JS
```

Or merge this JSON manually:

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

Use forward slashes in Windows JSON paths. Leave `env` empty for the proxy.
For direct REST access, make `GEOAPIFY_API_KEY` available to the Desktop process before starting it,
or explicitly set `"env": { "GEOAPIFY_API_KEY": "YOUR_KEY" }` in your private config.
See [Claude's local-server guidance](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

## 3. Add the Geoapify MCP server

The official endpoint uses streamable HTTP and the `x-api-key` header.
Use a stdio bridge for the local-server JSON format. Merge this entry alongside `sitescout`:

```json
{
  "mcpServers": {
    "geoapify": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://api.geoapify.com/v1/mcp",
        "--transport", "http-only", "--header", "x-api-key:${GEOAPIFY_API_KEY}"
      ]
    }
  }
}
```

On Windows, use `"command": "cmd"` and prepend `"/c", "npx"` to the `args` array.
Make the key available in the environment inherited by Desktop, or add
`"env": { "GEOAPIFY_API_KEY": "YOUR_KEY" }` to the bridge entry in your private config.
Here `${GEOAPIFY_API_KEY}` is expanded by **mcp-remote**, as its README documents;
this does not assume Desktop expands variables in JSON. The bridge talks HTTP upstream while Desktop talks stdio to it.

## 4. Check it is connected

Fully quit and reopen Claude Desktop. In Settings → Developer inspect the local servers,
then open a chat's tools menu. Check `sitescout` has five tools: `plan_site_question`,
`scout_site`, `resolve_place`, `walk_isochrone`, `get_evidence`.
Ask it to call `plan_site_question` first; this needs no Geoapify credits.
Check `geoapify` separately with a key set. Paste [SYSTEM_PROMPT.md](../SYSTEM_PROMPT.md)
into project instructions or the chat.

## 5. One example question

> Where should I open a specialty coffee shop in Thảo Điền? Cite every number and retrieve the request behind the top site's competitor count.

Expected SiteScout tools: `plan_site_question` → `scout_site` → `get_evidence`.
These are expected calls, not a recorded Claude Desktop session. Check `areaCheck` before explaining the result.

## 6. Troubleshooting

- Process fails to start: build first and use absolute script and Node paths; Desktop may have a different PATH from your terminal.
- Geoapify bridge fails on Windows: use the `cmd /c npx` form, check npm is installed and allow time for the first package download.
- Geoapify returns 401: check that the bridge inherits the key or has it in its private `env`; fully restart Desktop after environment changes.
- SiteScout reports a proxy quota error: wait for the daily reset or use your own key. The proxy accepts only HCMC requests.
