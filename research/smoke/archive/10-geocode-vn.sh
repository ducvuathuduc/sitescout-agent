#!/usr/bin/env bash
# SiteScout smoke 10 — geocode 3 Vietnamese addresses (REST, needs API key).
# Docs: https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/ (linked from MCP geocode_address page)
# Endpoint: GET https://api.geoapify.com/v1/geocode/search
# Cost: 1 credit per request (free plan = 3,000 credits/day).
set -euo pipefail
source "$(dirname "$0")/_load_key.sh"

OUT="$RESULTS_DIR/10-geocode-vn.json"
: > "$OUT"

geocode() {
  local label="$1"; shift
  echo "== $label =="
  curl -sS --max-time 20 -G "https://api.geoapify.com/v1/geocode/search" \
    --data-urlencode "text=$1" \
    --data-urlencode "format=json" \
    --data-urlencode "lang=vi" \
    --data-urlencode "country_codes=vn" \
    --data-urlencode "limit=3" \
    --data-urlencode "apiKey=$GEOAPIFY_API_KEY" \
    | tee -a "$OUT" | head -c 2000
  echo; echo
}

# 1. Full diacritics address (legacy ward/district naming — see VN data-quality plan).
geocode "diacritics" "123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh"
# 2. Informal landmark name.
geocode "landmark" "Nhà thờ Đức Bà Sài Gòn"
# 3. Ward renamed by the 2025 administrative reorganization (new ward name).
geocode "renamed-ward" "Phường Sài Gòn, TP. Hồ Chí Minh"

echo "Raw JSON appended to: $OUT"
