#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1500
agent-browser click "#editButton"
agent-browser fill "#routeName" "Created Route"
agent-browser mouse move 850 420
agent-browser mouse down
agent-browser mouse up
agent-browser mouse move 900 460
agent-browser mouse down
agent-browser mouse up
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.mode !== "edit") throw new Error("Route is not in edit mode");
if (state.points.length !== 2) throw new Error(`Expected two clicked points, got ${state.points.length}`);
if (!state.canExport) throw new Error("Route should be exportable");
const gpx = window.__trailLiteTest.exportGpx();
if (!gpx.includes("creator=\"LiteGPX Web\"")) throw new Error("GPX creator should use LiteGPX Web");
if (!gpx.includes("<name>Created Route</name>")) throw new Error("GPX name missing");
if (!gpx.includes("<trkpt lat=")) throw new Error("trkpt geometry missing");
if (gpx.includes("<rtept")) throw new Error("GPX should not use rtept geometry");
true;
'
