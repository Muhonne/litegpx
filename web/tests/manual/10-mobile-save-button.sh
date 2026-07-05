#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1500

agent-browser eval '
window.__trailLiteTest.setRoute([
  [24.9384, 60.1699],
  [24.9392, 60.1705]
], "Mobile Save Test");
const button = document.querySelector("#mobileSaveButton");
if (!button) throw new Error("Mobile save button missing");
if (button.hidden) throw new Error("Mobile save button should be visible for exportable route");
if (button.disabled) throw new Error("Mobile save button should be enabled for exportable route");
true;
'

agent-browser eval '
const originalFetch = window.fetch.bind(window);
window.__mobileSaveRequest = null;
window.__finishMobileSave = null;
window.fetch = async (url, options = {}) => {
  if (String(url).includes("/api/save-mobile-route")) {
    window.__mobileSaveRequest = {
      url: String(url),
      body: JSON.parse(options.body),
    };
    return new Promise((resolve) => {
      window.__finishMobileSave = () => resolve(new Response(JSON.stringify({
        route: {
          id: "mobile-save-test",
          title: "Mobile Save Test",
          file: "mobile/app/src/main/assets/routes/mobile-save-test.gpx",
          pointCount: 2,
          lengthKm: 0.1,
        },
        map: {
          mobileFile: "shared/maps/finland.pmtiles",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
  }
  if (String(url).includes("/api/mobile-routes")) {
    return new Response(JSON.stringify({ error: "catalog temporarily unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(url, options);
};
true;
'

agent-browser click "#mobileSaveButton"
agent-browser wait 120

agent-browser eval '
const request = window.__mobileSaveRequest;
if (!request) throw new Error("Mobile save endpoint was not called");
const button = document.querySelector("#mobileSaveButton");
if (!button.disabled) throw new Error("Mobile save button should stay disabled while saving");
if (button.getAttribute("aria-busy") !== "true") throw new Error("Mobile save button should expose busy state");
if (!button.textContent.includes("Saving")) throw new Error(`Mobile save button should show progress, got ${button.textContent}`);
if (request.body.routeName !== "Mobile Save Test") throw new Error(`Bad route name: ${request.body.routeName}`);
if (!request.body.gpx.includes("<trkpt")) throw new Error("Mobile save request did not include GPX track points");
if (request.body.bufferMeters !== 1000) throw new Error(`Unexpected buffer: ${request.body.bufferMeters}`);
if (request.body.coverage !== "corridor") throw new Error(`Unexpected coverage: ${request.body.coverage}`);
window.__finishMobileSave();
true;
'

agent-browser wait 300

agent-browser eval '
const button = document.querySelector("#mobileSaveButton");
if (button.getAttribute("aria-busy") !== "false") throw new Error("Mobile save button should clear busy state");
if (!button.textContent.includes("Save to mobile app")) throw new Error(`Mobile save button label did not restore: ${button.textContent}`);
const state = window.__trailLiteTest.getState();
if (!state.status.includes("Saved to mobile app")) throw new Error(`Unexpected status: ${state.status}`);
if (state.mobileRouteId !== "mobile-save-test") throw new Error(`Saved route id missing from state: ${state.mobileRouteId}`);
const savedCard = document.querySelector("#mobileRouteList [data-mobile-route-id=\"mobile-save-test\"]");
if (!savedCard?.classList.contains("loaded")) {
  throw new Error("Saved route should stay visible and marked loaded even if catalog refresh fails");
}
true;
'
