#!/usr/bin/env bash
# SiteScout smoke 30 — driving route Thao Dien -> Ben Thanh (REST).
# Docs: https://apidocs.geoapify.com/docs/routing/
# Endpoint: GET https://api.geoapify.com/v1/routing?waypoints=<lat>,<lon>|<lat>,<lon>&mode=drive
# Cost: 1 credit per waypoint pair (baseline); avoid toggles/route_details/elevation add credits.
set -euo pipefail
source "$(dirname "$0")/_load_key.sh"

# Thao Dien (10.8490,106.7483) -> Ben Thanh market area (10.7724,106.6982)
OUT="$RESULTS_DIR/30-route.json"

echo "== drive: Thao Dien -> Ben Thanh =="
curl -sS --max-time 25 -G "https://api.geoapify.com/v1/routing" \
  --data-urlencode "waypoints=10.8490,106.7483|10.7724,106.6982" \
  --data-urlencode "mode=drive" \
  --data-urlencode "format=json" \
  --data-urlencode "apiKey=$GEOAPIFY_API_KEY" \
  | tee "$OUT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d['features'][0]['properties']
print(f\"time={r['time']:.0f}s ({r['time']/60:.1f} min)  distance={r['distance']:.0f}m ({r['distance']/1000:.2f} km)\")
legs=r.get('legs',[{}])[0].get('steps',[])
print(f'steps: {len(legs)}')
"
echo "Raw JSON saved to: $OUT"
