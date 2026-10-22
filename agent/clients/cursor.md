# Cursor

Create `.cursor/mcp.json` in the repo (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "sitescout": {
      "command": "node",
      "args": ["/absolute/path/to/sitescout-agent/dist/mcp-server.js"],
      "env": { "GEOAPIFY_API_KEY": "YOUR_KEY" }
    }
  }
}
```

Leave `env` empty to use the public HCMC demo proxy instead of your own key.
Add `agent/SYSTEM_PROMPT.md` as a Cursor rule (`.cursor/rules/sitescout.mdc`), open Settings → MCP and check
that `sitescout` shows 5 tools, then ask in Agent mode.
