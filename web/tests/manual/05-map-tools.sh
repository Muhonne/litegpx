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
