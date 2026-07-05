#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTROLLER="$ROOT/app/src/main/java/com/example/traillite/TrailMapController.kt"

if rg -n 'scrollBy\(' "$CONTROLLER" >/dev/null; then
  echo "Navigation camera must not use scrollBy after centering on GPS; use a single anchored camera update." >&2
  exit 1
fi

if ! rg -n 'navigationTopPaddingPx|NAVIGATION_TOP_PADDING_RATIO' "$CONTROLLER" >/dev/null; then
  echo "Navigation camera should encode the 40%-from-bottom anchor as camera padding." >&2
  exit 1
fi
