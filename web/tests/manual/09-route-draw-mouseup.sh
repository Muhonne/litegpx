#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser set viewport 1200 800
agent-browser open http://localhost:5173/web/
agent-browser wait 1500
agent-browser click "#editButton"

agent-browser eval '
window.__trailLiteTest.setRoute([], "Mouse draw test");
window.__trailLiteTest.setSnapToLines(false);
true;
'

agent-browser mouse move 650 380
agent-browser mouse down
agent-browser mouse move 720 440
agent-browser wait 150
agent-browser mouse move 790 500
agent-browser wait 150
agent-browser mouse up
agent-browser wait 150

agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.drawingRoute) throw new Error("Route drawing should stop on mouse up");
if (state.points.length < 2) throw new Error(`Mouse drag should add route points, got ${state.points.length}`);
const renderedRouteLines = window.__trailLiteMap.queryRenderedFeatures(undefined, { layers: ["route-line"] });
if (renderedRouteLines.length !== 0) {
  throw new Error(`Edit mode should draw route points only, got ${renderedRouteLines.length} rendered route line features`);
}
window.__pointsAfterMouseUp = state.points.length;
true;
'

agent-browser mouse move 980 680
agent-browser wait 300

agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.drawingRoute) throw new Error("Route drawing restarted after mouse up");
if (state.points.length !== window.__pointsAfterMouseUp) {
  throw new Error(`Mouse move after release kept adding points: ${window.__pointsAfterMouseUp} -> ${state.points.length}`);
}
true;
'

agent-browser click "#undoButton"
agent-browser wait 150

agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.points.length !== 0) throw new Error(`Undo after drag drawing should clear the drawn segment, got ${state.points.length}`);
if (!document.querySelector("#undoButton").disabled) throw new Error("Undo button should disable after undoing the only drawn segment");
true;
'
