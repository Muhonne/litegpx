#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
JAVA_HOME_DEFAULT="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
PACKAGE_NAME="com.example.traillite"
ACTIVITY_NAME="com.example.traillite/.MainActivity"

route=""
serial=""
interval_seconds="5"
point_step="1"
max_points="0"
install_app="0"
launch_app="0"
grant_location="1"
wait_for_start="1"
dry_run="0"

usage() {
  cat <<'USAGE'
Play a GPX route into an Android emulator using `adb emu geo fix`.

Usage:
  tests/manual/play-gpx-route.sh --route <route.gpx> [options]

Options:
  --route <file>       GPX file path. Relative names are resolved from mobile/ first,
                       then from mobile/app/src/main/assets/routes/.
  --serial <id>        adb device serial. Defaults to the first connected emulator.
  --interval <seconds> Delay between fixes. Default: 5.
  --step <n>           Emit every nth GPX point. Default: 1.
  --max-points <n>     Stop after n emitted fixes. Default: all points.
  --install            Build and install the debug APK before playback.
  --launch             Launch TrailLite before playback.
  --no-grant           Do not grant location permissions through adb.
  --no-wait            Do not pause for manual route selection/start.
  --dry-run            Parse and print fixes without calling adb.
  -h, --help           Show this help.

Example:
  tests/manual/play-gpx-route.sh \
    --install \
    --launch \
    --route app/src/main/assets/routes/hameen-harkatie.gpx \
    --interval 5 \
    --step 5
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --route)
      route="${2:-}"
      shift 2
      ;;
    --serial)
      serial="${2:-}"
      shift 2
      ;;
    --interval)
      interval_seconds="${2:-}"
      shift 2
      ;;
    --step)
      point_step="${2:-}"
      shift 2
      ;;
    --max-points)
      max_points="${2:-}"
      shift 2
      ;;
    --install)
      install_app="1"
      shift
      ;;
    --launch)
      launch_app="1"
      shift
      ;;
    --no-grant)
      grant_location="0"
      shift
      ;;
    --no-wait)
      wait_for_start="0"
      shift
      ;;
    --dry-run)
      dry_run="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$route" ]]; then
  echo "Missing --route <file>." >&2
  usage >&2
  exit 2
fi

if ! [[ "$point_step" =~ ^[0-9]+$ ]] || [[ "$point_step" -lt 1 ]]; then
  echo "--step must be a positive integer." >&2
  exit 2
fi

if ! [[ "$max_points" =~ ^[0-9]+$ ]]; then
  echo "--max-points must be a non-negative integer." >&2
  exit 2
fi

resolve_route() {
  local candidate="$1"
  if [[ -f "$candidate" ]]; then
    cd "$(dirname "$candidate")" && printf '%s/%s\n' "$(pwd)" "$(basename "$candidate")"
    return
  fi
  if [[ -f "$MOBILE_ROOT/$candidate" ]]; then
    cd "$(dirname "$MOBILE_ROOT/$candidate")" && printf '%s/%s\n' "$(pwd)" "$(basename "$candidate")"
    return
  fi
  if [[ -f "$MOBILE_ROOT/app/src/main/assets/routes/$candidate" ]]; then
    cd "$MOBILE_ROOT/app/src/main/assets/routes" && printf '%s/%s\n' "$(pwd)" "$candidate"
    return
  fi
  return 1
}

route_path="$(resolve_route "$route")" || {
  echo "Route not found: $route" >&2
  exit 2
}

if [[ "$dry_run" == "0" ]]; then
  if [[ ! -x "$ADB" ]]; then
    echo "adb not found or not executable: $ADB" >&2
    exit 2
  fi

  if [[ -z "$serial" ]]; then
    serial="$("$ADB" devices | awk '/^emulator-[0-9]+[[:space:]]+device$/ { print $1; exit }')"
  fi

  if [[ -z "$serial" ]]; then
    echo "No running emulator found. Start one first, or pass --serial <id>." >&2
    exit 2
  fi
fi

adb_cmd=("$ADB")
if [[ -n "$serial" ]]; then
  adb_cmd+=("-s" "$serial")
fi

if [[ "$install_app" == "1" && "$dry_run" == "0" ]]; then
  (
    cd "$MOBILE_ROOT"
    JAVA_HOME="${JAVA_HOME:-$JAVA_HOME_DEFAULT}" ./gradlew assembleDebug
  )
  "${adb_cmd[@]}" install -r "$MOBILE_ROOT/app/build/outputs/apk/debug/app-debug.apk"
fi

if [[ "$grant_location" == "1" && "$dry_run" == "0" ]]; then
  "${adb_cmd[@]}" shell pm grant "$PACKAGE_NAME" android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1 || true
  "${adb_cmd[@]}" shell pm grant "$PACKAGE_NAME" android.permission.ACCESS_COARSE_LOCATION >/dev/null 2>&1 || true
fi

if [[ "$launch_app" == "1" && "$dry_run" == "0" ]]; then
  "${adb_cmd[@]}" shell am start -n "$ACTIVITY_NAME" >/dev/null
fi

if [[ "$wait_for_start" == "1" && "$dry_run" == "0" ]]; then
  cat <<EOF

TrailLite is ready for manual setup.

1. In the emulator, open Routes.
2. Select the bundled route matching:
   $(basename "$route_path")
3. Tap Start.
4. Press Enter here to begin GPS playback.

EOF
  read -r _
fi

echo "Route: $route_path"
echo "Interval: ${interval_seconds}s"
echo "Step: $point_step"
if [[ "$max_points" != "0" ]]; then
  echo "Max fixes: $max_points"
fi
if [[ "$dry_run" == "0" ]]; then
  echo "Emulator: $serial"
fi

python3 - "$route_path" "$point_step" "$max_points" <<'PY' | while IFS=$'\t' read -r ordinal latitude longitude; do
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1]
step = int(sys.argv[2])
max_points = int(sys.argv[3])

root = ET.parse(path).getroot()
points = []
for element in root.iter():
    tag = element.tag.split("}", 1)[-1]
    if tag != "trkpt":
        continue
    lat = element.attrib.get("lat")
    lon = element.attrib.get("lon")
    if lat is None or lon is None:
        continue
    points.append((float(lat), float(lon)))

if len(points) < 2:
    raise SystemExit(f"Expected at least two GPX track points, found {len(points)}")

emitted = 0
for index, (lat, lon) in enumerate(points):
    if index % step != 0:
        continue
    emitted += 1
    print(f"{emitted}\t{lat:.7f}\t{lon:.7f}", flush=True)
    if max_points and emitted >= max_points:
        break
PY
  if [[ "$dry_run" == "1" ]]; then
    printf '[%s] lat=%s lon=%s\n' "$ordinal" "$latitude" "$longitude"
  else
    printf '[%s] geo fix lon=%s lat=%s\n' "$ordinal" "$longitude" "$latitude"
    "${adb_cmd[@]}" emu geo fix "$longitude" "$latitude" 0 >/dev/null
    sleep "$interval_seconds"
  fi
done
