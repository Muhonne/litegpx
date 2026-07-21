#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

PARSER="mobile/app/src/main/java/com/example/traillite/GpxParser.kt"
MAP="mobile/app/src/main/java/com/example/traillite/TrailMapController.kt"
ROUTES="mobile/app/src/main/assets/routes/routes.json"
GPX="mobile/app/src/main/assets/routes/naantali-chill-break-loop.gpx"

rg -q "data class RouteBreakSpot" "$PARSER"
rg -q "fun parseRoute" "$PARSER"
rg -q "parser.name == \"wpt\"" "$PARSER"
rg -q "BREAK_SPOTS_SOURCE_ID" "$MAP"
rg -q "SymbolLayer\\(BREAK_SPOT_LABELS_LAYER_ID" "$MAP"
rg -q "<wpt[^>]+>" "$GPX"
rg -q "<name>Cafe Akseli</name>" "$GPX"
rg -q "\"id\": \"naantali-chill-break-loop\"" "$ROUTES"

echo "Route break spot support is wired."
