# Shared key loader for SiteScout Geoapify smoke tests.
# Sources GEOAPIFY_API_KEY from ~/workspace/sitescout/.env.local ONLY.
# Usage: source "$(dirname "$0")/_load_key.sh"
ENV_FILE="${SITESCOUT_ENV_FILE:-$HOME/workspace/sitescout/.env.local}"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  echo "Account signup + API key creation is BLOCKED-FOR-PARENT (live browser task required)." >&2
  exit 2
fi
GEOAPIFY_API_KEY="$(grep -E '^[[:space:]]*GEOAPIFY_API_KEY=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//; s/["'\'']$//')"
if [ -z "${GEOAPIFY_API_KEY:-}" ]; then
  echo "ERROR: GEOAPIFY_API_KEY is empty or missing in $ENV_FILE" >&2
  exit 2
fi
RESULTS_DIR="${RESULTS_DIR:-$(cd "$(dirname "$0")" && pwd)/results}"
mkdir -p "$RESULTS_DIR"
export GEOAPIFY_API_KEY RESULTS_DIR
