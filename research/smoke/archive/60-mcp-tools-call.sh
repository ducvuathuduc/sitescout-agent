#!/usr/bin/env bash
# SiteScout smoke 60 — MCP tools/call end-to-end over Streamable HTTP (needs API key).
# Docs: https://www.geoapify.com/mcp/ (protocol 2025-06-18, x-api-key header)
# Flow: initialize -> notifications/initialized -> tools/list -> tools/call search_places.
# Session: captures the Mcp-Session-Id response header and reuses it.
set -euo pipefail
source "$(dirname "$0")/_load_key.sh"

EP="https://api.geoapify.com/v1/mcp"
HDR="$(mktemp)"; trap 'rm -f "$HDR"' EXIT
OUT="$RESULTS_DIR/60-mcp-search-places.json"

rpc() {
  local body="$1"
  local extra=("${@:2}")
  curl -sS --max-time 25 -X POST "$EP" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "x-api-key: $GEOAPIFY_API_KEY" \
    "${extra[@]}" \
    -d "$body"
}

echo "== initialize =="
INIT_RESP="$(rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"sitescout-smoke","version":"0.1.0"}}}' -D "$HDR")"
SESSION="$(grep -i '^mcp-session-id:' "$HDR" | tr -d '\r' | awk '{print $2}')"
echo "session: ${SESSION:-<none>}"
echo "$INIT_RESP" | head -c 400; echo; echo

SESS_HDR=()
[ -n "${SESSION:-}" ] && SESS_HDR=(-H "Mcp-Session-Id: $SESSION")

echo "== notifications/initialized (expect HTTP 202) =="
rpc '{"jsonrpc":"2.0","method":"notifications/initialized"}' "${SESS_HDR[@]}" -o /dev/null -w 'HTTP %{http_code}\n'

echo "== tools/list (expect 11 tools) =="
rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' "${SESS_HDR[@]}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); ts=d['result']['tools']; print(len(ts),'tools:',', '.join(t['name'] for t in ts))"

echo "== tools/call search_places (catering.cafe near Thao Dien, 2km, limit 5) =="
rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_places","arguments":{"category":"catering.cafe","lat":10.8490,"lon":106.7483,"radius_meters":2000,"limit":5}}}' "${SESS_HDR[@]}" \
  | tee "$OUT" | python3 -c "
import json,sys
d=json.load(sys.stdin); r=d['result']
print('isError:', r.get('isError'))
sc=r.get('structuredContent',{})
print('count:', sc.get('count'))
for p in sc.get('results',[])[:5]:
    print(f\"- {p.get('name','?')} | {p.get('formatted','?')} | {p.get('distance')}m\")
"
echo "Raw JSON saved to: $OUT"
