#!/usr/bin/env bash
# Deploy the demo Worker through the Cloudflare API (no wrangler needed).
# Needs: CLOUDFLARE_API_TOKEN (Workers Scripts:Edit), CLOUDFLARE_ACCOUNT_ID. The GEOAPIFY_KEY secret is
# kept from the previous deployment (keep_bindings) — set it once with `wrangler secret put GEOAPIFY_KEY`.
set -euo pipefail
cd "$(dirname "$0")"
A="${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
node build.mjs
npx esbuild worker/index.ts --bundle --format=esm --target=es2022 --outfile=.dist/index.js --log-level=warning
cat > .dist/metadata.json <<JSON
{"main_module":"index.js","compatibility_date":"2026-10-01","keep_bindings":["secret_text"],
 "bindings":[{"type":"ai","name":"AI"},
  {"type":"d1","name":"DB","id":"d2247353-faf3-4515-9eb4-868b4d542225"},
  {"type":"plain_text","name":"DAILY_CREDIT_CAP","text":"2400"},
  {"type":"plain_text","name":"PER_IP_CALL_CAP","text":"180"},
  {"type":"plain_text","name":"TILE_CAP","text":"2500"}]}
JSON
AUTH=(); [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ "${CLOUDFLARE_API_TOKEN}" != proxy-managed* ] && AUTH=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
curl -sf -X PUT "https://api.cloudflare.com/client/v4/accounts/$A/workers/scripts/sitescout" "${AUTH[@]}" \
  -F "metadata=@.dist/metadata.json;type=application/json" -F "index.js=@.dist/index.js;type=application/javascript+module" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('deployed' if d['success'] else d['errors'])"
