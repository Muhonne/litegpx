#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1200

agent-browser eval '
window.__trailLiteTest.setMobileRoutesForTest([
  {
    id: "forest-loop",
    title: "Forest Loop",
    lengthKm: 12.4,
    trackPointCount: 18,
    gpx: `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Forest Loop</name><trkseg>
    <trkpt lat="60.170000" lon="24.930000" />
    <trkpt lat="60.171000" lon="24.931000" />
  </trkseg></trk>
</gpx>`,
  },
  {
    id: "pajamaki-test",
    title: "Pajamaki Test",
    lengthKm: 7.6,
    trackPointCount: 4,
    gpx: `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Pajamaki Test</name><trkseg>
    <trkpt lat="60.220000" lon="24.850000" />
    <trkpt lat="60.221000" lon="24.851000" />
  </trkseg></trk>
</gpx>`,
  },
]);
const search = document.querySelector("#mobileRouteSearch");
if (!search) throw new Error("Mobile route search input missing");
search.value = "paja";
search.dispatchEvent(new Event("input", { bubbles: true }));
const options = Array.from(document.querySelectorAll("#mobileRouteSelect option")).map((option) => option.textContent.trim());
if (options.length !== 1 || !options[0].includes("Pajamaki Test")) {
  throw new Error(`Mobile route filter should show only Pajamaki Test, got ${options.join(" | ")}`);
}
const status = document.querySelector("#mobileRouteStatus")?.textContent || "";
if (!status.includes("1 of 2")) throw new Error(`Filtered route status missing count: ${status}`);
document.querySelector("#loadMobileRouteButton").click();
const state = window.__trailLiteTest.getState();
if (state.routeName !== "Pajamaki Test") throw new Error(`Selected mobile route did not load: ${state.routeName}`);
if (state.mode !== "view") throw new Error(`Loaded mobile route should start in view mode: ${state.mode}`);
if (!state.imported) throw new Error("Loaded mobile route should be treated as imported");
if (state.points.length !== 2) throw new Error(`Loaded mobile route point count wrong: ${state.points.length}`);
if (state.routeSaveState !== "Saved to mobile") throw new Error(`Loaded mobile route should start clean, got ${state.routeSaveState}`);
true;
'

agent-browser eval '
(async () => {
const originalFetch = window.fetch;
let capturedSaveBody = null;
window.fetch = async (url, options = {}) => {
  if (String(url).includes("/api/save-mobile-route")) {
    capturedSaveBody = JSON.parse(options.body || "{}");
    return new Response(JSON.stringify({
      route: { file: "pajamaki-test.gpx" },
      map: { mobileFile: "finland.pmtiles" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (String(url).includes("/api/datasets")) {
    return new Response(JSON.stringify({ datasets: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (String(url).includes("/api/mobile-routes")) {
    return new Response(JSON.stringify({ routes: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return originalFetch(url, options);
};
document.querySelector("#routeName").value = "Renamed Pajamaki";
document.querySelector("#routeName").dispatchEvent(new Event("input", { bubbles: true }));
let state = window.__trailLiteTest.getState();
if (state.routeSaveState !== "Unsaved mobile edits") {
  throw new Error(`Renaming loaded route should mark unsaved edits, got ${state.routeSaveState}`);
}
await window.__trailLiteTest.saveRouteToMobileApp();
window.fetch = originalFetch;
if (!capturedSaveBody) throw new Error("Save to mobile request was not captured");
if (capturedSaveBody.routeId !== "pajamaki-test") {
  throw new Error(`Save should preserve loaded mobile route id, got ${capturedSaveBody.routeId}`);
}
if (capturedSaveBody.routeName !== "Renamed Pajamaki") {
  throw new Error(`Save should use edited route name, got ${capturedSaveBody.routeName}`);
}
state = window.__trailLiteTest.getState();
if (state.routeSaveState !== "Saved to mobile") {
  throw new Error(`Save to mobile should clear unsaved state, got ${state.routeSaveState}`);
}
true;
})()
'
