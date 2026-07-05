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
agent-browser click "#editButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (!state.importedEditingCopy) throw new Error("Imported route did not create editable copy on first edit");
window.__trailLiteTest.addPoint(24.941, 60.172);
state = window.__trailLiteTest.getState();
if (state.points.length !== 4) throw new Error(`Expected 4 points after add, got ${state.points.length}`);
window.__trailLiteTest.insertPoint(2, 24.9405, 60.1715);
state = window.__trailLiteTest.getState();
if (state.points.length !== 5) throw new Error(`Expected 5 points after insert, got ${state.points.length}`);
'
agent-browser eval '
window.__trailLiteTest.beginRouteDraw(24.942, 60.172);
window.__trailLiteTest.appendDrawPoint(24.943, 60.173);
window.__trailLiteTest.appendDrawPoint(24.944, 60.174);
window.__trailLiteTest.finishRouteDraw();
let state = window.__trailLiteTest.getState();
if (state.drawingRoute) throw new Error("Route draw did not finish");
if (state.points.length < 7) throw new Error(`Expected drag drawing to add points, got ${state.points.length}`);
if (state.status !== "Route segment drawn.") throw new Error(`Unexpected draw status: ${state.status}`);
'
agent-browser click "#undoButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (state.points.length !== 5) throw new Error(`Expected undo to remove drawn segment, got ${state.points.length}`);
'
agent-browser click "#undoButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (state.points.length !== 4) throw new Error(`Expected 4 points after undoing insert, got ${state.points.length}`);
const firstPointText = document.querySelector("#pointsList li:first-child code")?.textContent || "";
if (firstPointText !== "60.172000, 24.941000") throw new Error(`Latest point should render first, got ${firstPointText}`);
const firstPointIndex = document.querySelector("#pointsList li:first-child .point-index")?.textContent || "";
const lastPointIndex = document.querySelector("#pointsList li:last-child .point-index")?.textContent || "";
if (firstPointIndex !== "#4") throw new Error(`Latest visible point should keep route-order label #4, got ${firstPointIndex}`);
if (lastPointIndex !== "#1") throw new Error(`Oldest visible point should keep route-order label #1, got ${lastPointIndex}`);
'
agent-browser click "#pointsList li:first-child .point-delete"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (state.points.length !== 3) throw new Error(`Expected 3 points after delete, got ${state.points.length}`);
const latest = state.points[state.points.length - 1];
if (latest[0].toFixed(6) === "24.941000" && latest[1].toFixed(6) === "60.172000") {
  throw new Error("Deleting first visible point deleted the wrong route point");
}
'
agent-browser click "#undoButton"
agent-browser eval '
(async () => {
let state = window.__trailLiteTest.getState();
if (state.points.length !== 4) throw new Error(`Expected 4 points after undoing delete, got ${state.points.length}`);
window.__trailLiteTest.setRoute([
  [24.930000, 60.170000],
  [24.931000, 60.171000],
  [24.932000, 60.172000],
], "Point press test");
window.__trailLiteTest.startEditing();
await new Promise((resolve) => setTimeout(resolve, 80));
state = window.__trailLiteTest.getState();
const undoDepthBeforePointPress = state.undoDepth;
const canvas = document.querySelector(".maplibregl-canvas");
const rect = canvas.getBoundingClientRect();
const screenPoint = window.__trailLiteMap.project({ lng: state.points[1][0], lat: state.points[1][1] });
const eventOptions = {
  bubbles: true,
  cancelable: true,
  clientX: rect.left + screenPoint.x,
  clientY: rect.top + screenPoint.y,
  button: 0,
  buttons: 1,
};
canvas.dispatchEvent(new MouseEvent("mousemove", eventOptions));
canvas.dispatchEvent(new MouseEvent("mousedown", eventOptions));
window.dispatchEvent(new MouseEvent("mouseup", { ...eventOptions, buttons: 0 }));
await new Promise((resolve) => setTimeout(resolve, 80));
state = window.__trailLiteTest.getState();
if (state.undoDepth !== undoDepthBeforePointPress) {
  throw new Error(`Pressing a point without moving should not create undo history, got ${state.undoDepth} from ${undoDepthBeforePointPress}`);
}
window.__trailLiteMap.jumpTo({ center: [24.931000, 60.171000], zoom: 15 });
await new Promise((resolve) => setTimeout(resolve, 80));
const undoDepthBeforeDuplicateDrag = state.undoDepth;
window.__trailLiteTest.movePoint(1, state.points[2][0], state.points[2][1]);
state = window.__trailLiteTest.getState();
if (state.points[1][0].toFixed(6) === state.points[2][0].toFixed(6) &&
    state.points[1][1].toFixed(6) === state.points[2][1].toFixed(6)) {
  throw new Error(`Dragging onto an adjacent point should not create duplicate coordinates: ${JSON.stringify(state.points)}`);
}
if (state.undoDepth !== undoDepthBeforeDuplicateDrag) {
  throw new Error(`Rejected adjacent duplicate drag should not create undo history, got ${state.undoDepth} from ${undoDepthBeforeDuplicateDrag}`);
}
const undoDepthBeforeDuplicate = state.undoDepth;
const lastPoint = state.points[state.points.length - 1];
window.__trailLiteTest.addPoint(lastPoint[0], lastPoint[1]);
state = window.__trailLiteTest.getState();
if (state.points.length !== 3) throw new Error(`Duplicate endpoint add should not create a point, got ${state.points.length}`);
if (state.undoDepth !== undoDepthBeforeDuplicate) {
  throw new Error(`Duplicate endpoint add should not create undo history, got ${state.undoDepth} from ${undoDepthBeforeDuplicate}`);
}
const undoDepthBeforeDuplicateInsert = state.undoDepth;
const existingMiddlePoint = state.points[1];
window.__trailLiteTest.insertPoint(2, existingMiddlePoint[0], existingMiddlePoint[1]);
state = window.__trailLiteTest.getState();
if (state.points.length !== 3) throw new Error(`Adjacent duplicate insert should not create a point, got ${state.points.length}`);
if (state.undoDepth !== undoDepthBeforeDuplicateInsert) {
  throw new Error(`Adjacent duplicate insert should not create undo history, got ${state.undoDepth} from ${undoDepthBeforeDuplicateInsert}`);
}
window.__clearConfirmCalls = 0;
window.confirm = () => {
  window.__clearConfirmCalls += 1;
  return true;
};
})()
'
agent-browser click "#clearButton"
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (window.__clearConfirmCalls !== 1) throw new Error(`Clear should confirm before discarding unsaved route, got ${window.__clearConfirmCalls}`);
if (state.points.length !== 0) throw new Error("Clear did not remove route points");
if (state.canExport) throw new Error("Cleared route should not export");
true;
'
