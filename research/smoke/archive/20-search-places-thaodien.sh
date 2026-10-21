#!/usr/bin/env bash
# SiteScout smoke 20 — Places search for cafes around Thao Dien, HCMC (REST v2).
# Docs: https://apidocs.geoapify.com/docs/places/
# Endpoint: GET https://api.geoapify.com/v2/places?categories=catering.cafe&filter=circle:<lon>,<lat>,<r>&limit=20
# Cost: 1 credit per 20 results returned. Filter circle uses lon,lat order.
set -euo pipefail
source "$(dirname "$0")/_load_key.sh"

LON=106.7483; LAT=10.8490; RADIUS=2000
OUT="$RESULTS_DIR/20-places-thaodien.json"

echo "== catering.cafe within ${RADIUS}m of Thao Dien ($LAT,$LON) =="
curl -sS --max-time 25 -G "https://api.geoapify.com/v2/places" \
  --data-urlencode "categories=catering.cafe" \
  --data-urlencode "filter=circle:${LON},${LAT},${RADIUS}" \
  --data-urlencode "limit=20" \
  --data-urlencode "lang=vi" \
  --data-urlencode "apiKey=$GEOAPIFY_API_KEY" \
  | tee "$OUT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
feats=d.get('features',[])
print(f'features: {len(feats)}')
for f in feats[:20]:
    p=f['properties']
    print(f\"- {p.get('name','?')} | {p.get('formatted','?')} | dist={p.get('distance')}m | cats={','.join((p.get('categories') or [])[:3])}\")
"
echo "Raw JSON saved to: $OUT"
