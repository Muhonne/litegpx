#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

rg -q '<string name="app_name">LiteGPX</string>' mobile/app/src/main/res/values/strings.xml
rg -q 'text = "LiteGPX"' mobile/app/src/main/java/com/example/traillite/MainActivity.kt
rg -q 'resolve\("LiteGPX"\)' mobile/app/src/main/java/com/example/traillite/TrailStorage.kt
