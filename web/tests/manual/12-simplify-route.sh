#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1200

agent-browser eval '
const noisyRoute = [];
for (let index = 0; index < 25; index += 1) {
  noisyRoute.push([24.900000 + index * 0.001, 60.100000 + (index % 2 === 0 ? 0.00003 : -0.00003)]);
}
window.__trailLiteTest.setRoute(noisyRoute, "Simplify test");
window.__trailLiteTest.startEditing();
let state = window.__trailLiteTest.getState();
if (state.points.length !== noisyRoute.length) throw new Error("Simplify setup failed");
const button = document.querySelector("#simplifyButton");
if (!button) throw new Error("Simplify button missing");
if (button.hidden) throw new Error("Simplify button should show while editing a route");
if (button.disabled) throw new Error("Simplify button should be enabled for a dense route");
button.click();
state = window.__trailLiteTest.getState();
if (state.points.length >= noisyRoute.length) throw new Error(`Simplify did not reduce points: ${state.points.length}`);
const first = state.points[0];
const last = state.points[state.points.length - 1];
if (first[0] !== noisyRoute[0][0] || first[1] !== noisyRoute[0][1]) throw new Error("Simplify changed first point");
if (last[0] !== noisyRoute[noisyRoute.length - 1][0] || last[1] !== noisyRoute[noisyRoute.length - 1][1]) {
  throw new Error("Simplify changed last point");
}
if (state.routeSaveState !== "Not saved to mobile") throw new Error(`Simplified route should be unsaved, got ${state.routeSaveState}`);
if (state.undoDepth < 1) throw new Error("Simplify should be undoable");
window.__trailLiteTest.undoPointEdit();
state = window.__trailLiteTest.getState();
if (state.points.length !== noisyRoute.length) throw new Error(`Undo should restore simplified points, got ${state.points.length}`);
true;
'
