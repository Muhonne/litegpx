#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="$ROOT/app/src/main/java/com/example/traillite/MainActivity.kt"

rg -q 'RouteRideCard' "$MAIN"
rg -q 'ON ROUTE' "$MAIN"
rg -q 'OFF ROUTE' "$MAIN"
rg -q 'MetricTile' "$MAIN"
rg -q 'displaySmall' "$MAIN"
if sed -n '/private fun RouteRideCard/,/^}/p' "$MAIN" | rg -q 'locationText'; then
  echo "Route ride card should not spend readable space on raw GPS coordinates." >&2
  exit 1
fi
