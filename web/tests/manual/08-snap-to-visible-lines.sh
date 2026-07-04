#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1800

agent-browser eval '
(async () => {
  window.__trailLiteTest.search("Helsinki");
  await new Promise((resolve) => setTimeout(resolve, 1600));
  let candidate = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    candidate = window.__trailLiteTest.findSnapTestCandidate();
    if (candidate) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!candidate) throw new Error("No visible line candidate found for snap test");
  if (candidate.distanceBeforePixels < 4) {
    throw new Error(`Snap test candidate is too close before snapping: ${candidate.distanceBeforePixels}`);
  }
  if (candidate.distanceAfterPixels > 1.5) {
    throw new Error(`Candidate did not snap onto visible line: ${candidate.distanceAfterPixels}`);
  }
  window.__snapCandidate = candidate;
  return candidate;
})()
'

agent-browser click "#editButton"
agent-browser eval '
(async () => {
const candidate = window.__snapCandidate;
if (!candidate) throw new Error("Missing stored snap candidate");
if (document.querySelector("#snapToLinesOption").hidden) throw new Error("Snap option should show while editing");
if (!document.querySelector("#snapToLinesToggle").checked) throw new Error("Snap option should default on");

window.__trailLiteTest.setRoute([], "Snap test");
window.__trailLiteTest.setSnapToLines(true);
await new Promise((resolve) => setTimeout(resolve, 150));
const expectedSnappedPoint = window.__trailLiteTest.snapPoint(candidate.testPoint[0], candidate.testPoint[1]);
window.__trailLiteTest.beginRouteDraw(candidate.testPoint[0], candidate.testPoint[1]);
window.__trailLiteTest.finishRouteDraw();
let state = window.__trailLiteTest.getState();
let point = state.points[0];
let pointScreen = window.__trailLiteMap.project(point);
let snappedScreen = window.__trailLiteMap.project(expectedSnappedPoint);
let diffFromSnapped = Math.hypot(pointScreen.x - snappedScreen.x, pointScreen.y - snappedScreen.y);
if (diffFromSnapped > 1.5) {
  throw new Error(`Drawn point did not use snapped coordinate: ${diffFromSnapped}`);
}

window.__trailLiteTest.setRoute([], "Raw test");
window.__trailLiteTest.setSnapToLines(false);
await new Promise((resolve) => setTimeout(resolve, 150));
window.__trailLiteTest.addPoint(candidate.testPoint[0], candidate.testPoint[1]);
state = window.__trailLiteTest.getState();
point = state.points[0];
pointScreen = window.__trailLiteMap.project(point);
const rawScreen = window.__trailLiteMap.project(candidate.testPoint);
const rawDiff = Math.hypot(pointScreen.x - rawScreen.x, pointScreen.y - rawScreen.y);
if (rawDiff > 0.5) {
  throw new Error(`Disabled snapping should keep raw coordinate: ${rawDiff}`);
}
if (window.__trailLiteTest.getState().snapToLines) throw new Error("Snap setting did not turn off");
true;
})()
'
