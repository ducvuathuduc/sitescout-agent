# Using SiteScout next to the official Geoapify MCP server

SiteScout's own server does the multi-step analysis; the official Geoapify MCP server
(`https://api.geoapify.com/v1/mcp`, streamable HTTP) gives the model raw geocoding, places, routing and
geometry tools for follow-up questions. Both can be registered in the same host (Claude Code `.mcp.json`):

```json
{
  "mcpServers": {
    "sitescout": { "command": "node", "args": ["/abs/path/dist/mcp-server.js"], "env": { "GEOAPIFY_API_KEY": "YOUR_KEY" } },
    "geoapify": { "type": "http", "url": "https://api.geoapify.com/v1/mcp", "headers": { "x-api-key": "YOUR_KEY" } }
  }
}
```

SiteScout's legacy `ask` pipeline (`src/mcp/client.ts`) talks to this same server; that is where the
response-shape findings in `docs/FEEDBACK.md` come from. Header/transport field names differ slightly between
MCP clients — check your client's docs.
