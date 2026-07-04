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
window.fetch = async (url, options = {}) => {
  if (String(url).includes("/api/save-mobile-route")) {
    window.__mobileSaveRequest = {
      url: String(url),
      body: JSON.parse(options.body),
    };
    return new Response(JSON.stringify({
      route: {
        file: "mobile/app/src/main/assets/routes/mobile-save-test.gpx",
      },
      map: {
        mobileFile: "shared/maps/finland.pmtiles",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(url, options);
};
true;
'

agent-browser click "#mobileSaveButton"
agent-browser wait 300

agent-browser eval '
const request = window.__mobileSaveRequest;
if (!request) throw new Error("Mobile save endpoint was not called");
if (request.body.routeName !== "Mobile Save Test") throw new Error(`Bad route name: ${request.body.routeName}`);
if (!request.body.gpx.includes("<trkpt")) throw new Error("Mobile save request did not include GPX track points");
if (request.body.bufferMeters !== 1000) throw new Error(`Unexpected buffer: ${request.body.bufferMeters}`);
if (request.body.coverage !== "corridor") throw new Error(`Unexpected coverage: ${request.body.coverage}`);
const state = window.__trailLiteTest.getState();
if (!state.status.includes("Saved to mobile app")) throw new Error(`Unexpected status: ${state.status}`);
true;
'
