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
true;
'
