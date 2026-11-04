# Kiro

## 1. Requirements

Install Node.js 20+ and Kiro (IDE or CLI). From the SiteScout checkout, run:

```sh
npm ci && npm run build
```

A free [Geoapify key](https://myprojects.geoapify.com) is optional for SiteScout.
Without `GEOAPIFY_API_KEY`, SiteScout uses the public HCMC demo proxy at
`https://sitescout.huynhthanh.workers.dev/geo`, with scope and daily limits.
`SITESCOUT_GEOAPIFY_BASE`, if set, overrides that base URL; unset it for the default behavior.
The separate Geoapify MCP server requires a key.

## 2. Add SiteScout's server

CLI form, with an absolute path:

```sh
kiro-cli mcp add --name sitescout --scope workspace --command node --args "/absolute/path/to/sitescout-agent/dist/mcp-server.js"
```

On Windows the installer puts the executable at
`%LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe`. If it is not on PATH, invoke it in PowerShell with
`& "$env:LOCALAPPDATA\Kiro-Cli\kiro-cli.exe"` in place of `kiro-cli`.

Alternatively, merge this into `.kiro/settings/mcp.json` for the workspace or
`~/.kiro/settings/mcp.json` for your user:

```json
{
  "mcpServers": {
    "sitescout": {
      "command": "node",
      "args": ["/absolute/path/to/sitescout-agent/dist/mcp-server.js"],
      "env": {},
      "disabled": false
    }
  }
}
```

Use forward slashes in Windows JSON paths, such as `C:/work/sitescout-agent/dist/mcp-server.js`.
For direct REST access, set the key before starting Kiro and optionally map
`"env": { "GEOAPIFY_API_KEY": "${GEOAPIFY_API_KEY}" }`. Keep `env` empty for the key-free setup.

## 3. Add the Geoapify MCP server

The official endpoint uses streamable HTTP and the `x-api-key` header.
The CLI can add the URL:

```sh
kiro-cli mcp add --name geoapify --scope workspace --url https://api.geoapify.com/v1/mcp
```

The checked `mcp add --help` has no header flag. Finish by adding `headers` to
that entry in the same config file:

```json
{
  "mcpServers": {
    "geoapify": {
      "url": "https://api.geoapify.com/v1/mcp",
      "headers": { "x-api-key": "${GEOAPIFY_API_KEY}" },
      "disabled": false
    }
  }
}
```

Set `GEOAPIFY_API_KEY` before launching Kiro. The [Kiro MCP docs](https://kiro.dev/docs/mcp/)
and [configuration reference](https://kiro.dev/docs/mcp/configuration/) confirm these locations,
remote `url`/`headers` fields and `${VARIABLE_NAME}` expansion. In the IDE, approve the variable
under **Mcp Approved Env Vars** if prompted. Workspace entries take precedence over user entries.
The [complete example](kiro.mcp.example.json) includes both servers; merge entries instead of replacing existing ones.

## 4. Check it is connected

```sh
kiro-cli mcp list
```

This lists configuration, not a handshake. In the checked Kiro CLI 3.0.0, the servers
from the example appear under `default` → `kiro_default`; `mcp list workspace` alone
shows workspace agent entries and does not show this shared configuration. In a Kiro CLI chat, use `/mcp`
to inspect loaded servers; in the IDE use the MCP panel and reconnect after editing.
Check that `sitescout` offers five tools: `plan_site_question`, `scout_site`,
`resolve_place`, `walk_isochrone`, `get_evidence`. Ask it to call `plan_site_question`
first, which needs no Geoapify credits. Check the `geoapify` connection separately with a key set.
Use [SYSTEM_PROMPT.md](../SYSTEM_PROMPT.md) as steering instructions.

## 5. One example question

> Where should I open a specialty coffee shop in Thảo Điền? Cite every number and retrieve the request behind the top site's competitor count.

Expected SiteScout tools: `plan_site_question` → `scout_site` → `get_evidence`.
These are expected calls, not a recorded Kiro session. Check `areaCheck` before explaining the result.

## 6. Troubleshooting

- Server is absent: check workspace versus user scope and whether an agent configuration overrides the same server name; make sure `disabled` is false.
- Process fails to start: build first and check the absolute script and Node paths. JSON backslashes must be escaped or replaced with forward slashes.
- Geoapify rejects the header: check the environment variable and, in the IDE, its expansion approval; restart Kiro after changing its environment.
- Proxy returns a quota error or rejects a location: the demo is limited to HCMC and daily caps. Use an HCMC question, wait for reset, or supply your own key for direct API access.
