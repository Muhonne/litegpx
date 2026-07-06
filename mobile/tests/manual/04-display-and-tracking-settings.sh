#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="$ROOT/app/src/main/java/com/example/traillite/MainActivity.kt"
SETTINGS="$ROOT/app/src/main/java/com/example/traillite/MapLayerSettings.kt"
CONTROLLER="$ROOT/app/src/main/java/com/example/traillite/TrailMapController.kt"

for key in keepScreenOn overrideSystemBrightness screenBrightnessPercent automaticTrackingZoom trackingZoomLevel; do
  if ! rg -n "$key" "$SETTINGS" "$MAIN" "$CONTROLLER" >/dev/null; then
    echo "Missing persisted/apply path for setting: $key" >&2
    exit 1
  fi
done

if ! rg -n 'FLAG_KEEP_SCREEN_ON' "$MAIN" >/dev/null; then
  echo "Keep-screen-on must be applied through the Activity window flag." >&2
  exit 1
fi

if ! rg -n 'screenBrightness' "$MAIN" >/dev/null; then
  echo "App-specific brightness must be applied through WindowManager.LayoutParams.screenBrightness." >&2
  exit 1
fi

if ! rg -n 'automaticTrackingZoom.*trackPoints\.size >= 2' "$CONTROLLER" >/dev/null; then
  echo "Automatic tracking zoom must only apply while tracking a selected route." >&2
  exit 1
fi

if ! rg -n 'onZoomChanged\(camera\.zoom\)' "$CONTROLLER" >/dev/null; then
  echo "Tracking camera must immediately report the applied camera zoom to the UI." >&2
  exit 1
fi

if ! rg -n 'enabled = settings\.automaticTrackingZoom' "$MAIN" >/dev/null ||
  ! rg -n 'enabled: Boolean = true' "$MAIN" >/dev/null; then
  echo "Tracking zoom controls must be disabled unless automatic tracking zoom is enabled." >&2
  exit 1
fi
