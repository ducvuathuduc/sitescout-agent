#!/usr/bin/env bash
# SiteScout smoke 40 — route matrix, 2 sources x 2 targets in HCMC (REST POST).
# Docs: https://www.geoapify.com/route-matrix-api/
# Endpoint: POST https://api.geoapify.com/v1/routematrix
# Cost: Max(sources,targets) * Min(sources,targets,10) credits (here: 2*2 = 4).
# Note: REST location arrays are [lon, lat] (unlike MCP's named lat/lon fields).
set -euo pipefail
source "$(dirname "$0")/_load_key.sh"

OUT="$RESULTS_DIR/40-route-matrix.json"
BODY=$(cat <<'JSON'
{"mode":"drive",
 "sources":[{"location":[106.7483,10.8490]},{"location":[106.6982,10.7724]}],
 "targets":[{"location":[106.7042,10.7832]},{"location":[106.6662,10.8010]}]}
JSON
)

echo "== 2x2 drive matrix (sources: Thao Dien, Ben Thanh) =="
curl -sS --max-time 30 -X POST "https://api.geoapify.com/v1/routematrix?apiKey=$GEOAPIFY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "$BODY" \
  | tee "$OUT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=d['sources_to_targets']
for i,row in enumerate(m):
    print(f\"source {i} -> \" + ', '.join(f\"t{j}: {c.get('time','?')}s / {c.get('distance','?')}m\" for j,c in enumerate(row)))
print('units:', d.get('units'), d.get('distance_units'), d.get('time_units'))
"
echo "Raw JSON saved to: $OUT"
