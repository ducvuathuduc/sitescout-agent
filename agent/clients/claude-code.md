# Claude Code

```bash
git clone https://github.com/ducvuathuduc/sitescout-agent && cd sitescout-agent
npm ci && npm run build
# with your own Geoapify key (free at https://myprojects.geoapify.com):
claude mcp add sitescout -e GEOAPIFY_API_KEY=YOUR_KEY -- node "$PWD/dist/mcp-server.js"
# or without a key, through the public HCMC demo proxy (rate-limited):
claude mcp add sitescout -- node "$PWD/dist/mcp-server.js"
```

Then copy `agent/SYSTEM_PROMPT.md` into your project's `CLAUDE.md` (or paste it at the start of the chat) and ask:

> Where should I open a specialty coffee shop in Thảo Điền? Cite every number.

`/mcp` should list `sitescout` with 5 tools.
