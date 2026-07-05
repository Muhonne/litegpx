#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser network requests --clear >/dev/null 2>&1 || true
agent-browser set viewport 1440 900
agent-browser open http://localhost:5173/web/
agent-browser wait 5500

agent-browser eval '
const state = window.__trailLiteTest?.getState();
if (!state) throw new Error("TrailLite test API missing");
if (state.status !== "Map view ready.") throw new Error(`Unexpected status: ${state.status}`);
const canvas = document.querySelector(".maplibregl-canvas");
if (!canvas || canvas.width < 500 || canvas.height < 500) throw new Error("Map canvas is not rendered");
const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
if (!resources.some((name) => name.includes("build.protomaps.com"))) {
  throw new Error("Expected full Protomaps base map request");
}
if (!state.mapSourceUrl.includes("build.protomaps.com")) {
  throw new Error(`Unexpected web base source: ${state.mapSourceUrl}`);
}
if (!state.detailMaps.some((entry) => entry.url.includes("shared/maps/finland.pmtiles"))) {
  throw new Error("Expected Android bundled map detail overlay");
}
if (!state.detailMaps.some((entry) => entry.url.includes("shared/maps/finland.providers.pmtiles"))) {
  throw new Error("Expected Android provider detail overlay");
}
const layers = window.__trailLiteMap.getStyle().layers;
const waterLayer = layers.find((layer) => layer.id === "water");
const waterwayLayer = layers.find((layer) => layer.id === "waterway");
if (JSON.stringify(waterLayer?.filter) !== JSON.stringify(["==", ["geometry-type"], "Polygon"])) {
  throw new Error(`Water fill must render only polygon geometry, got ${JSON.stringify(waterLayer?.filter)}`);
}
if (JSON.stringify(waterwayLayer?.filter) !== JSON.stringify(["==", ["geometry-type"], "LineString"])) {
  throw new Error(`Waterway stroke must render only line geometry, got ${JSON.stringify(waterwayLayer?.filter)}`);
}
const detailLayerCount = layers.filter((layer) => /^detail-osm-/.test(layer.id)).length;
const renderedDetailMaps = state.detailMaps.filter((entry) => entry.kind === "provider");
const expectedDetailLayerCount = renderedDetailMaps.length * 10;
if (detailLayerCount !== expectedDetailLayerCount) {
  throw new Error(`Expected ${expectedDetailLayerCount} detail overlay layers, got ${detailLayerCount}`);
}
const detailFillLayers = layers
  .filter((layer) => /^detail-osm-/.test(layer.id))
  .filter((layer) => ["earth", "water", "landcover-park", "landuse-green", "boundaries"].some((id) => layer.id.endsWith(`-${id}`)));
if (detailFillLayers.length > 0) {
  throw new Error(`Detail overlays should not clone broad fill layers: ${detailFillLayers.map((layer) => layer.id).join(", ")}`);
}
true;
'

agent-browser screenshot "$ROOT/web/tests/manual/00-map-foundation.png"
