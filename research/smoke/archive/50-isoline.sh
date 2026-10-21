#!/usr/bin/env bash
# SiteScout smoke 50 — Isoline REST check (REST-ONLY; no MCP tool exists — see docs/FEEDBACK.md#1).
# Docs: https://apidocs.geoapify.com/docs/isolines/
# Endpoint: GET https://api.geoapify.com/v1/isoline?lat=&lon=&type=time&mode=drive&range=
# Cost: 1 credit per 5 requested minutes (isochrone). FREE plan caps isochrones at 15 min (range<=900).
# NOTE: range=1800 (30 min) exceeds the free-plan cap on purpose — observe the error shape.
set -euo pipefail
source "$(dirname "$0")/_load_key.sh"

LAT=10.8490; LON=106.7483
OUT="$RESULTS_DIR/50-isoline.json"
: > "$OUT"

probe() {
  local label="$1" range="$2"
  echo "== $label (range=$range s) =="
  curl -sS --max-time 60 -G "https://api.geoapify.com/v1/isoline" \
    --data-urlencode "lat=$LAT" \
    --data-urlencode "lon=$LON" \
    --data-urlencode "type=time" \
    --data-urlencode "mode=drive" \
    --data-urlencode "range=$range" \
    --data-urlencode "apiKey=$GEOAPIFY_API_KEY" \
    -o /tmp/sitescout-isoline.json -w 'HTTP %{http_code}\n'
  python3 -c "
import json
d=json.load(open('/tmp/sitescout-isoline.json'))
feats=d.get('features',[])
print('features:',len(feats),'| props of first:', (feats[0].get('properties') if feats else d.get('properties')))
" 2>/dev/null || head -c 500 /tmp/sitescout-isoline.json
  cat /tmp/sitescout-isoline.json >> "$OUT"; echo >> "$OUT"
  echo
}

probe "isochrone-15min (within free cap)" 900
probe "isochrone-30min (over free cap — expect error/limit)" 1800
echo "Raw JSON appended to: $OUT"
