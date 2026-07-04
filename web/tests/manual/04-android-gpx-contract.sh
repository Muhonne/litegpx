#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1500
agent-browser eval '
window.__trailLiteTest.setRoute([[24.9384, 60.1699], [24.9392, 60.1705]], "Android Contract");
const gpx = window.__trailLiteTest.exportGpx();
const doc = new DOMParser().parseFromString(gpx, "application/xml");
const trkpts = [...doc.getElementsByTagName("trkpt")];
if (trkpts.length !== 2) throw new Error(`Expected 2 trkpt nodes, got ${trkpts.length}`);
for (const point of trkpts) {
  const lat = Number(point.getAttribute("lat"));
  const lon = Number(point.getAttribute("lon"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Invalid latitude");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Invalid longitude");
}
if (doc.getElementsByTagName("rtept").length > 0) throw new Error("Mobile parser does not consume rtept");
true;
'
