const FINLAND_CENTER = [24.94, 60.24];
const VIEW_ROUTE_COLOR = "#FF5733";
const EDIT_ROUTE_COLOR = "#1D73D4";
const EARTH_RADIUS_METERS = 6371000;
const SEARCH_ZOOM = 12;

const LAYER_GROUPS = {
  streetNames: ["street-names"],
  pois: ["poi-dots", "poi-names"],
  buildings: ["buildings"],
  minorPaths: ["paths-highlight", "roads-minor"],
};

const PLACE_INDEX = [
  { name: "Helsinki", aliases: ["helsingfors"], center: [24.9384, 60.1699] },
  { name: "Espoo", aliases: ["esbo"], center: [24.6559, 60.2055] },
  { name: "Vantaa", aliases: ["vanda"], center: [25.0378, 60.2941] },
  { name: "Turku", aliases: ["abo", "åbo"], center: [22.2666, 60.4518] },
  { name: "Tampere", aliases: ["tammerfors"], center: [23.7610, 61.4978] },
  { name: "Lahti", aliases: ["lahtis"], center: [25.6615, 60.9827] },
  { name: "Hämeenlinna", aliases: ["hameenlinna", "tavastehus"], center: [24.4643, 60.9959] },
  { name: "Porvoo", aliases: ["borga", "borgå"], center: [25.6651, 60.3932] },
  { name: "Kotka", aliases: [], center: [26.9459, 60.4664] },
  { name: "Kouvola", aliases: [], center: [26.7042, 60.8681] },
  { name: "Salo", aliases: [], center: [23.1290, 60.3831] },
  { name: "Lohja", aliases: ["lojo"], center: [24.0653, 60.2486] },
  { name: "Raasepori", aliases: ["raseborg", "tammisaari", "ekenäs", "ekenas"], center: [23.4369, 59.9736] },
];

const elements = {
  map: document.getElementById("map"),
  modeBadge: document.getElementById("modeBadge"),
  newRouteButton: document.getElementById("newRouteButton"),
  editButton: document.getElementById("editButton"),
  doneButton: document.getElementById("doneButton"),
  undoButton: document.getElementById("undoButton"),
  clearButton: document.getElementById("clearButton"),
  exportButton: document.getElementById("exportButton"),
  gpxInput: document.getElementById("gpxInput"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  streetNamesToggle: document.getElementById("streetNamesToggle"),
  poisToggle: document.getElementById("poisToggle"),
  buildingsToggle: document.getElementById("buildingsToggle"),
  minorPathsToggle: document.getElementById("minorPathsToggle"),
  routeName: document.getElementById("routeName"),
  distanceValue: document.getElementById("distanceValue"),
  pointCountValue: document.getElementById("pointCountValue"),
  statusText: document.getElementById("statusText"),
  pointsList: document.getElementById("pointsList"),
};

const state = {
  mode: "view",
  routeName: "Untitled route",
  points: [],
  undoStack: [],
  imported: false,
  importedEditingCopy: false,
  draggingPointIndex: null,
  dragStartPoints: null,
  hoveredPointId: null,
  skipNextMapClick: false,
  lastExportedGpx: "",
  layerSettings: {
    streetNames: true,
    pois: true,
    buildings: false,
    minorPaths: true,
  },
};

let map;

init();

async function init() {
  await initMap();
  bindUi();
  render();
  exposeTestApi();
}

async function initMap() {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const style = await loadStyle();
  map = new maplibregl.Map({
    container: elements.map,
    style,
    center: FINLAND_CENTER,
    zoom: 8,
    attributionControl: true,
  });
  window.__trailLiteMap = map;
  map.addControl(new maplibregl.NavigationControl(), "top-right");

  map.on("load", () => {
    applyLayerSettings();
    ensureRouteLayers();
    updateMapRoute();
    setStatus("Map view ready.");
  });

  map.on("click", (event) => {
    if (state.skipNextMapClick) {
      state.skipNextMapClick = false;
      return;
    }
    if (state.mode !== "edit") return;
    addPoint([event.lngLat.lng, event.lngLat.lat]);
  });

  map.on("click", "route-line-hit", (event) => {
    if (state.mode !== "edit" || state.points.length < 2 || !event.lngLat) return;
    state.skipNextMapClick = true;
    const point = [event.lngLat.lng, event.lngLat.lat];
    const index = nearestSegmentIndex(point, state.points);
    insertPoint(index + 1, point);
  });

  map.on("mouseenter", "route-points", (event) => {
    map.getCanvas().style.cursor = state.mode === "edit" ? "grab" : "";
    const feature = event.features?.[0];
    if (feature?.id !== undefined) setHoveredPoint(feature.id);
  });

  map.on("mouseleave", "route-points", () => {
    map.getCanvas().style.cursor = "";
    setHoveredPoint(null);
  });

  map.on("mousedown", "route-points", (event) => {
    if (state.mode !== "edit") return;
    const feature = event.features?.[0];
    if (!feature) return;
    event.preventDefault();
    state.draggingPointIndex = Number(feature.properties.index);
    state.dragStartPoints = clonePoints(state.points);
    map.getCanvas().style.cursor = "grabbing";
  });

  map.on("mousemove", (event) => {
    if (state.draggingPointIndex == null) return;
    const points = clonePoints(state.points);
    points[state.draggingPointIndex] = [event.lngLat.lng, event.lngLat.lat];
    state.points = points;
    updateMapRoute();
    renderSidebar();
  });

  map.on("mouseup", () => {
    if (state.draggingPointIndex == null) return;
    pushUndo(state.dragStartPoints);
    state.draggingPointIndex = null;
    state.dragStartPoints = null;
    map.getCanvas().style.cursor = "";
    render();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift" && state.mode === "edit") map.dragPan.enable();
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift" && state.mode === "edit") map.dragPan.disable();
  });
}

async function loadStyle() {
  const response = await fetch("../shared/styles/style_template.json");
  const style = await response.json();
  style.glyphs = `${window.location.origin}/shared/glyphs/{fontstack}/{range}.pbf`;
  style.sources.osm.url = `pmtiles://${window.location.origin}/shared/maps/finland.pmtiles`;
  return style;
}

function bindUi() {
  elements.newRouteButton.addEventListener("click", () => {
    state.routeName = "Untitled route";
    state.points = [];
    state.undoStack = [];
    state.imported = false;
    state.importedEditingCopy = false;
    state.mode = "view";
    elements.routeName.value = state.routeName;
    setStatus("New route ready.");
    render();
  });

  elements.editButton.addEventListener("click", () => startEditing());
  elements.doneButton.addEventListener("click", () => setMode("view"));
  elements.undoButton.addEventListener("click", () => undoPointEdit());
  elements.clearButton.addEventListener("click", () => {
    state.points = [];
    state.undoStack = [];
    state.imported = false;
    state.importedEditingCopy = false;
    setStatus("Route cleared.");
    render();
  });
  elements.exportButton.addEventListener("click", () => downloadGpx());
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    locateSearchQuery();
  });
  bindLayerToggle(elements.streetNamesToggle, "streetNames");
  bindLayerToggle(elements.poisToggle, "pois");
  bindLayerToggle(elements.buildingsToggle, "buildings");
  bindLayerToggle(elements.minorPathsToggle, "minorPaths");
  elements.routeName.addEventListener("input", () => {
    state.routeName = elements.routeName.value.trim() || "Untitled route";
    renderSidebar();
  });
  elements.gpxInput.addEventListener("change", async () => {
    const file = elements.gpxInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseGpx(text);
      if (parsed.points.length < 2) throw new Error("No usable GPX track");
      state.routeName = parsed.name || file.name.replace(/\.gpx$/i, "") || "Imported route";
      state.points = parsed.points;
      state.undoStack = [];
      state.imported = true;
      state.importedEditingCopy = false;
      state.mode = "view";
      elements.routeName.value = state.routeName;
      setStatus("Imported GPX for viewing.");
      fitRoute();
      render();
    } catch {
      alert("format is fucked");
      setStatus("GPX import failed.", true);
    } finally {
      elements.gpxInput.value = "";
    }
  });
}

function bindLayerToggle(element, settingKey) {
  element.addEventListener("change", () => {
    state.layerSettings[settingKey] = element.checked;
    applyLayerSettings();
    setStatus("Map layer settings updated.");
  });
}

function applyLayerSettings() {
  if (!map?.isStyleLoaded()) return;
  Object.entries(LAYER_GROUPS).forEach(([settingKey, layerIds]) => {
    layerIds.forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(
        layerId,
        "visibility",
        state.layerSettings[settingKey] ? "visible" : "none",
      );
    });
  });
}

function locateSearchQuery() {
  const query = elements.searchInput.value.trim();
  if (!query) return;
  const place = findPlace(query);
  if (!place) {
    setStatus("Place not found.", true);
    return;
  }
  map.flyTo({ center: place.center, zoom: SEARCH_ZOOM, essential: true });
  setStatus(`Located ${place.name}.`);
}

function findPlace(query) {
  const normalizedQuery = normalizeSearchText(query);
  return PLACE_INDEX.find((place) => {
    const names = [place.name, ...place.aliases].map(normalizeSearchText);
    return names.some((name) => name === normalizedQuery || name.startsWith(normalizedQuery));
  }) || null;
}

function ensureRouteLayers() {
  if (!map.getSource("route")) {
    map.addSource("route", {
      type: "geojson",
      data: routeFeatureCollection(),
    });
  }
  if (!map.getLayer("route-line")) {
    map.addLayer({
      id: "route-line-casing",
      type: "line",
      source: "route",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#FFFFFF",
        "line-width": 7,
        "line-opacity": 0.82,
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
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": ["case", ["==", ["get", "mode"], "edit"], EDIT_ROUTE_COLOR, VIEW_ROUTE_COLOR],
        "line-width": ["case", ["==", ["get", "mode"], "edit"], 4, 4],
        "line-opacity": 0.96,
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
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#000000",
        "line-width": 18,
        "line-opacity": 0,
      },
    });
  }
  if (!map.getLayer("route-points")) {
    map.addLayer({
      id: "route-points",
      type: "circle",
      source: "route",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": EDIT_ROUTE_COLOR,
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 7, 4],
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 1.5,
        "circle-opacity": ["case", ["==", ["get", "visible"], true], 1, 0],
      },
    });
  }
}

function startEditing() {
  if (state.imported && !state.importedEditingCopy) {
    state.points = clonePoints(state.points);
    state.importedEditingCopy = true;
    setStatus("Editable copy created.");
  } else {
    setStatus("Editing route.");
  }
  setMode("edit");
}

function setMode(mode) {
  state.mode = mode;
  if (map) {
    if (mode === "edit") map.dragPan.disable();
    else map.dragPan.enable();
  }
  render();
}

function pushUndo(previous = null) {
  state.undoStack.push(previous || clonePoints(state.points));
  if (state.undoStack.length > 100) state.undoStack.shift();
}

function addPoint(point) {
  pushUndo();
  state.points = [...state.points, point];
  setStatus("Point added.");
  render();
}

function insertPoint(index, point) {
  pushUndo();
  const points = clonePoints(state.points);
  points.splice(index, 0, point);
  state.points = points;
  setStatus("Point inserted.");
  render();
}

function deletePoint(index) {
  if (index < 0 || index >= state.points.length) return;
  pushUndo();
  const points = clonePoints(state.points);
  points.splice(index, 1);
  state.points = points;
  setStatus("Point deleted.");
  render();
}

function undoPointEdit() {
  const previous = state.undoStack.pop();
  if (!previous) return;
  state.points = previous;
  setStatus("Point edit undone.");
  render();
}

function render() {
  if (!map?.isStyleLoaded()) {
    renderSidebar();
    return;
  }
  ensureRouteLayers();
  updateMapRoute();
  renderSidebar();
}

function renderSidebar() {
  elements.modeBadge.textContent = state.mode === "edit" ? "Edit" : "View";
  elements.editButton.textContent = state.points.length > 0 ? "Edit route" : "Start route";
  elements.editButton.disabled = state.mode === "edit";
  elements.doneButton.disabled = state.mode !== "edit";
  elements.undoButton.disabled = state.undoStack.length === 0;
  elements.clearButton.disabled = state.points.length === 0;
  elements.exportButton.disabled = !canExport();
  elements.streetNamesToggle.checked = state.layerSettings.streetNames;
  elements.poisToggle.checked = state.layerSettings.pois;
  elements.buildingsToggle.checked = state.layerSettings.buildings;
  elements.minorPathsToggle.checked = state.layerSettings.minorPaths;
  elements.distanceValue.textContent = formatDistance(totalDistance(state.points));
  elements.pointCountValue.textContent = String(state.points.length);

  elements.pointsList.replaceChildren(
    ...state.points.map((point, index) => {
      const item = document.createElement("li");
      const pointText = document.createElement("span");
      const code = document.createElement("code");
      code.textContent = `${point[1].toFixed(6)}, ${point[0].toFixed(6)}`;
      pointText.append(code);
      item.append(pointText);
      if (state.mode === "edit") {
        const deleteButton = document.createElement("button");
        deleteButton.className = "point-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => deletePoint(index));
        item.append(deleteButton);
      }
      return item;
    }),
  );
}

function setStatus(message, error = false) {
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("error", error);
}

function updateMapRoute() {
  if (!map?.getSource("route")) return;
  map.getSource("route").setData(routeFeatureCollection());
}

function routeFeatureCollection() {
  const features = [];
  if (state.points.length >= 2) {
    features.push({
      type: "Feature",
      properties: { mode: state.mode },
      geometry: { type: "LineString", coordinates: state.points },
    });
  }
  state.points.forEach((point, index) => {
    features.push({
      type: "Feature",
      id: index,
      properties: {
        index,
        visible: state.mode === "edit",
      },
      geometry: { type: "Point", coordinates: point },
    });
  });
  return { type: "FeatureCollection", features };
}

function setHoveredPoint(id) {
  if (state.hoveredPointId != null && map.getSource("route")) {
    map.setFeatureState({ source: "route", id: state.hoveredPointId }, { hover: false });
  }
  state.hoveredPointId = id;
  if (id != null && map.getSource("route")) {
    map.setFeatureState({ source: "route", id }, { hover: true });
  }
}

function parseGpx(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML");
  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  const points = trkpts
    .map((element) => {
      const lat = Number.parseFloat(element.getAttribute("lat") || "");
      const lon = Number.parseFloat(element.getAttribute("lon") || "");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return [lon, lat];
    })
    .filter(Boolean);
  const name = doc.querySelector("metadata > name")?.textContent?.trim() ||
    doc.querySelector("trk > name")?.textContent?.trim() ||
    "";
  return { name, points };
}

function exportGpx(routeName, points) {
  const safeName = escapeXml(routeName || "Untitled route");
  const trkpts = points
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}" />`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailLite Web" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

function downloadGpx() {
  if (!canExport()) return;
  const gpx = exportGpx(state.routeName, state.points);
  state.lastExportedGpx = gpx;
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slugify(state.routeName)}.gpx`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  setStatus("GPX downloaded.");
}

function canExport() {
  return state.points.length >= 2 && state.routeName.trim().length > 0;
}

function fitRoute() {
  if (!map || state.points.length === 0) return;
  const bounds = state.points.reduce(
    (builder, point) => builder.extend(point),
    new maplibregl.LngLatBounds(state.points[0], state.points[0]),
  );
  map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 400 });
}

function nearestSegmentIndex(point, routePoints) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < routePoints.length - 1; index++) {
    const distance = pointToSegmentDistance(point, routePoints[index], routePoints[index + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function pointToSegmentDistance(point, start, end) {
  const [px, py] = point;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) return Math.hypot(px - sx, py - sy);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

function totalDistance(points) {
  let meters = 0;
  for (let index = 1; index < points.length; index++) {
    meters += distanceBetween(points[index - 1], points[index]);
  }
  return meters;
}

function distanceBetween(left, right) {
  const lat1 = toRadians(left[1]);
  const lat2 = toRadians(right[1]);
  const deltaLat = toRadians(right[1] - left[1]);
  const deltaLon = toRadians(right[0] - left[0]);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function slugify(value) {
  return (value || "route")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "route";
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clonePoints(points) {
  return points.map((point) => [...point]);
}

function normalizeSearchText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function exposeTestApi() {
  window.__trailLiteTest = {
    getState: () => ({
      mode: state.mode,
      routeName: state.routeName,
      points: clonePoints(state.points),
      distanceMeters: totalDistance(state.points),
      canExport: canExport(),
      imported: state.imported,
      importedEditingCopy: state.importedEditingCopy,
      status: elements.statusText.textContent,
      layerSettings: { ...state.layerSettings },
      mapCenter: map ? [map.getCenter().lng, map.getCenter().lat] : null,
      mapZoom: map ? map.getZoom() : null,
    }),
    setRoute: (points, name = "Test route") => {
      state.points = clonePoints(points);
      state.routeName = name;
      elements.routeName.value = name;
      render();
    },
    startEditing,
    addPoint: (lon, lat) => addPoint([lon, lat]),
    insertPoint: (index, lon, lat) => insertPoint(index, [lon, lat]),
    deletePoint,
    setLayerSetting: (settingKey, value) => {
      if (!(settingKey in state.layerSettings)) throw new Error(`Unknown layer setting: ${settingKey}`);
      state.layerSettings[settingKey] = Boolean(value);
      renderSidebar();
      applyLayerSettings();
    },
    getLayerVisibility: (layerId) => map?.getLayoutProperty(layerId, "visibility") || "visible",
    search: (query) => {
      elements.searchInput.value = query;
      locateSearchQuery();
    },
    findPlace,
    exportGpx: () => exportGpx(state.routeName, state.points),
    parseGpx,
    getLastExportedGpx: () => state.lastExportedGpx,
  };
}
