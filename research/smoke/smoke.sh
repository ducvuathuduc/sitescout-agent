#!/usr/bin/env bash
# ============================================================================
# SiteScout smoke tests — Geoapify MCP endpoint, 3 regions (HCMC, Hanoi, Da Nang)
#
# BLOCKED-FOR-PARENT: needs a Geoapify API key. See research/smoke/README.md.
#
# Usage (from the repo root):
#   GEOAPIFY_API_KEY=xxx ./research/smoke/smoke.sh hcmc
#   GEOAPIFY_API_KEY=xxx ./research/smoke/smoke.sh hanoi
#   GEOAPIFY_API_KEY=xxx ./research/smoke/smoke.sh danang
#   GEOAPIFY_API_KEY=xxx ./research/smoke/smoke.sh all
#
# Same question pattern in every region:
#   0. initialize → notifications/initialized → tools/list — snapshot the
#      live tool schema AND assert the 11-tool surface + corrected arg shapes
#      (aborts before any credit is spent when the surface has drifted)
#   1. geocode_address       — diacritic-heavy formal address
#   2. geocode_address       — informal / POI-style name
#   3. geocode_structured_address — structured variant of (1)
#   4. search_places         — catering.cafe within a 1 km circle (comparable!)
#   5. list_place_categories — taxonomy sanity check
#   6. transform_geometry    — 800 m buffer around the candidate point
#   7. calculate_route_matrix — 2 demand origins -> 1 candidate
#
# Arg shapes below follow the VERIFIED schemas
# (research/track1-geopify-deepdive.md §1.1) — NOT the old best-effort shapes:
#   geocode_address:        {"query": …}                 (not "text")
#   search_places:          {"category","lat","lon","radius_meters"}  (not categories+filter)
#   transform_geometry:     {"operation":"buffer","distance":0.8}     (not operations:[{type…}])
#   calculate_route_matrix: {"sources":[{"lat","lon"}]}   (not {location:[lon,lat]})
#
# Results land in research/smoke/results/<region>/NN-<name>.json (gitignored).
# NOTE: seed coordinates below are APPROXIMATE (hand-picked). Refine them from
# the step-01 geocode output before treating any number as evidence.
# ============================================================================
set -uo pipefail
export LC_ALL=C.UTF-8

ENDPOINT="https://api.geoapify.com/v1/mcp"
OUTDIR="research/smoke/results"

: "${GEOAPIFY_API_KEY:?BLOCKED: set GEOAPIFY_API_KEY first (see research/smoke/README.md)}"

HDR="$(mktemp)"; trap 'rm -f "$HDR"' EXIT
SESSION=""

rpc() { # $1=body [$2... extra curl args]
  local body="$1"; shift
  local extra=()
  [ -n "$SESSION" ] && extra=(-H "Mcp-Session-Id: $SESSION")
  curl -sS -m 40 -X POST "$ENDPOINT" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -H "x-api-key: $GEOAPIFY_API_KEY" \
    "${extra[@]}" "$@" \
    --data "$body"
}

# --- step 0: handshake + tools/list snapshot + surface assertion --------------
step00_handshake() { # $1=outfile
  local outfile="$1"
  mkdir -p "$(dirname "$outfile")"

  echo "== initialize =="
  rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"sitescout-smoke","version":"0.1.0"}}}' -D "$HDR" -o /dev/null
  SESSION="$(grep -i '^mcp-session-id:' "$HDR" | tr -d '\r' | awk '{print $2}')"
  echo "session: ${SESSION:-<none>}"

  echo "== notifications/initialized (expect HTTP 202) =="
  rpc '{"jsonrpc":"2.0","method":"notifications/initialized"}' -o /dev/null -w 'HTTP %{http_code}\n'

  echo "== tools/list =="
  rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' > "$outfile"
  echo "[ok] tools/list -> $outfile"

  echo "== asserting 11-tool surface + corrected arg shapes =="
  python3 - "$outfile" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
tools = {t["name"]: t for t in d["result"]["tools"]}
expected = ["geocode_address","geocode_structured_address","reverse_geocode_coordinates",
  "search_places","list_place_categories","calculate_route","calculate_route_matrix",
  "combine_geometries","evaluate_spatial_relation","measure_geometry","transform_geometry"]
missing = [t for t in expected if t not in tools]
if missing:
    sys.exit(f"ABORT: tool surface drift — missing {missing}")

def props(name):
    return (tools[name].get("inputSchema") or {}).get("properties", {})

checks = [
    ("geocode_address", "query", '"text" must NOT be used'),
    ("search_places", "category", 'singular "category" required'),
    ("search_places", "lat", '"lat" required'),
    ("search_places", "lon", '"lon" required'),
    ("search_places", "radius_meters", '"radius_meters" required'),
    ("transform_geometry", "operation", '"operation" (not operations[]) required'),
    ("transform_geometry", "distance", '"distance" required for buffer'),
    ("calculate_route_matrix", "sources", '"sources" required'),
]
bad = [f"{t}: missing param {p} ({why})" for t, p, why in checks if p not in props(t)]
if bad:
    sys.exit("ABORT: arg-shape drift:\n  " + "\n  ".join(bad))
print(f"OK: 11 tools present, corrected arg shapes verified ({len(tools)} tools advertised)")
PY
}

mcp_call() { # $1=tool $2=args_json $3=outfile
  local tool="$1" args_json="$2" outfile="$3"
  mkdir -p "$(dirname "$outfile")"
  local payload
  payload=$(printf '{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":"%s","arguments":%s}}' \
    "$RANDOM" "$tool" "$args_json")
  if rpc "$payload" -o "$outfile"; then
    echo "[ok] $tool -> $outfile"
  else
    echo "[rpc-failed] $tool (network/timeout); see $outfile"
    printf '{"_smoke_error":"rpc failed or timed out"}' > "$outfile"
  fi
}

# --- shared step runner -------------------------------------------------------
# Expects region vars: R (slug), DIACRITIC, INFORMAL, ST_STREET, ST_CITY,
#                      LON, LAT (candidate), M_SRC_* (matrix origins)
run_region() {
  local d="$OUTDIR/$R"
  echo "=== region: $R ==="

  step00_handshake "$d/00-tools-list.json"

  mcp_call geocode_address \
    "{\"query\":\"$DIACRITIC\",\"lang\":\"vi\",\"limit\":3}" \
    "$d/01-geocode-diacritic.json"

  mcp_call geocode_address \
    "{\"query\":\"$INFORMAL\",\"lang\":\"vi\",\"limit\":3}" \
    "$d/02-geocode-informal.json"

  mcp_call geocode_structured_address \
    "{\"street\":\"$ST_STREET\",\"city\":\"$ST_CITY\",\"country\":\"Vietnam\",\"lang\":\"vi\",\"limit\":3}" \
    "$d/03-geocode-structured.json"

  mcp_call search_places \
    "{\"category\":\"catering.cafe\",\"lat\":$LAT,\"lon\":$LON,\"radius_meters\":1000,\"limit\":100}" \
    "$d/04-search-places-cafe-1km.json"

  mcp_call list_place_categories \
    "{}" \
    "$d/05-list-place-categories.json"

  mcp_call transform_geometry \
    "{\"operation\":\"buffer\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[$LON,$LAT]},\"distance\":0.8}" \
    "$d/06-transform-buffer-800m.json"
  echo "  -> NOTE: feed the buffer polygon from 06 into measure_geometry /"
  echo "     evaluate_spatial_relation manually (see README.md step 6)."

  mcp_call calculate_route_matrix \
    "{\"mode\":\"drive\",\"traffic\":\"approximated\",\"sources\":[{\"lat\":$M_SRC_A_LAT,\"lon\":$M_SRC_A_LON},{\"lat\":$M_SRC_B_LAT,\"lon\":$M_SRC_B_LON}],\"targets\":[{\"lat\":$LAT,\"lon\":$LON}]}" \
    "$d/07-route-matrix.json"

  echo "=== $R done: results in $d ==="
}

# --- regions ----------------------------------------------------------------
region_hcmc() {
  R="hcmc"
  DIACRITIC="Xuân Thủy, Thảo Điền, Thủ Đức, Hồ Chí Minh"
  INFORMAL="Phố đi bộ Bùi Viện, Quận 1, Hồ Chí Minh"
  ST_STREET="Xuân Thủy"; ST_CITY="Thủ Đức"
  LON=106.7337; LAT=10.8042          # approx: Thao Dien
  M_SRC_A_LON=106.6989; M_SRC_A_LAT=10.7725   # approx: Ben Thanh
  M_SRC_B_LON=106.7210; M_SRC_B_LAT=10.7750   # approx: Thu Thiem
  run_region
}

region_hanoi() {
  R="hanoi"
  DIACRITIC="Tràng Tiền, Hoàn Kiếm, Hà Nội"
  INFORMAL="Phố bia Tạ Hiện, Hoàn Kiếm, Hà Nội"
  ST_STREET="Tràng Tiền"; ST_CITY="Hà Nội"
  LON=105.8310; LAT=21.0550          # approx: Tay Ho (West Lake)
  M_SRC_A_LON=105.8523; M_SRC_A_LAT=21.0285   # approx: Hoan Kiem (origin A)
  M_SRC_B_LON=105.7712; M_SRC_B_LAT=21.0178   # approx: My Dinh
  run_region
}

region_danang() {
  R="danang"
  DIACRITIC="Bạch Đằng, Hải Châu, Đà Nẵng"
  INFORMAL="Cầu Rồng, Hải Châu, Đà Nẵng"
  ST_STREET="Bạch Đằng"; ST_CITY="Đà Nẵng"
  LON=108.2446; LAT=16.0600          # approx: My Khe beach
  M_SRC_A_LON=108.2274; M_SRC_A_LAT=16.0611   # approx: Dragon Bridge
  M_SRC_B_LON=108.1997; M_SRC_B_LAT=16.0439   # approx: Da Nang airport
  run_region
}

# --- entry ------------------------------------------------------------------
case "${1:-}" in
  hcmc)   region_hcmc ;;
  hanoi)  region_hanoi ;;
  danang) region_danang ;;
  all)    region_hcmc; region_hanoi; region_danang ;;
  *) echo "usage: GEOAPIFY_API_KEY=xxx $0 [hcmc|hanoi|danang|all]" >&2; exit 1 ;;
esac
