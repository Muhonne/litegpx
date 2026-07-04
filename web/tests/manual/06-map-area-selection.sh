#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1800

agent-browser eval '
localStorage.removeItem("traillite.detailMaps.v1");
location.reload();
true;
'
agent-browser wait 1800

agent-browser eval '
const initial = window.__trailLiteTest.getState();
if (initial.areaSelection.bounds !== null) throw new Error("Area selection should start empty");
if (!document.querySelector("#downloadAreaButton").disabled) throw new Error("Download should be disabled without an area");
true;
'

agent-browser click "#selectAreaButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (!state.areaSelection.active) throw new Error("Area selection did not activate");
if (state.status !== "Drag a rectangle on the map.") throw new Error(`Unexpected area status: ${state.status}`);
true;
'

agent-browser click "#selectAreaButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (state.areaSelection.active) throw new Error("Area selection did not cancel");
true;
'

agent-browser eval '
window.__trailLiteTest.setAreaBounds({
  minLon: 24.93,
  minLat: 60.16,
  maxLon: 24.94,
  maxLat: 60.17,
});
const state = window.__trailLiteTest.getState();
if (!state.areaSelection.bounds) throw new Error("Area bounds were not stored");
if (document.querySelector("#downloadAreaButton").disabled) throw new Error("Download should be enabled with an area");
const text = window.__trailLiteTest.getAreaBboxText();
if (!text.includes("24.930000") || !text.includes("60.170000")) throw new Error(`Bad bbox text: ${text}`);
true;
'

agent-browser eval '
window.__trailLiteTest.finishAreaDownload(`${window.location.origin}/shared/maps/finland.pmtiles`, {
  name: "finished rectangle",
  sizeBytes: 1234
});
const state = window.__trailLiteTest.getState();
if (state.areaSelection.bounds !== null) throw new Error("Area rectangle should clear after download");
if (!document.querySelector("#downloadAreaButton").disabled) throw new Error("Download should disable after area clears");
const text = window.__trailLiteTest.getAreaBboxText();
if (text !== "No area selected.") throw new Error(`Area text should reset, got: ${text}`);
true;
'

agent-browser eval '
const uniqueUrl = `${window.location.origin}/shared/maps/finland.pmtiles?overlay-test=${Date.now()}`;
window.__trailLiteTest.addDetailMap(uniqueUrl);
const style = window.__trailLiteMap.getStyle();
if (!style.sources.osm?.url?.includes("/shared/maps/finland.pmtiles")) {
  throw new Error(`Base map source was replaced: ${JSON.stringify(style.sources.osm)}`);
}
const state = window.__trailLiteTest.getState();
if (!state.detailMaps.some((detailMap) => detailMap.url === uniqueUrl)) throw new Error("Unique detail map was not stored in state");
true;
'

agent-browser eval '
localStorage.setItem("traillite.detailMaps.v1", JSON.stringify([{
  url: `${window.location.origin}/shared/maps/finland.pmtiles`,
  name: "persisted test detail",
  sizeBytes: 1234
}]));
location.reload();
true;
'
agent-browser wait 1800
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (!state.detailMaps.some((detailMap) => detailMap.name === "persisted test detail")) {
  throw new Error(`Persisted detail map did not restore: ${JSON.stringify(state.detailMaps)}`);
}
localStorage.removeItem("traillite.detailMaps.v1");
true;
'
