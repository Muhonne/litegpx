export const VIEW_ROUTE_COLOR = "#FF5733";
export const EDIT_ROUTE_COLOR = "#A855F7";
export const ROUTE_HALO_COLOR = "#111827";
export const SELECTED_POINT_COLOR = "#F59E0B";
export const BREAK_SPOT_COLOR = "#2E7D32";
export const MAX_VISIBLE_ROUTE_POINTS = 180;

export function firstOverlayLayerId(map) {
  return [
    "route-line-casing",
    "route-line",
    "route-line-hit",
    "route-break-labels",
    "route-break-points",
    "route-point-halo",
    "route-points",
    "route-point-hit",
  ]
    .find((layerId) => map.getLayer(layerId));
}

export function ensureRouteLayers(map, initialData) {
  if (!map.getSource("route")) {
    map.addSource("route", {
      type: "geojson",
      data: initialData,
    });
  }
  if (!map.getLayer("route-line")) {
    map.addLayer({
      id: "route-line-casing",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "route-line"],
      paint: {
        "line-color": ROUTE_HALO_COLOR,
        "line-width": ["case", ["==", ["get", "mode"], "edit"], 9, 10],
        "line-opacity": 0.72,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "route-line"],
      paint: {
        "line-color": ["case", ["==", ["get", "mode"], "edit"], EDIT_ROUTE_COLOR, VIEW_ROUTE_COLOR],
        "line-width": ["case", ["==", ["get", "mode"], "edit"], 5, 6],
        "line-opacity": 0.98,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }
  if (!map.getLayer("route-line-hit")) {
    map.addLayer({
      id: "route-line-hit",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "route-line"],
      paint: {
        "line-color": "#000000",
        "line-width": 18,
        "line-opacity": 0,
      },
    });
  }
  if (!map.getLayer("route-point-halo")) {
    map.addLayer({
      id: "route-point-halo",
      type: "circle",
      source: "route",
      filter: ["==", ["get", "kind"], "route-point"],
      paint: {
        "circle-color": ["case", ["boolean", ["get", "selected"], false], SELECTED_POINT_COLOR, ROUTE_HALO_COLOR],
        "circle-radius": [
          "case",
          ["boolean", ["get", "selected"], false],
          13,
          ["boolean", ["feature-state", "hover"], false],
          12,
          8,
        ],
        "circle-opacity": ["case", ["==", ["get", "visible"], true], 0.72, 0],
      },
    });
  }
  if (!map.getLayer("route-points")) {
    map.addLayer({
      id: "route-points",
      type: "circle",
      source: "route",
      filter: ["==", ["get", "kind"], "route-point"],
      paint: {
        "circle-color": EDIT_ROUTE_COLOR,
        "circle-radius": [
          "case",
          ["boolean", ["get", "selected"], false],
          7.4,
          ["boolean", ["feature-state", "hover"], false],
          9.5,
          5.6,
        ],
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 2,
        "circle-opacity": ["case", ["==", ["get", "visible"], true], 1, 0],
      },
    });
  }
  if (!map.getLayer("route-point-hit")) {
    map.addLayer({
      id: "route-point-hit",
      type: "circle",
      source: "route",
      filter: ["==", ["get", "kind"], "route-point"],
      paint: {
        "circle-color": "#000000",
        "circle-radius": ["case", ["==", ["get", "visible"], true], 18, 0],
        "circle-opacity": 0,
      },
    });
  }
  if (!map.getLayer("route-break-points")) {
    map.addLayer({
      id: "route-break-points",
      type: "circle",
      source: "route",
      filter: ["==", ["get", "kind"], "break-spot"],
      paint: {
        "circle-color": BREAK_SPOT_COLOR,
        "circle-radius": 7,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 2.5,
        "circle-opacity": 0.98,
      },
    });
  }
  if (!map.getLayer("route-break-labels")) {
    map.addLayer({
      id: "route-break-labels",
      type: "symbol",
      source: "route",
      filter: ["==", ["get", "kind"], "break-spot"],
      layout: {
        "text-field": ["get", "name"],
        "text-size": 13,
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#1B5E20",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1.5,
      },
    });
  }
}

export function routeFeatureCollection(state) {
  const features = [];
  if (state.points.length >= 2) {
    features.push({
      type: "Feature",
      properties: { mode: state.mode, kind: "route-line" },
      geometry: { type: "LineString", coordinates: state.points },
    });
  }
  (state.breakSpots || []).forEach((spot, index) => {
    features.push({
      type: "Feature",
      id: `break-${index}`,
      properties: {
        kind: "break-spot",
        name: spot.name || "Break spot",
        description: spot.description || "",
      },
      geometry: { type: "Point", coordinates: spot.point },
    });
  });
  const visiblePointIndexes = new Set(visibleRoutePointIndexes(state.points.length));
  if (state.selectedPointIndex != null) visiblePointIndexes.add(state.selectedPointIndex);
  [...visiblePointIndexes].sort((left, right) => left - right).forEach((index) => {
    const point = state.points[index];
    features.push({
      type: "Feature",
      id: index,
      properties: {
        kind: "route-point",
        index,
        visible: state.mode === "edit",
        selected: index === state.selectedPointIndex,
      },
      geometry: { type: "Point", coordinates: point },
    });
  });
  return { type: "FeatureCollection", features };
}

function visibleRoutePointIndexes(pointCount) {
  if (pointCount <= MAX_VISIBLE_ROUTE_POINTS) {
    return Array.from({ length: pointCount }, (_, index) => index);
  }
  const step = Math.ceil(pointCount / MAX_VISIBLE_ROUTE_POINTS);
  const indexes = [];
  for (let index = 0; index < pointCount; index += step) indexes.push(index);
  if (indexes[indexes.length - 1] !== pointCount - 1) indexes.push(pointCount - 1);
  return indexes;
}
