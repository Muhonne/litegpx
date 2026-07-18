export const FALLBACK_FULL_BASE_MAP_URL = "https://build.protomaps.com/20260716.pmtiles";
export const LOCAL_BASE_MAP_URL = `${window.location.origin}/shared/maps/finland.pmtiles`;
export const SHARED_DETAIL_MAPS = [
  { url: LOCAL_BASE_MAP_URL, name: "Android bundled map", kind: "base-extract" },
  { url: `${window.location.origin}/shared/maps/finland.providers.pmtiles`, name: "Android provider overlay", kind: "provider" },
];

export const BASE_MAP_SOURCE_ID = "osm";
export const SNAP_LINE_LAYER_IDS = ["roads-major", "roads-minor", "paths-highlight"];
export const BROAD_BASE_LAYER_IDS = new Set([
  "earth",
  "landuse-green",
  "landcover-park",
  "water",
  "boundaries",
  "waterway",
  "place-names",
]);

export const LAYER_GROUPS = {
  streetNames: ["street-names"],
  pois: ["poi-dots", "poi-names"],
  buildings: ["buildings"],
  minorPaths: ["paths-highlight-casing", "paths-highlight", "roads-minor-casing", "roads-minor"],
};

export const DETAIL_OVERLAY_LAYER_IDS = new Set([
  "buildings",
  "roads-minor-casing",
  "roads-minor",
  "paths-highlight-casing",
  "paths-highlight",
  "roads-major-casing",
  "roads-major",
  "street-names",
  "poi-dots",
  "poi-names",
]);
export const RENDERED_DETAIL_KINDS = new Set(["provider"]);

export async function loadStyle(baseMapUrl) {
  const response = await fetch("../shared/styles/style_template.json");
  const style = await response.json();
  style.glyphs = `${window.location.origin}/shared/glyphs/{fontstack}/{range}.pbf`;
  style.sources[BASE_MAP_SOURCE_ID].url = `pmtiles://${baseMapUrl}`;
  return style;
}

export function detailOverlayBaseLayers(map) {
  return baseMapLayers(map).filter((layer) =>
    DETAIL_OVERLAY_LAYER_IDS.has(layer.id) && !BROAD_BASE_LAYER_IDS.has(layer.id),
  );
}

export function detailLayerForMap(detailMap, layer, layerId) {
  const detailLayer = {
    ...structuredClone(layer),
    id: layerId,
    source: detailMap.sourceId,
  };
  if (detailMap.kind !== "provider") return detailLayer;
  detailLayer.paint = {
    ...(detailLayer.paint || {}),
    ...providerLayerPaintOverrides(layer.id),
  };
  if (layer.id === "buildings") {
    detailLayer.minzoom = Math.min(layer.minzoom || 13, 13);
  }
  return detailLayer;
}

export function detailLayerId(sourceId, layerId) {
  return `${sourceId}-${layerId}`;
}

export function classifyDetailMapKind(url, name = "") {
  const value = `${url} ${name}`.toLowerCase();
  if (value.includes("providers.pmtiles") || value.includes("-finnish-")) return "provider";
  return "base-extract";
}

function baseMapLayers(map) {
  return map.getStyle().layers.filter((layer) => layer.source === BASE_MAP_SOURCE_ID);
}

function providerLayerPaintOverrides(layerId) {
  if (layerId === "roads-major-casing") {
    return {
      "line-color": "#EAF4FF",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.8, 15, 6.6],
      "line-opacity": 0.88,
    };
  }
  if (layerId === "roads-major") {
    return {
      "line-color": "#0B5CAD",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.1, 15, 4.8],
      "line-opacity": 0.9,
    };
  }
  if (layerId === "roads-minor-casing" || layerId === "paths-highlight-casing") {
    return {
      "line-color": "#ECFDF5",
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 15, 4.5],
      "line-opacity": 0.86,
    };
  }
  if (layerId === "roads-minor") {
    return {
      "line-color": "#047857",
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 15, 3.2],
      "line-opacity": 0.9,
    };
  }
  if (layerId === "paths-highlight") {
    return {
      "line-color": "#6B8E23",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 15, 3.0],
      "line-opacity": 0.95,
      "line-dasharray": [1.2, 1.0],
    };
  }
  if (layerId === "buildings") {
    return {
      "fill-color": "#70675D",
      "fill-opacity": 0.58,
    };
  }
  if (layerId === "poi-dots") {
    return {
      "circle-color": "#7C3AED",
      "circle-opacity": 0.9,
    };
  }
  if (layerId === "poi-names") {
    return {
      "text-color": "#4C1D95",
      "text-halo-color": "#FFFFFF",
      "text-halo-width": 1.3,
    };
  }
  return {};
}
