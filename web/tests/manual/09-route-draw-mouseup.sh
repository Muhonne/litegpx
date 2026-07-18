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
(async () => {
window.__trailLiteTest.setRoute([], "Mouse draw test");
window.__trailLiteTest.setSnapToLines(false);
await new Promise((resolve, reject) => {
  const deadline = Date.now() + 5000;
  const tick = () => {
    if (window.__trailLiteMap.getLayer("route-points")) return resolve();
    if (Date.now() > deadline) return reject(new Error("Route point layer did not load"));
    setTimeout(tick, 100);
  };
  tick();
});
const lineColor = window.__trailLiteMap.getPaintProperty("route-line", "line-color");
const casingColor = window.__trailLiteMap.getPaintProperty("route-line-casing", "line-color");
const pointColor = window.__trailLiteMap.getPaintProperty("route-points", "circle-color");
const pointHaloColor = window.__trailLiteMap.getPaintProperty("route-point-halo", "circle-color");
const pointRadius = window.__trailLiteMap.getPaintProperty("route-points", "circle-radius");
const drawRouteButton = document.querySelector("#drawRouteButton");
if (!drawRouteButton || drawRouteButton.hidden) throw new Error("Draw line button should be visible in edit mode");
if (drawRouteButton.textContent.trim() !== "Draw line") throw new Error(`Draw line button label wrong: ${drawRouteButton?.textContent.trim()}`);
if (JSON.stringify(lineColor) !== JSON.stringify(["case", ["==", ["get", "mode"], "edit"], "#A855F7", "#FF5733"])) {
  throw new Error(`Route line should use a high-contrast active color, got ${JSON.stringify(lineColor)}`);
}
if (casingColor !== "#111827") throw new Error(`Route line casing should be dark, got ${JSON.stringify(casingColor)}`);
if (pointColor !== "#A855F7") throw new Error(`Edit route point centers should match the route color, got ${JSON.stringify(pointColor)}`);
if (pointHaloColor !== "#111827") throw new Error(`Route point halos should be dark, got ${JSON.stringify(pointHaloColor)}`);
if (JSON.stringify(pointRadius) !== JSON.stringify(["case", ["boolean", ["feature-state", "hover"], false], 9.5, 5.6])) {
  throw new Error(`Edit route points should be large enough to read on a moving map, got ${JSON.stringify(pointRadius)}`);
}
true;
})()
'

agent-browser eval '
window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
let state = window.__trailLiteTest.getState();
if (state.cursor !== "grab") throw new Error(`Shift should temporarily switch edit mode to map pan, got ${state.cursor}`);
document.querySelector("#drawRouteButton").click();
state = window.__trailLiteTest.getState();
if (state.cursor !== "crosshair") throw new Error(`Draw line should restore route drawing cursor, got ${state.cursor}`);
if (!document.querySelector("#drawRouteButton").classList.contains("active")) {
  throw new Error("Draw line button should show the active draw tool");
}
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
if (renderedRouteLines.length === 0) {
  throw new Error("Edit mode should render a continuous high-contrast route line behind point handles");
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

agent-browser eval '
window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
let state = window.__trailLiteTest.getState();
if (state.mode !== "view") throw new Error(`E should toggle edit mode off, got ${state.mode}`);
window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
state = window.__trailLiteTest.getState();
if (state.mode !== "edit") throw new Error(`E should toggle edit mode back on, got ${state.mode}`);
true;
'

agent-browser mouse move 520 360
agent-browser mouse down
agent-browser mouse move 590 430
agent-browser wait 150
agent-browser mouse up
agent-browser wait 150

agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.drawingRoute) throw new Error("Route drawing should stop after edit toggle and mouse up");
if (state.points.length < 2) throw new Error(`Mouse drag should still work after edit toggle, got ${state.points.length}`);
true;
'

agent-browser eval '
window.__trailLiteTest.setRoute([
  [24.930000, 60.170000],
  [24.931000, 60.171000],
], "Endpoint continuation");
window.__trailLiteTest.beginRouteDraw(24.931000, 60.171000);
window.__trailLiteTest.appendDrawPoint(24.932000, 60.172000);
window.__trailLiteTest.finishRouteDraw();
const state = window.__trailLiteTest.getState();
if (state.points.length !== 3) throw new Error(`Drawing from the current endpoint should append only the new point, got ${state.points.length}`);
if (state.points[1][0].toFixed(6) !== "24.931000" || state.points[1][1].toFixed(6) !== "60.171000") {
  throw new Error(`Existing endpoint changed unexpectedly: ${JSON.stringify(state.points[1])}`);
}
if (state.points[2][0].toFixed(6) !== "24.932000" || state.points[2][1].toFixed(6) !== "60.172000") {
  throw new Error(`New endpoint missing after continuation draw: ${JSON.stringify(state.points[2])}`);
}
window.__trailLiteTest.undoPointEdit();
const undone = window.__trailLiteTest.getState();
if (undone.points.length !== 2) throw new Error(`Undo should remove the continuation segment, got ${undone.points.length}`);
true;
'

agent-browser eval '
window.__trailLiteTest.setRoute([
  [24.930000, 60.170000],
  [24.931000, 60.171000],
], "Shift pan test");
window.__trailLiteTest.startEditing();
window.__shiftPanBefore = window.__trailLiteTest.getState();
window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
true;
'

agent-browser mouse move 740 420
agent-browser mouse down
agent-browser mouse move 900 520
agent-browser wait 150
agent-browser mouse up
agent-browser wait 250

agent-browser eval '
window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
const state = window.__trailLiteTest.getState();
const before = window.__shiftPanBefore;
if (state.points.length !== before.points.length) {
  throw new Error(`Shift+drag should pan the map without adding route points: ${before.points.length} -> ${state.points.length}`);
}
const moved = Math.abs(state.mapCenter[0] - before.mapCenter[0]) + Math.abs(state.mapCenter[1] - before.mapCenter[1]);
if (moved < 0.001) {
  throw new Error(`Shift+drag should move the map center, got delta ${moved}`);
}
if (state.cursor !== "crosshair") throw new Error(`Releasing Shift in edit mode should restore draw cursor, got ${state.cursor}`);
true;
'

agent-browser eval '
(async () => {
window.__trailLiteTest.setRoute([
  [24.930000, 60.170000],
  [24.940000, 60.180000],
], "Line insert click");
window.__trailLiteTest.setSnapToLines(false);
window.__trailLiteTest.startEditing();
window.__trailLiteMap.jumpTo({ center: [24.935000, 60.175000], zoom: 14, bearing: 0 });
await new Promise((resolve) => window.__trailLiteMap.once("idle", resolve));
true;
})()
'

agent-browser mouse move 780 400
agent-browser mouse down
agent-browser mouse up
agent-browser wait 150

agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.points.length !== 3) throw new Error(`Clicking the visible route line should insert one point, got ${state.points.length}`);
if (state.points[1][0].toFixed(6) !== "24.935000" || state.points[1][1].toFixed(6) !== "60.175000") {
  throw new Error(`Line click should insert into the segment, got ${JSON.stringify(state.points)}`);
}
true;
'
