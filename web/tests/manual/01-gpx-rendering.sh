#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1500
agent-browser upload "#gpxInput" "$ROOT/web/tests/fixtures/simple-route.gpx"
agent-browser wait 800

agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.routeName !== "Simple Test Route") throw new Error(`Unexpected route name: ${state.routeName}`);
if (state.points.length !== 3) throw new Error(`Expected 3 points, got ${state.points.length}`);
if (state.mode !== "view") throw new Error(`Expected view mode, got ${state.mode}`);
if (state.distanceMeters <= 0) throw new Error("Distance was not calculated");
const lineLayer = window.maplibregl && document.querySelector(".maplibregl-canvas");
if (!lineLayer) throw new Error("Map canvas missing after GPX import");
true;
'
agent-browser eval 'window.__lastAlert = ""; window.alert = (message) => { window.__lastAlert = message; }; true;'
agent-browser upload "#gpxInput" "$ROOT/web/tests/fixtures/broken-route.gpx"
agent-browser wait 500
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (window.__lastAlert !== "format is fucked") throw new Error(`Unexpected alert: ${window.__lastAlert}`);
if (state.status !== "GPX import failed.") throw new Error(`Unexpected failure status: ${state.status}`);
if (state.points.length !== 3) throw new Error("Broken import should not replace existing route");
true;
'
