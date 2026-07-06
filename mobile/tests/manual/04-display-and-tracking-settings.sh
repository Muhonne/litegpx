#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="$ROOT/app/src/main/java/com/example/traillite/MainActivity.kt"
SETTINGS="$ROOT/app/src/main/java/com/example/traillite/MapLayerSettings.kt"
CONTROLLER="$ROOT/app/src/main/java/com/example/traillite/TrailMapController.kt"
LOCATION="$ROOT/app/src/main/java/com/example/traillite/BatteryLocationClient.kt"

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

if ! rg -n 'MIN_LOCATION_DISTANCE_METERS = 5f' "$LOCATION" >/dev/null; then
  echo "Tracking should use a 5m location distance filter to avoid waking on tiny GPS jitter." >&2
  exit 1
fi

if ! rg -n 'STALE_FUSED_FIX_TIMEOUT_MS' "$LOCATION" >/dev/null ||
  ! rg -n 'scheduleGpsFallbackCheck' "$LOCATION" >/dev/null; then
  echo "GPS provider fallback should only start after fused location fixes are stale." >&2
  exit 1
fi

if ! rg -n 'adaptiveIntervalMs' "$LOCATION" >/dev/null ||
  ! rg -n 'STOPPED_SPEED_METERS_PER_SECOND' "$LOCATION" >/dev/null; then
  echo "Tracking should adapt location interval when the user appears stopped or slow." >&2
  exit 1
fi

if ! rg -n 'shouldUpdateRideCamera' "$CONTROLLER" >/dev/null ||
  ! rg -n 'RIDE_CAMERA_EDGE_MARGIN_RATIO' "$CONTROLLER" >/dev/null; then
  echo "Ride mode should skip camera moves until the location approaches the viewport edge." >&2
  exit 1
fi
