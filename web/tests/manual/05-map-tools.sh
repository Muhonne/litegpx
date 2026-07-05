#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1800

agent-browser eval '
const state = window.__trailLiteTest.getState();
if (!state.layerSettings.streetNames) throw new Error("Street names should default on");
if (!state.layerSettings.pois) throw new Error("POIs should default on");
if (state.layerSettings.buildings) throw new Error("Buildings should default off");
if (!state.layerSettings.minorPaths) throw new Error("Paths and tracks should default on");
if (window.__trailLiteTest.getLayerVisibility("street-names") !== "visible") throw new Error("Street names layer should be visible");
if (window.__trailLiteTest.getLayerVisibility("poi-dots") !== "visible") throw new Error("POI dots layer should be visible");
if (window.__trailLiteTest.getLayerVisibility("buildings") !== "none") throw new Error("Buildings layer should default hidden");
if (window.__trailLiteTest.getLayerVisibility("roads-minor") !== "visible") throw new Error("Minor roads layer should be visible");
true;
'

agent-browser eval '
window.__trailLiteTest.setSelectedAreaBbox([24.93, 60.16, 24.94, 60.17]);
window.__trailLiteTest.setAreaDownloadBusy(true);
const button = document.querySelector("#downloadAreaButton");
if (!button.disabled) throw new Error("Download area map button should be disabled while busy");
if (button.getAttribute("aria-busy") !== "true") throw new Error("Download area map button should expose aria-busy while busy");
if (!button.querySelector(".spinner")) throw new Error("Download area map button should show a spinner while busy");
if (!button.textContent.includes("Downloading")) throw new Error(`Unexpected busy label: ${button.textContent}`);
window.__trailLiteTest.setAreaDownloadBusy(false);
true;
'

agent-browser click "#drawAreaButton"
agent-browser mouse move 430 350
agent-browser mouse down
agent-browser mouse move 700 520
agent-browser mouse up
agent-browser wait 300
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.areaSelectMode) throw new Error("Area select mode should finish after mouseup");
if (!state.selectedAreaBbox) throw new Error("Area bbox was not selected");
if (document.querySelector("#downloadAreaButton").disabled) throw new Error("Download area map should enable after selection");
if (!document.querySelector("#areaStatusText").textContent.includes("BBox")) {
  throw new Error(`Unexpected area status: ${document.querySelector("#areaStatusText").textContent}`);
}
for (const layerId of ["selected-area-fill", "selected-area-outline"]) {
  if (!window.__trailLiteMap.getLayer(layerId)) throw new Error(`${layerId} should exist`);
}
const [minLon, minLat, maxLon, maxLat] = state.selectedAreaBbox;
const first = window.__trailLiteMap.project([minLon, minLat]);
const second = window.__trailLiteMap.project([maxLon, maxLat]);
const areaFeatures = window.__trailLiteMap
  .queryRenderedFeatures([
    { x: Math.min(first.x, second.x), y: Math.min(first.y, second.y) },
    { x: Math.max(first.x, second.x), y: Math.max(first.y, second.y) },
  ])
  .filter((feature) => feature.source === "selected-area");
if (areaFeatures.length === 0) throw new Error("Selected area should render on the map");
window.__trailLiteTest.setSelectedAreaBbox(null);
true;
'

agent-browser click "#poisToggle"
agent-browser click "#buildingsToggle"
agent-browser click "#minorPathsToggle"
agent-browser click "#streetNamesToggle"
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.layerSettings.pois) throw new Error("POIs setting did not turn off");
if (!state.layerSettings.buildings) throw new Error("Buildings setting did not turn on");
if (state.layerSettings.minorPaths) throw new Error("Paths and tracks setting did not turn off");
if (state.layerSettings.streetNames) throw new Error("Street names setting did not turn off");
if (window.__trailLiteTest.getLayerVisibility("poi-dots") !== "none") throw new Error("POI dots layer should be hidden");
if (window.__trailLiteTest.getLayerVisibility("poi-names") !== "none") throw new Error("POI names layer should be hidden");
if (window.__trailLiteTest.getLayerVisibility("buildings") !== "visible") throw new Error("Buildings layer should be visible");
if (window.__trailLiteTest.getLayerVisibility("roads-minor") !== "none") throw new Error("Minor roads layer should be hidden");
if (window.__trailLiteTest.getLayerVisibility("paths-highlight") !== "none") throw new Error("Paths highlight layer should be hidden");
if (window.__trailLiteTest.getLayerVisibility("street-names") !== "none") throw new Error("Street names layer should be hidden");
true;
'

agent-browser fill "#searchInput" "Helsinki"
agent-browser click "#searchButton"
agent-browser wait 1600
agent-browser eval '
const state = window.__trailLiteTest.getState();
const [lon, lat] = state.mapCenter;
if (Math.abs(lon - 24.9384) > 0.05 || Math.abs(lat - 60.1699) > 0.05) {
  throw new Error(`Search did not move near Helsinki: ${lon}, ${lat}`);
}
if (state.mapZoom < 11.5) throw new Error(`Search zoom too low: ${state.mapZoom}`);
if (state.status !== "Located Helsinki.") throw new Error(`Unexpected search status: ${state.status}`);
true;
'

agent-browser fill "#searchInput" "NotARealFinnishPlace"
agent-browser click "#searchButton"
agent-browser wait 300
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.status !== "Place not found.") throw new Error(`Unexpected missing-place status: ${state.status}`);
true;
'
