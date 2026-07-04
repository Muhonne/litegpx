#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser network requests --clear >/dev/null 2>&1 || true
agent-browser set viewport 1440 900
agent-browser open http://localhost:5173/web/
agent-browser wait 2500

agent-browser eval '
const state = window.__trailLiteTest?.getState();
if (!state) throw new Error("TrailLite test API missing");
if (state.status !== "Map view ready.") throw new Error(`Unexpected status: ${state.status}`);
const canvas = document.querySelector(".maplibregl-canvas");
if (!canvas || canvas.width < 500 || canvas.height < 500) throw new Error("Map canvas is not rendered");
if (!performance.getEntriesByType("resource").some((entry) => entry.name.includes("finland.pmtiles"))) {
  throw new Error("Expected PMTiles resource request");
}
true;
'

agent-browser screenshot "$ROOT/web/tests/manual/00-map-foundation.png"
