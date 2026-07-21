#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

rg -q "getElementsByTagName\\(\"wpt\"\\)" web/src/lib/gpx.js
rg -q "exportGpx\\(routeName, points, breakSpots" web/src/lib/gpx.js
rg -q "route-break-points" web/src/features/route-layers.js
rg -q "route-break-labels" web/src/features/route-layers.js
rg -q "state\\.breakSpots = parsed\\.breakSpots" web/src/app.js
rg -q "exportGpx\\(state.routeName, state.points, state.breakSpots\\)" web/src/app.js

echo "Web route break spot support is wired."
