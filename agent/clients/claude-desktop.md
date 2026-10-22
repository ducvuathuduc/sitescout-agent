# Claude Desktop

Edit `claude_desktop_config.json`
(macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`):

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

Restart Claude Desktop. Create a Project, paste `agent/SYSTEM_PROMPT.md` into its instructions, and ask your question.
