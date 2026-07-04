const FINLAND_CENTER = [24.94, 60.24];
const VIEW_ROUTE_COLOR = "#FF5733";
const EDIT_ROUTE_COLOR = "#1D73D4";
const EARTH_RADIUS_METERS = 6371000;
const SEARCH_ZOOM = 12;
const FREEHAND_MIN_DISTANCE_METERS = 25;
const MAX_VISIBLE_ROUTE_POINTS = 300;
const DEFAULT_MAP_URL = `${window.location.origin}/shared/maps/finland.pmtiles`;
const MAP_DATA_SERVICE_URL = "http://localhost:5174/api/extract-bbox";
const MAP_DATASETS_URL = "http://localhost:5174/api/datasets";
const BASE_MAP_SOURCE_ID = "osm";
const DETAIL_MAP_STORAGE_KEY = "traillite.detailMaps.v1";

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
  importButton: document.getElementById("importButton"),
  gpxInput: document.getElementById("gpxInput"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  streetNamesToggle: document.getElementById("streetNamesToggle"),
  poisToggle: document.getElementById("poisToggle"),
  buildingsToggle: document.getElementById("buildingsToggle"),
  minorPathsToggle: document.getElementById("minorPathsToggle"),
  selectAreaButton: document.getElementById("selectAreaButton"),
  downloadAreaButton: document.getElementById("downloadAreaButton"),
  areaBboxText: document.getElementById("areaBboxText"),
  baseDatasetSize: document.getElementById("baseDatasetSize"),
  detailDatasetSize: document.getElementById("detailDatasetSize"),
  totalDatasetSize: document.getElementById("totalDatasetSize"),
  detailDatasetCount: document.getElementById("detailDatasetCount"),
  routeName: document.getElementById("routeName"),
  distanceValue: document.getElementById("distanceValue"),
  pointCountValue: document.getElementById("pointCountValue"),
  statusText: document.getElementById("statusText"),
  pointsList: document.getElementById("pointsList"),
  shortcutSummary: document.getElementById("shortcutSummary"),
  shortcutRows: Array.from(document.querySelectorAll("[data-shortcut-context]")),
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
  drawingRoute: false,
  pendingRouteDraw: false,
  pendingDrawPoint: null,
  drawStartPoints: null,
  drawAddedPointCount: 0,
  hoveredPointId: null,
  skipNextMapClick: false,
  lastExportedGpx: "",
  mapSourceUrl: DEFAULT_MAP_URL,
  detailMaps: [],
  dataset: {
    baseBytes: null,
    baseLoading: true,
  },
  shiftKeyDown: false,
  routePointHover: false,
  areaSelection: {
    active: false,
    dragging: false,
    start: null,
    bounds: null,
    loading: false,
  },
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
  bindKeyboardShortcuts();
  restorePersistedDetailMaps();
  refreshStoredDetailMaps();
  refreshBaseDatasetSize();
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
    syncMapOverlays();
    setStatus("Map view ready.");
  });

  map.on("style.load", () => {
    syncMapOverlays();
  });

  map.on("mousedown", (event) => {
    if (!state.areaSelection.active || state.mode === "edit") return;
    event.preventDefault();
    state.areaSelection.dragging = true;
    state.areaSelection.start = [event.lngLat.lng, event.lngLat.lat];
    state.areaSelection.bounds = boundsFromPoints(state.areaSelection.start, state.areaSelection.start);
    map.dragPan.disable();
    updateMapCursor();
    updateAreaSelection();
    renderSidebar();
  });

  map.on("mousedown", (event) => {
    if (state.mode !== "edit" || state.areaSelection.active || state.shiftKeyDown) return;
    if (state.routePointHover || state.draggingPointIndex != null) return;
    event.preventDefault();
    state.pendingRouteDraw = true;
    state.pendingDrawPoint = [event.lngLat.lng, event.lngLat.lat];
  });

  map.on("mousemove", (event) => {
    if (state.areaSelection.dragging && state.areaSelection.start) {
      state.areaSelection.bounds = boundsFromPoints(state.areaSelection.start, [event.lngLat.lng, event.lngLat.lat]);
      updateAreaSelection();
      renderSidebar();
      return;
    }
    if (state.pendingRouteDraw && state.pendingDrawPoint) {
      const point = [event.lngLat.lng, event.lngLat.lat];
      if (distanceBetween(state.pendingDrawPoint, point) >= FREEHAND_MIN_DISTANCE_METERS) {
        beginRouteDraw(state.pendingDrawPoint);
        appendDrawPoint(point);
      }
      return;
    }
    if (state.drawingRoute) {
      appendDrawPoint([event.lngLat.lng, event.lngLat.lat]);
      return;
    }
    if (state.draggingPointIndex == null) return;
    const points = clonePoints(state.points);
    points[state.draggingPointIndex] = [event.lngLat.lng, event.lngLat.lat];
    state.points = points;
    updateMapRoute();
    renderSidebar();
  });

  map.on("mouseup", () => {
    if (state.areaSelection.dragging) {
      state.areaSelection.dragging = false;
      state.areaSelection.active = false;
      state.areaSelection.start = null;
      if (state.mode === "edit") map.dragPan.disable();
      else map.dragPan.enable();
      setStatus("Map area selected.");
      updateMapCursor();
      updateAreaSelection();
      renderSidebar();
      return;
    }
    if (state.pendingRouteDraw) {
      state.pendingRouteDraw = false;
      state.pendingDrawPoint = null;
      return;
    }
    if (state.drawingRoute) {
      finishRouteDraw();
      return;
    }
    if (state.draggingPointIndex == null) return;
    pushUndo(state.dragStartPoints);
    state.draggingPointIndex = null;
    state.dragStartPoints = null;
    updateMapCursor();
    render();
  });

  map.on("click", (event) => {
    if (state.areaSelection.active || state.areaSelection.dragging) return;
    if (state.skipNextMapClick) {
      state.skipNextMapClick = false;
      return;
    }
    if (state.drawAddedPointCount > 1) {
      state.drawAddedPointCount = 0;
      return;
    }
    state.drawAddedPointCount = 0;
    if (state.mode !== "edit") return;
    addPoint([event.lngLat.lng, event.lngLat.lat]);
  });

  map.on("click", "route-line-hit", (event) => {
    if (state.areaSelection.active || state.areaSelection.dragging) return;
    if (state.mode !== "edit" || state.points.length < 2 || !event.lngLat) return;
    state.skipNextMapClick = true;
    const point = [event.lngLat.lng, event.lngLat.lat];
    const index = nearestSegmentIndex(point, state.points);
    insertPoint(index + 1, point);
  });

  map.on("mouseenter", "route-points", (event) => {
    state.routePointHover = true;
    updateMapCursor();
    const feature = event.features?.[0];
    if (feature?.id !== undefined) setHoveredPoint(feature.id);
  });

  map.on("mouseleave", "route-points", () => {
    state.routePointHover = false;
    updateMapCursor();
    setHoveredPoint(null);
  });

  map.on("mousedown", "route-points", (event) => {
    if (state.areaSelection.active || state.mode !== "edit") return;
    const feature = event.features?.[0];
    if (!feature) return;
    event.preventDefault();
    state.draggingPointIndex = Number(feature.properties.index);
    state.dragStartPoints = clonePoints(state.points);
    updateMapCursor();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift" && state.mode === "edit") {
      state.shiftKeyDown = true;
      map.dragPan.enable();
      updateMapCursor();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift" && state.mode === "edit") {
      state.shiftKeyDown = false;
      map.dragPan.disable();
      updateMapCursor();
    }
  });
}

async function loadStyle() {
  const response = await fetch("../shared/styles/style_template.json");
  const style = await response.json();
  style.glyphs = `${window.location.origin}/shared/glyphs/{fontstack}/{range}.pbf`;
  style.sources[BASE_MAP_SOURCE_ID].url = `pmtiles://${DEFAULT_MAP_URL}`;
  return style;
}

function syncMapOverlays() {
  if (!map?.isStyleLoaded()) return;
  ensureDetailMapLayers();
  applyLayerSettings();
  ensureAreaLayers();
  ensureRouteLayers();
  updateAreaSelection();
  updateMapRoute();
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
    setStatus("Route reset.");
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
  elements.selectAreaButton.addEventListener("click", () => toggleAreaSelection());
  elements.downloadAreaButton.addEventListener("click", () => downloadAreaMap());
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

function bindKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift") return;
    if (isTypingTarget(event.target) && event.key !== "Escape") return;

    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "z") {
      if (state.mode === "edit" && state.undoStack.length > 0) {
        event.preventDefault();
        undoPointEdit();
      }
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (key === "escape") {
      if (state.areaSelection.active || state.areaSelection.dragging) {
        event.preventDefault();
        cancelAreaSelection();
      } else if (state.mode === "edit") {
        event.preventDefault();
        setMode("view");
      }
      return;
    }

    if (key === "e") {
      event.preventDefault();
      if (state.mode !== "edit") startEditing();
      return;
    }
    if (key === "a") {
      event.preventDefault();
      toggleAreaSelection();
      return;
    }
    if (key === "f") {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
      setStatus("Search focused.");
      return;
    }
    if (key === "d" && canExport()) {
      event.preventDefault();
      downloadGpx();
    }
  });
}

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
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
  Object.entries(LAYER_GROUPS).forEach(([settingKey]) => {
    layerIdsForSetting(settingKey).forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(
        layerId,
        "visibility",
        state.layerSettings[settingKey] ? "visible" : "none",
      );
    });
  });
}

function layerIdsForSetting(settingKey) {
  const baseLayerIds = LAYER_GROUPS[settingKey] || [];
  const detailLayerIds = state.detailMaps.flatMap((detailMap) =>
    baseLayerIds.map((layerId) => detailLayerId(detailMap.sourceId, layerId)),
  );
  return [...baseLayerIds, ...detailLayerIds];
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

function ensureAreaLayers() {
  if (!map.getSource("selected-area")) {
    map.addSource("selected-area", {
      type: "geojson",
      data: areaFeatureCollection(),
    });
  }
  if (!map.getLayer("selected-area-fill")) {
    map.addLayer({
      id: "selected-area-fill",
      type: "fill",
      source: "selected-area",
      paint: {
        "fill-color": EDIT_ROUTE_COLOR,
        "fill-opacity": 0.12,
      },
    });
  }
  if (!map.getLayer("selected-area-outline")) {
    map.addLayer({
      id: "selected-area-outline",
      type: "line",
      source: "selected-area",
      paint: {
        "line-color": EDIT_ROUTE_COLOR,
        "line-width": 2,
        "line-dasharray": [2, 1],
      },
    });
  }
}

function toggleAreaSelection() {
  if (state.areaSelection.loading) return;
  state.areaSelection.active = !state.areaSelection.active;
  state.areaSelection.dragging = false;
  state.areaSelection.start = null;
  if (state.areaSelection.active) {
    if (state.mode === "edit") setMode("view");
    map.dragPan.disable();
    setStatus("Drag a rectangle on the map.");
  } else {
    map.dragPan.enable();
    setStatus("Map area selection cancelled.");
  }
  updateMapCursor();
  renderSidebar();
}

function cancelAreaSelection() {
  state.areaSelection.active = false;
  state.areaSelection.dragging = false;
  state.areaSelection.start = null;
  if (state.mode === "edit") map.dragPan.disable();
  else map.dragPan.enable();
  updateMapCursor();
  setStatus("Map area selection cancelled.");
  renderSidebar();
}

async function downloadAreaMap() {
  if (!state.areaSelection.bounds || state.areaSelection.loading) return;
  state.areaSelection.loading = true;
  renderSidebar();
  setStatus("Downloading selected map area.");
  try {
    const response = await fetch(MAP_DATA_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bbox: bboxArray(state.areaSelection.bounds),
        name: state.routeName || "web-selected-area",
        maxzoom: 15,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Map data service failed");
    finishAreaDownload(payload.url, {
      cacheKey: payload.cacheKey,
      name: payload.name || "selected area",
      sizeBytes: payload.sizeBytes,
    });
    setStatus(payload.cached ? "Loaded cached area map." : "Loaded downloaded area map.");
  } catch (error) {
    setStatus(`Map data service unavailable: ${error.message}`, true);
  } finally {
    state.areaSelection.loading = false;
    renderSidebar();
  }
}

function finishAreaDownload(url, options = {}) {
  addDetailMap(url, options);
  state.areaSelection.active = false;
  state.areaSelection.dragging = false;
  state.areaSelection.start = null;
  state.areaSelection.bounds = null;
  if (state.mode === "edit") map.dragPan.disable();
  else map.dragPan.enable();
  updateMapCursor();
  updateAreaSelection();
  renderSidebar();
}

function addDetailMap(url, options = {}) {
  const existing = state.detailMaps.find((detailMap) => detailMap.url === url);
  if (existing) {
    if (options.sizeBytes != null) existing.sizeBytes = options.sizeBytes;
    if (options.name) existing.name = options.name;
    if (options.cacheKey) existing.cacheKey = options.cacheKey;
    existing.sizeLoading = existing.sizeBytes == null;
    state.mapSourceUrl = url;
    ensureDetailMapLayers();
    if (options.persist !== false) persistDetailMaps();
    if (existing.sizeLoading) loadDetailDatasetSize(existing);
    renderSidebar();
    return;
  }
  const sourceId = `detail-osm-${state.detailMaps.length + 1}`;
  const detailMap = {
    sourceId,
    url,
    name: options.name || url.split("/").pop() || "detail map",
    cacheKey: options.cacheKey || null,
    sizeBytes: Number.isFinite(options.sizeBytes) ? options.sizeBytes : null,
    sizeLoading: !Number.isFinite(options.sizeBytes),
  };
  state.detailMaps = [...state.detailMaps, detailMap];
  state.mapSourceUrl = url;
  ensureDetailMapLayers();
  applyLayerSettings();
  if (options.persist !== false) persistDetailMaps();
  if (detailMap.sizeLoading) loadDetailDatasetSize(detailMap);
  renderSidebar();
}

function restorePersistedDetailMaps() {
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(DETAIL_MAP_STORAGE_KEY) || "[]");
  } catch {
    stored = [];
  }
  if (!Array.isArray(stored)) return;
  stored.forEach((detailMap) => {
    if (!detailMap?.url) return;
    addDetailMap(detailMap.url, {
      name: detailMap.name,
      cacheKey: detailMap.cacheKey,
      sizeBytes: detailMap.sizeBytes,
      persist: false,
    });
  });
}

async function refreshStoredDetailMaps() {
  try {
    const response = await fetch(MAP_DATASETS_URL, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!Array.isArray(payload.datasets)) return;
    payload.datasets.forEach((dataset) => {
      if (!dataset.url) return;
      addDetailMap(dataset.url, {
        name: dataset.name,
        cacheKey: dataset.cacheKey,
        sizeBytes: dataset.sizeBytes,
      });
    });
  } catch {
    // The map data service is optional while drawing GPX; persisted browser entries still load.
  }
}

function persistDetailMaps() {
  const persisted = state.detailMaps
    .filter((detailMap) => detailMap.url !== DEFAULT_MAP_URL)
    .map((detailMap) => ({
      url: detailMap.url,
      name: detailMap.name,
      cacheKey: detailMap.cacheKey,
      sizeBytes: detailMap.sizeBytes,
    }));
  localStorage.setItem(DETAIL_MAP_STORAGE_KEY, JSON.stringify(persisted));
}

async function refreshBaseDatasetSize() {
  state.dataset.baseLoading = true;
  renderSidebar();
  try {
    state.dataset.baseBytes = await fetchDatasetSize(DEFAULT_MAP_URL);
  } catch {
    state.dataset.baseBytes = null;
  } finally {
    state.dataset.baseLoading = false;
    renderSidebar();
  }
}

async function loadDetailDatasetSize(detailMap) {
  try {
    detailMap.sizeBytes = await fetchDatasetSize(detailMap.url);
  } catch {
    detailMap.sizeBytes = null;
  } finally {
    detailMap.sizeLoading = false;
    persistDetailMaps();
    renderSidebar();
  }
}

async function fetchDatasetSize(url) {
  const response = await fetch(url, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
  if (!response.ok && response.status !== 206) throw new Error(`Size request failed: ${response.status}`);
  const contentRange = response.headers.get("Content-Range");
  const rangeMatch = contentRange?.match(/\/(\d+)$/);
  if (rangeMatch) return Number.parseInt(rangeMatch[1], 10);
  const contentLength = response.headers.get("Content-Length");
  if (contentLength) return Number.parseInt(contentLength, 10);
  throw new Error("Missing dataset size headers.");
}

function ensureDetailMapLayers() {
  if (!map?.isStyleLoaded()) return;
  state.detailMaps.forEach((detailMap) => {
    if (!map.getSource(detailMap.sourceId)) {
      map.addSource(detailMap.sourceId, {
        type: "vector",
        url: `pmtiles://${detailMap.url}`,
      });
    }
    baseMapLayers().forEach((layer) => {
      const layerId = detailLayerId(detailMap.sourceId, layer.id);
      if (map.getLayer(layerId)) return;
      const detailLayer = {
        ...structuredClone(layer),
        id: layerId,
        source: detailMap.sourceId,
      };
      map.addLayer(detailLayer, firstOverlayLayerId());
    });
  });
}

function baseMapLayers() {
  return map.getStyle().layers.filter((layer) => layer.source === BASE_MAP_SOURCE_ID);
}

function detailLayerId(sourceId, layerId) {
  return `${sourceId}-${layerId}`;
}

function firstOverlayLayerId() {
  return ["selected-area-fill", "route-line-casing", "route-line", "route-line-hit", "route-points"]
    .find((layerId) => map.getLayer(layerId));
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
        "line-width": ["case", ["==", ["get", "mode"], "edit"], 4.2, 7],
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
        "line-width": ["case", ["==", ["get", "mode"], "edit"], 2.6, 4],
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
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 6, 2.6],
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 0.9,
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
    setStatus("Drag on the map to draw; click for a single point.");
  }
  setMode("edit");
}

function setMode(mode) {
  if (state.drawingRoute) finishRouteDraw();
  state.pendingRouteDraw = false;
  state.pendingDrawPoint = null;
  state.mode = mode;
  if (mode === "edit") {
    state.areaSelection.active = false;
    state.areaSelection.dragging = false;
    state.areaSelection.start = null;
  }
  if (map) {
    if (mode === "edit") map.dragPan.disable();
    else map.dragPan.enable();
    updateMapCursor();
  }
  render();
}

function updateMapCursor() {
  if (!map) return;
  map.getCanvas().style.cursor = currentMapCursor();
}

function currentMapCursor() {
  if (state.drawingRoute) return "crosshair";
  if (state.draggingPointIndex != null) return "grabbing";
  if (state.routePointHover && state.mode === "edit") return "grab";
  if (state.areaSelection.active || state.areaSelection.dragging) return "crosshair";
  if (state.mode === "edit" && state.shiftKeyDown) return "grab";
  if (state.mode === "edit") return "crosshair";
  return "grab";
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

function beginRouteDraw(point) {
  state.drawingRoute = true;
  state.drawStartPoints = clonePoints(state.points);
  state.drawAddedPointCount = 0;
  map.dragPan.disable();
  appendDrawPoint(point, true);
  updateMapCursor();
}

function appendDrawPoint(point, force = false) {
  const previous = state.points[state.points.length - 1];
  if (!force && previous && distanceBetween(previous, point) < FREEHAND_MIN_DISTANCE_METERS) return;
  state.points = [...state.points, point];
  state.drawAddedPointCount += 1;
  updateMapRoute();
  renderSidebar();
}

function finishRouteDraw() {
  if (!state.drawingRoute) return;
  state.drawingRoute = false;
  if (state.drawAddedPointCount > 0) {
    pushUndo(state.drawStartPoints || []);
    setStatus(state.drawAddedPointCount === 1 ? "Point added." : "Route segment drawn.");
  }
  state.drawStartPoints = null;
  if (state.mode === "edit" && !state.shiftKeyDown) map.dragPan.disable();
  else map.dragPan.enable();
  updateMapCursor();
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
  const editing = state.mode === "edit";
  const hasRoute = state.points.length > 0;
  const exportable = canExport();
  elements.modeBadge.textContent = state.mode === "edit" ? "Edit" : "View";
  elements.newRouteButton.textContent = "Reset route";
  elements.editButton.textContent = hasRoute ? "Edit route" : "Draw route";
  elements.editButton.disabled = editing;
  elements.doneButton.disabled = !editing;
  elements.undoButton.disabled = state.undoStack.length === 0;
  elements.clearButton.disabled = !hasRoute;
  elements.exportButton.disabled = !exportable;
  elements.newRouteButton.hidden = editing || !hasRoute;
  elements.editButton.hidden = editing;
  elements.importButton.hidden = editing;
  elements.doneButton.hidden = !editing;
  elements.undoButton.hidden = !editing;
  elements.clearButton.hidden = !hasRoute;
  elements.exportButton.hidden = !exportable;
  elements.streetNamesToggle.checked = state.layerSettings.streetNames;
  elements.poisToggle.checked = state.layerSettings.pois;
  elements.buildingsToggle.checked = state.layerSettings.buildings;
  elements.minorPathsToggle.checked = state.layerSettings.minorPaths;
  elements.selectAreaButton.textContent = state.areaSelection.active ? "Cancel area" : "Draw map area";
  elements.selectAreaButton.disabled = state.areaSelection.loading;
  elements.downloadAreaButton.disabled = !state.areaSelection.bounds || state.areaSelection.loading;
  elements.downloadAreaButton.textContent = state.areaSelection.loading ? "Downloading..." : "Download area map";
  elements.areaBboxText.textContent = state.areaSelection.bounds
    ? `BBox ${formatBboxText(state.areaSelection.bounds)}`
    : "No area selected.";
  renderDatasetStats();
  renderShortcutContext();
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

function renderDatasetStats() {
  const detailBytes = state.detailMaps.reduce((sum, detailMap) => (
    Number.isFinite(detailMap.sizeBytes) ? sum + detailMap.sizeBytes : sum
  ), 0);
  const anyDetailLoading = state.detailMaps.some((detailMap) => detailMap.sizeLoading);
  const totalBytes = Number.isFinite(state.dataset.baseBytes) ? state.dataset.baseBytes + detailBytes : null;

  elements.baseDatasetSize.textContent = state.dataset.baseLoading
    ? "Loading"
    : formatBytes(state.dataset.baseBytes);
  elements.detailDatasetSize.textContent = anyDetailLoading
    ? `${formatBytes(detailBytes)} + loading`
    : formatBytes(detailBytes);
  elements.totalDatasetSize.textContent = state.dataset.baseLoading || anyDetailLoading
    ? "Loading"
    : formatBytes(totalBytes);
  elements.detailDatasetCount.textContent = String(state.detailMaps.length);
}

function renderShortcutContext() {
  const context = currentShortcutContext();
  elements.shortcutSummary.textContent = `${context === "view" ? "Route" : capitalize(context)} shortcuts`;
  elements.shortcutRows.forEach((row) => {
    const contexts = row.dataset.shortcutContext.split(/\s+/);
    row.hidden = !contexts.includes(context) && !(canExport() && contexts.includes("route"));
  });
}

function currentShortcutContext() {
  if (state.areaSelection.active || state.areaSelection.dragging) return "area";
  if (state.mode === "edit") return "edit";
  return "view";
}

function setStatus(message, error = false) {
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("error", error);
}

function updateMapRoute() {
  if (!map?.getSource("route")) return;
  map.getSource("route").setData(routeFeatureCollection());
}

function updateAreaSelection() {
  if (!map?.getSource("selected-area")) return;
  map.getSource("selected-area").setData(areaFeatureCollection());
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
  visibleRoutePointIndexes(state.points.length).forEach((index) => {
    const point = state.points[index];
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

function areaFeatureCollection() {
  if (!state.areaSelection.bounds) return { type: "FeatureCollection", features: [] };
  const bounds = state.areaSelection.bounds;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [bounds.minLon, bounds.minLat],
          [bounds.maxLon, bounds.minLat],
          [bounds.maxLon, bounds.maxLat],
          [bounds.minLon, bounds.maxLat],
          [bounds.minLon, bounds.minLat],
        ]],
      },
    }],
  };
}

function boundsFromPoints(start, end) {
  return {
    minLon: Math.min(start[0], end[0]),
    minLat: Math.min(start[1], end[1]),
    maxLon: Math.max(start[0], end[0]),
    maxLat: Math.max(start[1], end[1]),
  };
}

function bboxArray(bounds) {
  return [
    Number(bounds.minLon.toFixed(6)),
    Number(bounds.minLat.toFixed(6)),
    Number(bounds.maxLon.toFixed(6)),
    Number(bounds.maxLat.toFixed(6)),
  ];
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
  setStatus("Route saved as GPX.");
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatBboxText(bounds) {
  return bboxArray(bounds).map((value) => value.toFixed(6)).join(", ");
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

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
      drawingRoute: state.drawingRoute,
      layerSettings: { ...state.layerSettings },
      dataset: {
        baseBytes: state.dataset.baseBytes,
        baseLoading: state.dataset.baseLoading,
        detailBytes: state.detailMaps.reduce((sum, detailMap) => (
          Number.isFinite(detailMap.sizeBytes) ? sum + detailMap.sizeBytes : sum
        ), 0),
        detailCount: state.detailMaps.length,
        detailLoading: state.detailMaps.some((detailMap) => detailMap.sizeLoading),
      },
      cursor: currentMapCursor(),
      areaSelection: {
        active: state.areaSelection.active,
        dragging: state.areaSelection.dragging,
        bounds: state.areaSelection.bounds ? { ...state.areaSelection.bounds } : null,
        loading: state.areaSelection.loading,
      },
      mapSourceUrl: state.mapSourceUrl,
      detailMaps: state.detailMaps.map((detailMap) => ({ ...detailMap })),
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
    beginRouteDraw: (lon, lat) => beginRouteDraw([lon, lat]),
    appendDrawPoint: (lon, lat) => appendDrawPoint([lon, lat]),
    finishRouteDraw,
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
    setAreaBounds: (bounds) => {
      state.areaSelection.bounds = {
        minLon: Number(bounds.minLon),
        minLat: Number(bounds.minLat),
        maxLon: Number(bounds.maxLon),
        maxLat: Number(bounds.maxLat),
      };
      updateAreaSelection();
      renderSidebar();
    },
    getAreaBboxText: () => elements.areaBboxText.textContent,
    addDetailMap,
    finishAreaDownload,
    formatBytes,
    findPlace,
    exportGpx: () => exportGpx(state.routeName, state.points),
    parseGpx,
    getLastExportedGpx: () => state.lastExportedGpx,
  };
}
