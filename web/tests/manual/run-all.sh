#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

"$ROOT/web/tests/manual/00-map-foundation.sh"
"$ROOT/web/tests/manual/01-gpx-rendering.sh"
"$ROOT/web/tests/manual/02-gpx-creation-export.sh"
"$ROOT/web/tests/manual/03-basic-editing.sh"
"$ROOT/web/tests/manual/04-android-gpx-contract.sh"
"$ROOT/web/tests/manual/05-map-tools.sh"
