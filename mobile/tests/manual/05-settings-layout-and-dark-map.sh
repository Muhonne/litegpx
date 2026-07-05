#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="$ROOT/app/src/main/java/com/example/traillite/MainActivity.kt"
STORAGE="$ROOT/app/src/main/java/com/example/traillite/TrailStorage.kt"

if ! rg -n 'SettingsStepperRow' "$MAIN" >/dev/null; then
  echo "Settings steppers should share one aligned row component." >&2
  exit 1
fi

if ! rg -n 'SETTINGS_STEPPER_BUTTON_WIDTH' "$MAIN" >/dev/null ||
  ! rg -n 'SETTINGS_INPUT_WIDTH' "$MAIN" >/dev/null; then
  echo "Settings inputs and stepper buttons need stable shared widths." >&2
  exit 1
fi

for layer in earth landuse-green boundaries; do
  if ! rg -n "\"$layer\"" "$STORAGE" >/dev/null; then
    echo "Dark map style should recolor $layer." >&2
    exit 1
  fi
done
