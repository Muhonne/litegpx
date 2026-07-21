#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTROLLER="$ROOT/app/src/main/java/com/example/traillite/TrailMapController.kt"

if ! rg -n 'isRotateGesturesEnabled = true' "$CONTROLLER" >/dev/null; then
  echo "Map rotation gestures should be enabled so a user can correct orientation manually." >&2
  exit 1
fi

if ! rg -n 'if \(trackPoints\.size < 2\)' "$CONTROLLER" >/dev/null ||
  ! rg -n 'return NORTH_UP_BEARING' "$CONTROLLER" >/dev/null; then
  echo "Navigation bearing should stay north-up when tracking without a selected route." >&2
  exit 1
fi

if ! rg -n 'movingGpsBearing\(location\) \?: routeLookaheadBearing\(location\)' "$CONTROLLER" >/dev/null; then
  echo "Navigation bearing should prefer reliable GPS course before route lookahead so reversed GPX routes do not point the map backward." >&2
  exit 1
fi
