# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue**. Email **huynhthanh@vtechstudio.tech** with steps to reproduce.
You will get an answer within 7 days, and a fix or mitigation plan within 30 days for confirmed issues.

## How keys are handled

- The CLI and MCP server read `GEOAPIFY_API_KEY` from the environment and send it only as an `x-api-key`
  header to `api.geoapify.com`. It is never written to reports, traces or logs (`trace.jsonl` stores the
  request path without the key).
- The public demo keeps its key in a Cloudflare Worker secret. The browser never sees it. The Worker
  enforces per-IP and daily credit caps and only proxies a fixed list of Geoapify endpoints inside the
  HCMC bounding box.
- If you find a key in this repository or in a served page, report it as above.
