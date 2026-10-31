# Record a real Claude Code session with both MCP servers

This records one non-interactive Claude Code run that uses SiteScout's MCP server and the Geoapify MCP server.
The output is a stream-json transcript you can commit as `agent/transcripts/04-claude-code-two-servers.jsonl`.

Nothing here has been run on the maintainer's machine yet. `claude auth status` reports `"loggedIn": false`
(`claude` 2.1.316), and no Geoapify key is set. Every flag below is listed in `claude --help` for 2.1.316.
Check your own version with `claude --version`.

## 1. Sign in and check the key

```powershell
claude auth login          # interactive sign-in to your Anthropic account
claude auth status        # expect "loggedIn": true
$env:GEOAPIFY_API_KEY = "<your key>"   # this shell only; do not write the key to a file
```

Get a free key at [myprojects.geoapify.com](https://myprojects.geoapify.com), as in [claude-code.md](claude-code.md).

## 2. Build SiteScout

```powershell
npm ci
npm run build              # tsc -p tsconfig.json; creates dist/mcp-server.js
```

## 3. Write the MCP config outside the repository

Copy [mcp.two-servers.example.json](mcp.two-servers.example.json) to a path outside the repo, then edit the copy:

- replace `/ABSOLUTE/PATH/TO/sitescout-agent` with the absolute path of your checkout;
- replace both `YOUR_KEY` placeholders with your key.

```powershell
Copy-Item agent\clients\mcp.two-servers.example.json "$env:TEMP\mcp.two-servers.json"
```

Never commit the edited copy.

## 4. Run one question

Pick the tool names with care. This guide does not list them, because they were not captured on this machine.
To see the names, start an interactive session with the same config and run `/mcp`, as in
[claude-code.md](claude-code.md). Then check them against the first stream-json events of a short run.

```powershell
claude -p "<your question>" `
  --mcp-config "$env:TEMP\mcp.two-servers.json" `
  --strict-mcp-config `
  --model <model alias or full name> `
  --allowedTools "<tool names, comma separated>" `
  --max-budget-usd <your cap in USD> `
  --output-format stream-json --verbose
```

Flags, all from `claude --help` (2.1.316):

| Flag | Purpose |
|---|---|
| `-p, --print` | Print the response and exit. The `--output-format` and `--max-budget-usd` flags only work with it. |
| `--mcp-config <configs...>` | Load MCP servers from a JSON file. |
| `--strict-mcp-config` | Use only the servers in `--mcp-config`, and ignore other MCP configs on this machine. |
| `--model` | Model alias (for example `sonnet`) or full name. Record the model you pass. |
| `--allowedTools` | Tools the run may use. Comma or space separated. |
| `--max-budget-usd` | Stop the run at this dollar amount of API spend. |
| `--output-format stream-json` | Realtime JSON events, one per line. |
| `--verbose` | Listed in the help as "Override verbose mode setting from config". This guide has not checked what it changes. |

Redirect the output with `cmd`. In Windows PowerShell 5.1, the `>` operator writes UTF-16, not UTF-8:

```powershell
cmd /c "claude -p ""<question>"" --mcp-config ""$env:TEMP\mcp.two-servers.json"" --strict-mcp-config --model <model> --allowedTools ""<tools>"" --max-budget-usd <cap> --output-format stream-json --verbose > agent\transcripts\04-claude-code-two-servers.jsonl"
```

Run the same command with a short question first, so a failed run does not cost your whole budget.

## 5. Remove secrets and home paths before the file is committed

The stream can contain the config path, which includes your home directory. In JSON, Windows backslashes are
doubled, so replace both forms:

```powershell
$f = "agent\transcripts\04-claude-code-two-servers.jsonl"
$t = Get-Content $f -Raw -Encoding utf8
$home1 = $env:USERPROFILE
$home2 = $env:USERPROFILE.Replace('\', '\\')
$t = $t.Replace($env:GEOAPIFY_API_KEY, "YOUR_KEY").Replace($home2, "<HOME>").Replace($home1, "<HOME>")
[System.IO.File]::WriteAllText((Resolve-Path $f), $t, (New-Object System.Text.UTF8Encoding($false)))

# Each check should print nothing. An empty search string matches every line, so stop if a value is empty.
if (-not $env:GEOAPIFY_API_KEY -or -not $home1) { throw "run this in the shell where the key is set" }
Select-String -Path $f -SimpleMatch $env:GEOAPIFY_API_KEY
Select-String -Path $f -SimpleMatch $home1
Select-String -Path $f -SimpleMatch $home2
```

Then check the file against the transcript rules in [docs/mcp.md](../../docs/mcp.md):

- label it as a Claude Code run and record the model that the stream reports;
- do not present it as a run with another host or model;
- keep it next to the existing open-weight transcripts, which are labelled in [agent/README.md](../README.md).

## 6. After recording

The current docs describe the two-server session as "expected, not yet recorded". Once the file exists, update
the walk-through in [docs/mcp.md](../../docs/mcp.md) and the transcript table in [agent/README.md](../README.md).
