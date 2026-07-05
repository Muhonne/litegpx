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
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const tick = () => {
      const state = window.__trailLiteTest.getState();
      if (!state.dataset.baseLoading) return resolve();
      if (Date.now() > deadline) return reject(new Error("Dataset size did not load"));
      setTimeout(tick, 100);
    };
    tick();
  });
  const state = window.__trailLiteTest.getState();
  if (!Number.isFinite(state.dataset.baseBytes) || state.dataset.baseBytes <= 0) {
    throw new Error(`Bad base dataset size: ${state.dataset.baseBytes}`);
  }
  for (const selector of ["#baseDatasetSize", "#totalDatasetSize"]) {
    const text = document.querySelector(selector)?.textContent || "";
    if (!text || text === "Loading" || text === "Unknown") throw new Error(`Bad dataset text for ${selector}: ${text}`);
  }
  return true;
})()
'

agent-browser eval '
if (!document.querySelector("#doneButton").hidden) throw new Error("Done should be hidden outside edit mode");
if (!document.querySelector("#undoButton").hidden) throw new Error("Undo should be hidden outside edit mode");
if (!document.querySelector("#redoButton").hidden) throw new Error("Redo should be hidden outside edit mode");
if (!document.querySelector("#newRouteButton").hidden) throw new Error("Reset should be hidden without a route");
if (!document.querySelector("#fitRouteButton").hidden) throw new Error("Fit route should be hidden without a route");
if (!document.querySelector("#clearButton").hidden) throw new Error("Clear should be hidden without a route");
if (!document.querySelector("#exportButton").hidden) throw new Error("Save route should be hidden until exportable");
if (getComputedStyle(document.querySelector(".sidebar")).overflowY !== "auto") throw new Error("Sidebar should scroll when context panels exceed the viewport");
if (document.querySelector(".points-section").hidden === false) throw new Error("Point list should hide until route editing is active");
if (document.querySelector(".mobile-routes-section").hidden) throw new Error("Mobile route manager should be visible in view mode");
if (document.querySelector(".map-tools-section").hidden) throw new Error("Map tools should be visible in view mode");
if (document.querySelector("#editButton").textContent.trim() !== "Draw route") throw new Error("Blank route action should be Draw route");
if (document.querySelector(".shortcut-panel").open) throw new Error("Shortcuts should be collapsed by default");
true;
'

agent-browser eval '
document.querySelector(".shortcut-panel").open = true;
let required = ["E", "F"];
const visible = Array.from(document.querySelectorAll(".shortcut-list div:not([hidden]) kbd")).map((element) => element.textContent.trim());
for (const key of required) {
  if (!visible.includes(key)) throw new Error(`Missing shortcut: ${key}`);
}
if (visible.includes("Drag")) throw new Error("Edit-only drag shortcut should not show in route context");
if (document.querySelector("#editButton").dataset.shortcut !== "E") throw new Error("Edit shortcut badge missing");
true;
'

agent-browser eval '
(async () => {
window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
let state = window.__trailLiteTest.getState();
if (state.mode !== "edit") throw new Error(`E did not enter edit mode: ${state.mode}`);
if (state.cursor !== "crosshair") throw new Error(`Edit cursor should be crosshair: ${state.cursor}`);
if (!document.querySelector("#editButton").hidden) throw new Error("Edit button should hide while editing");
if (document.querySelector("#doneButton").hidden) throw new Error("Done button should show while editing");
if (document.querySelector("#importButton").hidden === false) throw new Error("Import should hide while editing");
if (!document.querySelector(".mobile-routes-section").hidden) throw new Error("Mobile route manager should hide while editing a route");
if (!document.querySelector(".map-tools-section").hidden) throw new Error("Map tools should hide while editing a route");
if (document.querySelector(".points-section").hidden) throw new Error("Point list should show while editing a route");
const visible = Array.from(document.querySelectorAll(".shortcut-list div:not([hidden]) kbd")).map((element) => element.textContent.trim());
for (const key of ["E", "Esc", "Ctrl+Z", "Ctrl+Y", "Drag", "Shift"]) {
  if (!visible.includes(key)) throw new Error(`Missing edit shortcut: ${key}`);
}
window.__trailLiteTest.addPoint(24.9384, 60.1699);
window.__trailLiteTest.addPoint(24.9392, 60.1705);
state = window.__trailLiteTest.getState();
if (state.points.length !== 2) throw new Error("Shortcut setup failed to add points");
if (document.querySelector("#newRouteButton").textContent.trim() !== "Reset") throw new Error("Existing route reset action missing");
if (document.querySelector("#editButton").textContent.trim() !== "Edit route") throw new Error("Existing route action should be Edit route");
if (document.querySelector("#fitRouteButton")?.hidden) throw new Error("Fit route should be visible for an existing route");
const routeCenter = [
  state.points.reduce((sum, point) => sum + point[0], 0) / state.points.length,
  state.points.reduce((sum, point) => sum + point[1], 0) / state.points.length,
];
window.__trailLiteMap.jumpTo({ center: [26.0, 61.0], zoom: 8 });
document.querySelector("#fitRouteButton").click();
await new Promise((resolve) => setTimeout(resolve, 650));
state = window.__trailLiteTest.getState();
if (Math.abs(state.mapCenter[0] - routeCenter[0]) > 0.03 || Math.abs(state.mapCenter[1] - routeCenter[1]) > 0.03) {
  throw new Error(`Fit route did not return near route center: ${state.mapCenter} vs ${routeCenter}`);
}
window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
state = window.__trailLiteTest.getState();
if (state.points.length !== 1) throw new Error(`Ctrl+Z did not undo a point: ${state.points.length}`);
if (state.redoDepth !== 1) throw new Error(`Undo did not populate redo stack: ${state.redoDepth}`);
window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true }));
state = window.__trailLiteTest.getState();
if (state.points.length !== 2) throw new Error(`Ctrl+Y did not redo a point: ${state.points.length}`);
if (state.redoDepth !== 0) throw new Error(`Redo stack should be empty after redo: ${state.redoDepth}`);
for (let i = 0; i < 12; i += 1) {
  window.__trailLiteTest.addPoint(24.94 + i * 0.001, 60.17 + i * 0.001);
}
state = window.__trailLiteTest.getState();
if (state.undoDepth !== 10) throw new Error(`Undo history should keep last 10 actions: ${state.undoDepth}`);
window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
state = window.__trailLiteTest.getState();
if (state.mode !== "view") throw new Error(`Escape did not leave edit mode: ${state.mode}`);
window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
state = window.__trailLiteTest.getState();
if (state.mode !== "edit") throw new Error(`E did not re-enter edit mode: ${state.mode}`);
window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
state = window.__trailLiteTest.getState();
if (state.mode !== "view") throw new Error(`E did not toggle back to view mode: ${state.mode}`);
if (document.querySelector(".mobile-routes-section").hidden) throw new Error("Mobile route manager should return after leaving edit mode");
if (document.querySelector(".map-tools-section").hidden) throw new Error("Map tools should return after leaving edit mode");
if (document.querySelector(".points-section").hidden === false) throw new Error("Point list should hide after leaving edit mode");
true;
})()
'

agent-browser eval '
window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
if (document.activeElement?.id !== "searchInput") throw new Error("F did not focus search");
true;
'
