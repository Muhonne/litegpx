#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1200

agent-browser eval '
(async () => {
const routeFixtures = Array.from({ length: 10 }, (_, index) => {
  const routeNumber = index + 1;
  return {
    id: `route-${routeNumber}`,
    title: `Route ${routeNumber}`,
    lengthKm: routeNumber,
    trackPointCount: routeNumber + 10,
    gpx: `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Route ${routeNumber}</name><trkseg>
    <trkpt lat="60.${String(170000 + routeNumber).padStart(6, "0")}" lon="24.930000" />
    <trkpt lat="60.${String(171000 + routeNumber).padStart(6, "0")}" lon="24.931000" />
  </trkseg></trk>
</gpx>`,
  };
});
window.__trailLiteTest.setMobileRoutesForTest(routeFixtures);
const allCards = Array.from(document.querySelectorAll("#mobileRouteList [data-mobile-route-id]"));
if (allCards.length !== routeFixtures.length) {
  throw new Error(`Visible mobile route list should expose all filtered routes, got ${allCards.length} of ${routeFixtures.length}`);
}
const routeSearchForAll = document.querySelector("#mobileRouteSearch");
routeSearchForAll.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
if (document.querySelector("#mobileRouteSelect").value !== "route-2") {
  throw new Error(`ArrowDown should select route-2, got ${document.querySelector("#mobileRouteSelect").value}`);
}
if (!document.querySelector("#mobileRouteList [data-mobile-route-id=\"route-2\"]")?.classList.contains("selected")) {
  throw new Error("ArrowDown should update the visible selected route");
}
routeSearchForAll.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
if (document.querySelector("#mobileRouteSelect").value !== "route-1") {
  throw new Error(`ArrowUp should select route-1, got ${document.querySelector("#mobileRouteSelect").value}`);
}
const lastCard = allCards.at(-1);
if (lastCard.dataset.mobileRouteId !== "route-10") {
  throw new Error(`Last visible mobile route should be route-10, got ${lastCard.dataset.mobileRouteId}`);
}
lastCard.click();
if (document.querySelector("#mobileRouteSelect").value !== "route-10") {
  throw new Error("Clicking the last visible mobile route should select it");
}

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
const routeCards = Array.from(document.querySelectorAll("#mobileRouteList [data-mobile-route-id]"));
if (routeCards.length !== 1 || routeCards[0].dataset.mobileRouteId !== "pajamaki-test") {
  throw new Error(`Visible mobile route list should show only Pajamaki Test, got ${routeCards.map((card) => card.textContent.trim()).join(" | ")}`);
}
routeCards[0].click();
if (document.querySelector("#mobileRouteSelect").value !== "pajamaki-test") {
  throw new Error("Clicking a mobile route list item should select that route");
}
const status = document.querySelector("#mobileRouteStatus")?.textContent || "";
if (!status.includes("1 of 2")) throw new Error(`Filtered route status missing count: ${status}`);
search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 80));
const state = window.__trailLiteTest.getState();
if (state.routeName !== "Pajamaki Test") throw new Error(`Selected mobile route did not load: ${state.routeName}`);
if (state.mode !== "view") throw new Error(`Loaded mobile route should start in view mode: ${state.mode}`);
if (!state.imported) throw new Error("Loaded mobile route should be treated as imported");
if (state.points.length !== 2) throw new Error(`Loaded mobile route point count wrong: ${state.points.length}`);
if (state.routeSaveState !== "Saved to mobile") throw new Error(`Loaded mobile route should start clean, got ${state.routeSaveState}`);
const loadButton = document.querySelector("#loadMobileRouteButton");
if (!loadButton.disabled || loadButton.textContent.trim() !== "Loaded") {
  throw new Error(`Selected clean loaded route should disable load action as Loaded, got "${loadButton.textContent.trim()}" disabled=${loadButton.disabled}`);
}
const loadedCard = document.querySelector("#mobileRouteList [data-mobile-route-id=\"pajamaki-test\"]");
if (!loadedCard?.classList.contains("loaded")) {
  throw new Error("Loaded mobile route should be visibly marked in the route list");
}
if (!loadedCard.textContent.includes("Loaded")) {
  throw new Error(`Loaded mobile route should show a Loaded badge, got ${loadedCard.textContent.trim()}`);
}
search.value = "no-such-route";
search.dispatchEvent(new Event("input", { bubbles: true }));
if (document.querySelectorAll("#mobileRouteList [data-mobile-route-id]").length !== 0) {
  throw new Error("No-match filter should hide route cards");
}
search.value = "";
search.dispatchEvent(new Event("input", { bubbles: true }));
if (document.querySelector("#mobileRouteSelect").value !== "pajamaki-test") {
  throw new Error(`Clearing a no-match filter should restore the loaded route selection, got ${document.querySelector("#mobileRouteSelect").value}`);
}
if (!document.querySelector("#mobileRouteList [data-mobile-route-id=\"pajamaki-test\"]")?.classList.contains("selected")) {
  throw new Error("Clearing a no-match filter should visibly select the loaded route");
}
true;
})()
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
let loadButton = document.querySelector("#loadMobileRouteButton");
if (loadButton.disabled || loadButton.textContent.trim() !== "Revert changes") {
  throw new Error(`Selected dirty loaded route should offer revert action, got "${loadButton.textContent.trim()}" disabled=${loadButton.disabled}`);
}
let loadedCard = document.querySelector("#mobileRouteList [data-mobile-route-id=\"pajamaki-test\"]");
if (!loadedCard?.classList.contains("unsaved")) {
  throw new Error("Renaming a loaded mobile route should mark its route-list item unsaved");
}
if (!loadedCard.textContent.includes("Unsaved")) {
  throw new Error(`Unsaved loaded route should show an Unsaved badge, got ${loadedCard.textContent.trim()}`);
}
if (!loadedCard.textContent.includes("Renamed Pajamaki") || loadedCard.textContent.includes("Pajamaki TestUnsaved")) {
  throw new Error(`Unsaved loaded route should show the draft route name, got ${loadedCard.textContent.trim()}`);
}
const draftSearch = document.querySelector("#mobileRouteSearch");
draftSearch.value = "renamed";
draftSearch.dispatchEvent(new Event("input", { bubbles: true }));
loadedCard = document.querySelector("#mobileRouteList [data-mobile-route-id=\"pajamaki-test\"]");
if (!loadedCard?.classList.contains("unsaved")) {
  throw new Error("Route filter should find a dirty loaded route by its draft name");
}
draftSearch.value = "";
draftSearch.dispatchEvent(new Event("input", { bubbles: true }));
loadButton = document.querySelector("#loadMobileRouteButton");
let revertConfirmCalls = 0;
const originalConfirmForRevert = window.confirm;
window.confirm = () => {
  revertConfirmCalls += 1;
  return true;
};
loadButton.click();
await new Promise((resolve) => setTimeout(resolve, 80));
window.confirm = originalConfirmForRevert;
state = window.__trailLiteTest.getState();
if (revertConfirmCalls !== 1) throw new Error(`Reverting a dirty loaded route should confirm once, got ${revertConfirmCalls}`);
if (state.routeName !== "Pajamaki Test") throw new Error(`Revert should restore saved route name, got ${state.routeName}`);
if (state.routeSaveState !== "Saved to mobile") throw new Error(`Revert should restore saved mobile state, got ${state.routeSaveState}`);
if (state.status !== "Mobile route changes reverted.") throw new Error(`Revert should use a specific status, got ${state.status}`);
loadButton = document.querySelector("#loadMobileRouteButton");
if (!loadButton.disabled || loadButton.textContent.trim() !== "Loaded") {
  throw new Error(`Reverted route should return to Loaded action, got "${loadButton.textContent.trim()}" disabled=${loadButton.disabled}`);
}
loadedCard = document.querySelector("#mobileRouteList [data-mobile-route-id=\"pajamaki-test\"]");
if (loadedCard?.classList.contains("unsaved") || loadedCard?.textContent.includes("Unsaved")) {
  throw new Error("Reverted route should clear the unsaved route-list marker");
}
document.querySelector("#routeName").value = "Renamed Pajamaki";
document.querySelector("#routeName").dispatchEvent(new Event("input", { bubbles: true }));
document.querySelector("#refreshMobileRoutesButton").click();
await new Promise((resolve) => setTimeout(resolve, 80));
loadedCard = document.querySelector("#mobileRouteList [data-mobile-route-id=\"pajamaki-test\"]");
if (!loadedCard?.classList.contains("unsaved")) {
  throw new Error("Refreshing mobile routes should preserve the loaded unsaved route card");
}
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
let confirmCalls = 0;
const originalConfirm = window.confirm;
window.confirm = () => {
  confirmCalls += 1;
  return false;
};
document.querySelector("#mobileRouteSearch").value = "";
document.querySelector("#mobileRouteSearch").dispatchEvent(new Event("input", { bubbles: true }));
document.querySelector("#mobileRouteSelect").value = "forest-loop";
document.querySelector("#mobileRouteSelect").dispatchEvent(new Event("change", { bubbles: true }));
loadButton = document.querySelector("#loadMobileRouteButton");
if (loadButton.disabled || loadButton.textContent.trim() !== "Load route") {
  throw new Error(`Selecting another route should offer Load route, got "${loadButton.textContent.trim()}" disabled=${loadButton.disabled}`);
}
document.querySelector("#loadMobileRouteButton").click();
await new Promise((resolve) => setTimeout(resolve, 80));
window.confirm = originalConfirm;
state = window.__trailLiteTest.getState();
if (confirmCalls !== 1) throw new Error(`Loading another route should ask once before discarding edits, got ${confirmCalls}`);
if (state.routeName !== "Renamed Pajamaki") throw new Error(`Cancelled load should keep edited route, got ${state.routeName}`);
if (document.querySelector("#mobileRouteSelect").value !== "pajamaki-test") {
  throw new Error(`Cancelled load should restore selected route, got ${document.querySelector("#mobileRouteSelect").value}`);
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
loadedCard = document.querySelector("#mobileRouteList [data-mobile-route-id=\"pajamaki-test\"]");
if (loadedCard?.classList.contains("unsaved") || loadedCard?.textContent.includes("Unsaved")) {
  throw new Error("Saving to mobile should clear the route-list unsaved marker");
}
if (!loadedCard?.textContent.includes("Renamed Pajamaki") || loadedCard.textContent.includes("Pajamaki TestLoaded")) {
  throw new Error(`Saved renamed route should keep the new route-list title, got ${loadedCard?.textContent.trim()}`);
}
true;
})()
'
