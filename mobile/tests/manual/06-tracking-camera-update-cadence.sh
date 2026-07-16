#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

rg -q 'moveMapEveryLocationUpdates: Int = 1' mobile/app/src/main/java/com/example/traillite/MapLayerSettings.kt
rg -q 'KEY_MOVE_MAP_EVERY_LOCATION_UPDATES = "moveMapEveryLocationUpdates"' mobile/app/src/main/java/com/example/traillite/MapLayerSettings.kt
rg -q 'Move map on every' mobile/app/src/main/java/com/example/traillite/MainActivity.kt
rg -q 'locationUpdateCount % layerSettings.moveMapEveryLocationUpdates' mobile/app/src/main/java/com/example/traillite/TrailMapController.kt
if rg -q 'shouldUpdateRideCamera|RIDE_CAMERA_EDGE_MARGIN_RATIO' mobile/app/src/main/java/com/example/traillite/TrailMapController.kt; then
  echo "Tracking camera should use update cadence, not viewport edge margins" >&2
  exit 1
fi
