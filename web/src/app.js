import {
  FALLBACK_FULL_BASE_MAP_URL,
  LAYER_GROUPS,
  LOCAL_BASE_MAP_URL,
  RENDERED_DETAIL_KINDS,
  SHARED_DETAIL_MAPS,
  SNAP_LINE_LAYER_IDS,
  classifyDetailMapKind,
  detailOverlayBaseLayers,
  detailLayerForMap,
  detailLayerId,
  loadStyle,
} from "./features/map-style.js";
import {
  mergePreservedMobileRoutes,
  mobileRouteComparator,
  mobileRouteDisplayTitle,
  mobileRouteLabel,
  mobileRouteMeta,
  mobileRouteStatusText,
  nextMobileRouteSelection,
  routeMatchesMobileFilter,
  routesPreservedForRefresh,
} from "./features/mobile-routes.js";
import { findPlace } from "./features/places.js";
import {
  ensureRouteLayers,
  firstOverlayLayerId,
  routeFeatureCollection,
} from "./features/route-layers.js";
import { capitalize, formatBytes, formatDistance, slugify } from "./lib/format.js";
import {
  bboxAreaIsUsable,
  bboxFromPoints,
  clonePoints,
  distanceBetween,
  isScreenPointInsideCanvas,
  nearestScreenPointOnSegment,
  nearestSegmentIndex,
  pointToSegmentDistanceMeters,
  totalDistance,
} from "./lib/geo.js";
import { exportGpx, parseGpx } from "./lib/gpx.js";

const FINLAND_CENTER = [24.94, 60.24];
const SEARCH_ZOOM = 12;
const FREEHAND_MIN_DISTANCE_METERS = 25;
const SIMPLIFY_TOLERANCE_METERS = 15;
const SNAP_TOLERANCE_PIXELS = 16;
const MAP_DATASETS_URL = "http://localhost:5174/api/datasets";
const BASE_MAP_SOURCE_URL = "http://localhost:5174/api/base-map-source";
const EXTRACT_BBOX_URL = "http://localhost:5174/api/extract-bbox";
const MOBILE_SAVE_URL = "http://localhost:5174/api/save-mobile-route";
const MOBILE_ROUTES_URL = "http://localhost:5174/api/mobile-routes";
const HISTORY_LIMIT = 10;
const DISCARD_UNSAVED_ROUTE_MESSAGE = "Discard unsaved route changes?";
const DETAIL_MAP_STORAGE_KEY = "traillite.detailMaps.v1";

const elements = {
  map: document.getElementById("map"),
  modeBadge: document.getElementById("modeBadge"),
  newRouteButton: document.getElementById("newRouteButton"),
  editButton: document.getElementById("editButton"),
  fitRouteButton: document.getElementById("fitRouteButton"),
  doneButton: document.getElementById("doneButton"),
  drawRouteButton: document.getElementById("drawRouteButton"),
  undoButton: document.getElementById("undoButton"),
  redoButton: document.getElementById("redoButton"),
  simplifyButton: document.getElementById("simplifyButton"),
  clearButton: document.getElementById("clearButton"),
  exportButton: document.getElementById("exportButton"),
  mobileSaveButton: document.getElementById("mobileSaveButton"),
  importButton: document.getElementById("importButton"),
  gpxInput: document.getElementById("gpxInput"),
  mobileRouteSearch: document.getElementById("mobileRouteSearch"),
  mobileRouteList: document.getElementById("mobileRouteList"),
  mobileRouteSelect: document.getElementById("mobileRouteSelect"),
  mobileRouteSortButtons: Array.from(document.querySelectorAll("[data-route-sort]")),
  refreshMobileRoutesButton: document.getElementById("refreshMobileRoutesButton"),
  loadMobileRouteButton: document.getElementById("loadMobileRouteButton"),
  deleteMobileRouteButton: document.getElementById("deleteMobileRouteButton"),
  mobileRouteStatus: document.getElementById("mobileRouteStatus"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  drawAreaButton: document.getElementById("drawAreaButton"),
  downloadAreaButton: document.getElementById("downloadAreaButton"),
  areaStatusText: document.getElementById("areaStatusText"),
  streetNamesToggle: document.getElementById("streetNamesToggle"),
  poisToggle: document.getElementById("poisToggle"),
  buildingsToggle: document.getElementById("buildingsToggle"),
  minorPathsToggle: document.getElementById("minorPathsToggle"),
  baseDatasetSize: document.getElementById("baseDatasetSize"),
  detailDatasetSize: document.getElementById("detailDatasetSize"),
  totalDatasetSize: document.getElementById("totalDatasetSize"),
  detailDatasetCount: document.getElementById("detailDatasetCount"),
  routeName: document.getElementById("routeName"),
  snapToLinesOption: document.getElementById("snapToLinesOption"),
  snapToLinesToggle: document.getElementById("snapToLinesToggle"),
  distanceValue: document.getElementById("distanceValue"),
  pointCountValue: document.getElementById("pointCountValue"),
  routeSaveState: document.getElementById("routeSaveState"),
  statusText: document.getElementById("statusText"),
  pointsList: document.getElementById("pointsList"),
  shortcutSummary: document.getElementById("shortcutSummary"),
  shortcutRows: Array.from(document.querySelectorAll("[data-shortcut-context]")),
  mobileRoutesSection: document.querySelector(".mobile-routes-section"),
  routeSection: document.querySelector(".route-section"),
  mapToolsSection: document.querySelector(".map-tools-section"),
  pointsSection: document.querySelector(".points-section"),
};

const state = {
  mode: "view",
  routeName: "Untitled route",
  points: [],
  breakSpots: [],
  mobileRouteId: null,
  mobileSavedSignature: null,
  undoStack: [],
  redoStack: [],
  imported: false,
  importedEditingCopy: false,
  draggingPointIndex: null,
  dragStartPoints: null,
  drawingRoute: false,
  pendingRouteDraw: false,
  pendingDrawPoint: null,
  selectedPointIndex: null,
  areaSelectMode: false,
  drawingArea: false,
  areaStartPoint: null,
  selectedAreaBbox: null,
  areaDownloadBusy: false,
  mobileSaveBusy: false,
  mobileRouteDeleteBusy: false,
  drawStartPoints: null,
  drawAddedPointCount: 0,
  hoveredPointId: null,
  skipNextMapClick: false,
  suppressMapClickUntil: 0,
  lastExportedGpx: "",
  mapSourceUrl: FALLBACK_FULL_BASE_MAP_URL,
  detailMaps: [],
  mobileRoutes: [],
  mobileRouteGpxById: {},
  mobileRouteFilter: "",
  mobileRouteSortMode: "nearby",
  mobileRoutesLoading: true,
  mobileRoutesError: "",
  dataset: {
    baseBytes: null,
    baseLoading: true,
  },
  shiftKeyDown: false,
  spaceKeyDown: false,
  routePointHover: false,
  layerSettings: {
    streetNames: true,
    pois: true,
    buildings: false,
    minorPaths: true,
  },
  snapToLines: true,
};

let map;

init();

async function init() {
  await initMap();
  bindUi();
  bindKeyboardShortcuts();
  exposeTestApi();
  loadSharedDetailMaps();
  restorePersistedDetailMaps();
  refreshStoredDetailMaps();
  refreshBaseDatasetSize();
  refreshMobileRoutes();
  render();
}

async function initMap() {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  state.mapSourceUrl = await resolveBaseMapUrl();
  const style = await loadStyle(state.mapSourceUrl);
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
    queueLayerSettingsApply();
    setStatus("Map view ready.");
  });

  map.on("style.load", () => {
    syncMapOverlays();
    queueLayerSettingsApply();
  });

  map.on("idle", () => {
    applyLayerSettings();
  });

  map.on("moveend", () => {
    if (state.mobileRouteSortMode === "nearby" && state.mode !== "edit") {
      renderMobileRoutes();
    }
  });

  map.on("mousedown", (event) => {
    if (state.areaSelectMode) {
      if (isMapPanOverrideActive()) return;
      event.preventDefault();
      state.drawingArea = true;
      state.areaStartPoint = [event.lngLat.lng, event.lngLat.lat];
      state.selectedAreaBbox = null;
      syncMapDragPan();
      ensureAreaLayers();
      updateAreaOverlay();
      updateMapCursor();
      return;
    }
    if (state.mode !== "edit" || isMapPanOverrideActive()) return;
    if (shouldSuppressMapClick()) return;
    if (eventHitsRoutePoint(event)) return;
    if (state.routePointHover || state.draggingPointIndex != null) return;
    event.preventDefault();
    state.pendingRouteDraw = true;
    state.pendingDrawPoint = [event.lngLat.lng, event.lngLat.lat];
  });

  map.on("mousemove", (event) => {
    if (state.drawingArea && state.areaStartPoint) {
      state.selectedAreaBbox = bboxFromPoints(state.areaStartPoint, [event.lngLat.lng, event.lngLat.lat]);
      ensureAreaLayers();
      updateAreaOverlay();
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
    movePoint(state.draggingPointIndex, [event.lngLat.lng, event.lngLat.lat]);
  });

  map.on("mouseup", () => finishPointerEdit());

  map.on("click", "route-line-hit", (event) => {
    if (shouldSuppressMapClick()) return;
    if (state.mode !== "edit" || isMapPanOverrideActive() || state.points.length < 2 || !event.lngLat) return;
    state.skipNextMapClick = true;
    const point = snapToVisibleLines([event.lngLat.lng, event.lngLat.lat]);
    const index = nearestSegmentIndex(point, state.points);
    insertPoint(index + 1, point);
  });

  map.on("click", (event) => {
    if (shouldSuppressMapClick()) return;
    if (state.skipNextMapClick) {
      state.skipNextMapClick = false;
      return;
    }
    if (state.drawAddedPointCount > 1) {
      state.drawAddedPointCount = 0;
      return;
    }
    state.drawAddedPointCount = 0;
    if (isMapPanOverrideActive()) return;
    if (state.mode !== "edit") return;
    addPoint([event.lngLat.lng, event.lngLat.lat]);
  });

  map.on("mouseenter", "route-point-hit", (event) => {
    state.routePointHover = true;
    updateMapCursor();
    const feature = event.features?.[0];
    if (feature?.id !== undefined) setHoveredPoint(feature.id);
  });

  map.on("mouseleave", "route-point-hit", () => {
    state.routePointHover = false;
    updateMapCursor();
    setHoveredPoint(null);
  });

  map.on("mousedown", "route-point-hit", (event) => {
    if (state.mode !== "edit") return;
    if (isMapPanOverrideActive()) return;
    const feature = event.features?.[0];
    if (!feature) return;
    event.preventDefault();
    state.draggingPointIndex = Number(feature.properties.index);
    selectPoint(state.draggingPointIndex);
    state.dragStartPoints = clonePoints(state.points);
    updateMapCursor();
  });

  window.addEventListener("keydown", (event) => {
    if (isSpaceKey(event) && !isTypingTarget(event.target)) {
      event.preventDefault();
      state.spaceKeyDown = true;
      state.pendingRouteDraw = false;
      state.pendingDrawPoint = null;
      syncMapDragPan();
      renderSidebar();
      return;
    }
    if (event.key === "Shift" && state.mode === "edit") {
      state.shiftKeyDown = true;
      syncMapDragPan();
      renderSidebar();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (isSpaceKey(event)) {
      event.preventDefault();
      if (state.spaceKeyDown) suppressMapClicks();
      state.spaceKeyDown = false;
      syncMapDragPan();
      renderSidebar();
      return;
    }
    if (event.key === "Shift" && state.mode === "edit") {
      state.shiftKeyDown = false;
      syncMapDragPan();
      renderSidebar();
    }
  });
  window.addEventListener("mouseup", () => finishPointerEdit());
  window.addEventListener("blur", () => {
    state.shiftKeyDown = false;
    state.spaceKeyDown = false;
    finishPointerEdit();
    syncMapDragPan();
    renderSidebar();
  });
}

async function resolveBaseMapUrl() {
  try {
    const response = await fetch(BASE_MAP_SOURCE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Base map source failed: ${response.status}`);
    const payload = await response.json();
    if (typeof payload.url === "string" && payload.url.startsWith("https://")) return payload.url;
  } catch {
    // The data service is optional for basic GPX editing; keep a known remote fallback.
  }
  return FALLBACK_FULL_BASE_MAP_URL;
}

function syncMapOverlays() {
  if (!map?.isStyleLoaded()) return;
  ensureDetailMapLayers();
  applyLayerSettings();
  ensureRouteLayers(map, routeFeatureCollection(state));
  ensureAreaLayers();
  updateMapRoute();
  updateAreaOverlay();
}

function bindUi() {
  elements.newRouteButton.addEventListener("click", () => {
    if (!confirmDiscardUnsavedRoute()) return;
    state.routeName = "Untitled route";
    state.points = [];
    state.breakSpots = [];
    state.selectedPointIndex = null;
    state.mobileRouteId = null;
    state.mobileSavedSignature = null;
    clearRouteHistory();
    state.imported = false;
    state.importedEditingCopy = false;
    state.mode = "view";
    elements.routeName.value = state.routeName;
    setStatus("Route reset.");
    render();
  });

  elements.editButton.addEventListener("click", () => startEditing());
  elements.fitRouteButton.addEventListener("click", () => fitRoute());
  elements.doneButton.addEventListener("click", () => setMode("view"));
  elements.drawRouteButton.addEventListener("click", () => activateRouteDrawing());
  elements.undoButton.addEventListener("click", () => undoPointEdit());
  elements.redoButton.addEventListener("click", () => redoPointEdit());
  elements.simplifyButton.addEventListener("click", () => simplifyRoute());
  elements.clearButton.addEventListener("click", () => {
    if (!confirmDiscardUnsavedRoute()) return;
    state.points = [];
    state.breakSpots = [];
    state.selectedPointIndex = null;
    state.mobileRouteId = null;
    state.mobileSavedSignature = null;
    clearRouteHistory();
    state.imported = false;
    state.importedEditingCopy = false;
    setStatus("Route cleared.");
    render();
  });
  elements.exportButton.addEventListener("click", () => downloadGpx());
  elements.mobileSaveButton.addEventListener("click", () => saveRouteToMobileApp());
  elements.refreshMobileRoutesButton.addEventListener("click", () => refreshManagedMobileRoutes());
  elements.loadMobileRouteButton.addEventListener("click", () => loadSelectedMobileRoute());
  elements.deleteMobileRouteButton.addEventListener("click", () => deleteSelectedMobileRoute());
  elements.mobileRouteSearch.addEventListener("input", () => {
    state.mobileRouteFilter = elements.mobileRouteSearch.value;
    renderMobileRoutes();
  });
  elements.mobileRouteSearch.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selectAdjacentMobileRoute(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      if (!elements.mobileRouteSelect.value || elements.loadMobileRouteButton.disabled) return;
      event.preventDefault();
      loadSelectedMobileRoute();
    }
  });
  elements.mobileRouteSelect.addEventListener("change", () => renderMobileRoutes());
  elements.mobileRouteSortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileRouteSortMode = button.dataset.routeSort;
      renderMobileRoutes();
    });
  });
  elements.drawAreaButton.addEventListener("click", () => toggleAreaSelectMode());
  elements.downloadAreaButton.addEventListener("click", () => downloadSelectedAreaMap());
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    locateSearchQuery();
  });
  bindLayerToggle(elements.streetNamesToggle, "streetNames");
  bindLayerToggle(elements.poisToggle, "pois");
  bindLayerToggle(elements.buildingsToggle, "buildings");
  bindLayerToggle(elements.minorPathsToggle, "minorPaths");
  elements.snapToLinesToggle.addEventListener("change", () => {
    state.snapToLines = elements.snapToLinesToggle.checked;
    setStatus(state.snapToLines ? "Route snapping enabled." : "Route snapping disabled.");
    renderSidebar();
  });
  elements.routeName.addEventListener("input", () => {
    state.routeName = elements.routeName.value.trim() || "Untitled route";
    renderSidebar();
  });
  elements.gpxInput.addEventListener("change", async () => {
    const file = elements.gpxInput.files?.[0];
    if (!file) return;
    if (!confirmDiscardUnsavedRoute()) {
      elements.gpxInput.value = "";
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseGpx(text);
      if (parsed.points.length < 2) throw new Error("No usable GPX track");
      state.routeName = parsed.name || file.name.replace(/\.gpx$/i, "") || "Imported route";
      state.points = parsed.points;
      state.breakSpots = parsed.breakSpots || [];
      state.selectedPointIndex = null;
      state.mobileRouteId = null;
      state.mobileSavedSignature = null;
      clearRouteHistory();
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
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedRouteChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function bindKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift") return;
    if (isTypingTarget(event.target) && event.key !== "Escape") return;

    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && (key === "y" || (key === "z" && event.shiftKey))) {
      if (state.mode === "edit" && state.redoStack.length > 0) {
        event.preventDefault();
        redoPointEdit();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === "z") {
      if (state.mode === "edit" && state.undoStack.length > 0) {
        event.preventDefault();
        undoPointEdit();
      }
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if ((key === "delete" || key === "backspace") && state.mode === "edit" && state.selectedPointIndex != null) {
      event.preventDefault();
      deleteSelectedPoint();
      return;
    }

    if (key === "escape") {
      if (state.mode === "edit") {
        event.preventDefault();
        setMode("view");
      }
      return;
    }

    if (key === "e") {
      event.preventDefault();
      toggleEditing();
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
  if (!map) return;
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

function queueLayerSettingsApply() {
  [0, 100, 500, 1200, 2500, 5000].forEach((delay) => {
    window.setTimeout(() => {
      ensureDetailMapLayers();
      applyLayerSettings();
    }, delay);
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

function addDetailMap(url, options = {}) {
  const existing = state.detailMaps.find((detailMap) => detailMap.url === url);
  if (existing) {
    if (options.sizeBytes != null) existing.sizeBytes = options.sizeBytes;
    if (options.name) existing.name = options.name;
    if (options.cacheKey) existing.cacheKey = options.cacheKey;
    if (options.kind) existing.kind = options.kind;
    existing.sizeLoading = existing.sizeBytes == null;
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
    kind: options.kind || classifyDetailMapKind(url, options.name),
    cacheKey: options.cacheKey || null,
    sizeBytes: Number.isFinite(options.sizeBytes) ? options.sizeBytes : null,
    sizeLoading: !Number.isFinite(options.sizeBytes),
  };
  state.detailMaps = [...state.detailMaps, detailMap];
  ensureDetailMapLayers();
  applyLayerSettings();
  queueLayerSettingsApply();
  if (options.persist !== false) persistDetailMaps();
  if (detailMap.sizeLoading) loadDetailDatasetSize(detailMap);
  renderSidebar();
}

function loadSharedDetailMaps() {
  SHARED_DETAIL_MAPS.forEach((detailMap) => {
    addDetailMap(detailMap.url, {
      name: detailMap.name,
      kind: detailMap.kind,
      persist: false,
    });
  });
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
      kind: detailMap.kind || classifyDetailMapKind(detailMap.url, detailMap.name),
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
        kind: classifyDetailMapKind(dataset.url, dataset.name),
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
    .filter((detailMap) => !SHARED_DETAIL_MAPS.some((sharedMap) => sharedMap.url === detailMap.url))
    .map((detailMap) => ({
      url: detailMap.url,
      name: detailMap.name,
      kind: detailMap.kind,
      cacheKey: detailMap.cacheKey,
      sizeBytes: detailMap.sizeBytes,
    }));
  localStorage.setItem(DETAIL_MAP_STORAGE_KEY, JSON.stringify(persisted));
}

async function refreshBaseDatasetSize() {
  state.dataset.baseLoading = true;
  renderSidebar();
  try {
    state.dataset.baseBytes = await fetchDatasetSize(LOCAL_BASE_MAP_URL);
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
    if (!RENDERED_DETAIL_KINDS.has(detailMap.kind)) return;
    if (!map.getSource(detailMap.sourceId)) {
      map.addSource(detailMap.sourceId, {
        type: "vector",
        url: `pmtiles://${detailMap.url}`,
      });
    }
    detailOverlayBaseLayers(map).forEach((layer) => {
      const layerId = detailLayerId(detailMap.sourceId, layer.id);
      if (map.getLayer(layerId)) return;
      const detailLayer = detailLayerForMap(detailMap, layer, layerId);
      map.addLayer(detailLayer, firstOverlayLayerId(map));
    });
  });
}

function ensureAreaLayers() {
  if (!map?.isStyleLoaded()) return;
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
        "fill-color": "#1D73D4",
        "fill-opacity": 0.18,
      },
    }, firstOverlayLayerId(map));
  }
  if (!map.getLayer("selected-area-outline")) {
    map.addLayer({
      id: "selected-area-outline",
      type: "line",
      source: "selected-area",
      paint: {
        "line-color": "#0B57C2",
        "line-width": 3,
        "line-dasharray": [2.2, 1.1],
      },
    }, firstOverlayLayerId(map));
  }
}

function startEditing() {
  if (state.areaSelectMode || state.drawingArea) {
    state.areaSelectMode = false;
    state.drawingArea = false;
    state.areaStartPoint = null;
    syncMapDragPan();
  }
  if (state.imported && !state.importedEditingCopy) {
    state.points = clonePoints(state.points);
    state.importedEditingCopy = true;
    setStatus("Editable copy created.");
  } else {
    setStatus("Drag on the map to draw; click for a single point.");
  }
  setMode("edit");
}

function activateRouteDrawing() {
  if (state.mode !== "edit") {
    startEditing();
    return;
  }
  state.shiftKeyDown = false;
  state.spaceKeyDown = false;
  state.pendingRouteDraw = false;
  state.pendingDrawPoint = null;
  state.routePointHover = false;
  syncMapDragPan();
  setStatus("Draw line active. Drag on the map to draw; click for a single point.");
  renderSidebar();
}

function toggleEditing() {
  if (state.mode === "edit") setMode("view");
  else startEditing();
}

function setMode(mode) {
  if (state.drawingRoute) finishRouteDraw();
  state.pendingRouteDraw = false;
  state.pendingDrawPoint = null;
  state.mode = mode;
  syncMapDragPan();
  render();
}

function updateMapCursor() {
  if (!map) return;
  map.getCanvas().style.cursor = currentMapCursor();
}

function currentMapCursor() {
  if (isMapPanOverrideActive()) return "grab";
  if (state.areaSelectMode || state.drawingArea) return "crosshair";
  if (state.drawingRoute) return "crosshair";
  if (state.draggingPointIndex != null) return "grabbing";
  if (state.routePointHover && state.mode === "edit") return "grab";
  if (state.mode === "edit") return "crosshair";
  return "grab";
}

function syncMapDragPan() {
  if (!map) return;
  const mapPanEnabled = isMapPanOverrideActive()
    || (state.mode !== "edit" && !state.areaSelectMode && !state.drawingArea);
  if (mapPanEnabled) map.dragPan.enable();
  else map.dragPan.disable();
  updateMapCursor();
}

function isMapPanOverrideActive() {
  return state.spaceKeyDown || (state.mode === "edit" && state.shiftKeyDown);
}

function isSpaceKey(event) {
  return event.code === "Space" || event.key === " ";
}

function hasActivePointerEdit() {
  return state.pendingRouteDraw || state.drawingRoute || state.drawingArea || state.draggingPointIndex != null;
}

function eventHitsRoutePoint(event) {
  if (!map?.getLayer("route-point-hit") || !event.point) return false;
  return map.queryRenderedFeatures(event.point, { layers: ["route-point-hit"] }).length > 0;
}

function finishPointerEdit() {
  if (state.drawingArea) {
    finishAreaDraw();
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
  if (!sameRoutePoints(state.dragStartPoints || [], state.points)) {
    pushUndo(state.dragStartPoints);
  }
  suppressMapClicks();
  state.draggingPointIndex = null;
  state.dragStartPoints = null;
  updateMapCursor();
  render();
}

function clearRouteHistory() {
  state.undoStack = [];
  state.redoStack = [];
}

function pushHistory(stack, points) {
  stack.push(clonePoints(points));
  if (stack.length > HISTORY_LIMIT) stack.shift();
}

function pushUndo(previous = null) {
  pushHistory(state.undoStack, previous || state.points);
  state.redoStack = [];
}

function suppressMapClicks(durationMs = 350) {
  state.suppressMapClickUntil = performance.now() + durationMs;
}

function shouldSuppressMapClick() {
  return performance.now() < state.suppressMapClickUntil;
}

function addPoint(point) {
  const previous = state.points[state.points.length - 1];
  if (previous && sameRoutePoint(previous, point)) {
    setStatus("Point unchanged.");
    renderSidebar();
    return;
  }
  const snappedPoint = snapToVisibleLines(point);
  if (previous && sameRoutePoint(previous, snappedPoint)) {
    setStatus("Point unchanged.");
    renderSidebar();
    return;
  }
  pushUndo();
  state.points = [...state.points, snappedPoint];
  state.selectedPointIndex = state.points.length - 1;
  setStatus("Point added.");
  render();
}

function sameRoutePoint(left, right) {
  return left[0].toFixed(6) === right[0].toFixed(6)
    && left[1].toFixed(6) === right[1].toFixed(6);
}

function sameRoutePoints(leftPoints, rightPoints) {
  return leftPoints.length === rightPoints.length
    && leftPoints.every((point, index) => sameRoutePoint(point, rightPoints[index]));
}

function selectPoint(index) {
  state.selectedPointIndex = Number.isInteger(index) && index >= 0 && index < state.points.length
    ? index
    : null;
  if (state.selectedPointIndex != null) {
    setStatus(`Point #${state.selectedPointIndex + 1} selected.`);
  }
  updateMapRoute();
  renderSidebar();
}

function normalizeSelectedPoint() {
  if (state.selectedPointIndex == null) return;
  if (state.selectedPointIndex < 0 || state.selectedPointIndex >= state.points.length) {
    state.selectedPointIndex = null;
  }
}

function wouldDuplicateAdjacentPoint(index, point) {
  const previous = state.points[index - 1];
  const next = state.points[index + 1];
  return Boolean(
    (previous && sameOrTooCloseRoutePoint(previous, point))
      || (next && sameOrTooCloseRoutePoint(next, point)),
  );
}

function sameOrTooCloseRoutePoint(left, right) {
  return sameRoutePoint(left, right)
    || distanceBetween(left, right) < FREEHAND_MIN_DISTANCE_METERS;
}

function movePoint(index, point) {
  if (index < 0 || index >= state.points.length) return false;
  if (wouldDuplicateAdjacentPoint(index, point)) return false;
  const snappedPoint = snapToVisibleLines(point);
  if (wouldDuplicateAdjacentPoint(index, snappedPoint)) return false;
  const points = clonePoints(state.points);
  points[index] = snappedPoint;
  state.points = points;
  normalizeSelectedPoint();
  updateMapRoute();
  renderSidebar();
  return true;
}

function insertPoint(index, point) {
  const previous = state.points[index - 1];
  const next = state.points[index];
  if ((previous && sameRoutePoint(previous, point)) || (next && sameRoutePoint(next, point))) {
    setStatus("Point unchanged.");
    renderSidebar();
    return;
  }
  const snappedPoint = snapToVisibleLines(point);
  if ((previous && sameRoutePoint(previous, snappedPoint)) || (next && sameRoutePoint(next, snappedPoint))) {
    setStatus("Point unchanged.");
    renderSidebar();
    return;
  }
  pushUndo();
  const points = clonePoints(state.points);
  points.splice(index, 0, snappedPoint);
  state.points = points;
  state.selectedPointIndex = index;
  setStatus("Point inserted.");
  render();
}

function deletePoint(index) {
  if (index < 0 || index >= state.points.length) return;
  const deletedPointNumber = index + 1;
  pushUndo();
  const points = clonePoints(state.points);
  points.splice(index, 1);
  state.points = points;
  if (state.selectedPointIndex === index) state.selectedPointIndex = null;
  else if (state.selectedPointIndex > index) state.selectedPointIndex -= 1;
  state.hoveredPointId = null;
  setStatus(`Point #${deletedPointNumber} deleted.`);
  render();
}

function deleteSelectedPoint() {
  if (state.selectedPointIndex == null) return;
  deletePoint(state.selectedPointIndex);
}

function simplifyRoute() {
  if (state.points.length < 3) return;
  const simplified = simplifyPoints(state.points, SIMPLIFY_TOLERANCE_METERS);
  if (simplified.length === state.points.length) {
    setStatus("Route already simple.");
    renderSidebar();
    return;
  }
  pushUndo();
  const removed = state.points.length - simplified.length;
  state.points = simplified;
  state.selectedPointIndex = null;
  setStatus(`Simplified route, removed ${removed} point${removed === 1 ? "" : "s"}.`);
  render();
}

function simplifyPoints(points, toleranceMeters) {
  if (points.length <= 2) return clonePoints(points);
  const keep = Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop();
    let maxDistance = 0;
    let maxIndex = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointToSegmentDistanceMeters(points[index], points[startIndex], points[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxIndex !== -1 && maxDistance > toleranceMeters) {
      keep[maxIndex] = true;
      stack.push([startIndex, maxIndex], [maxIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index]).map((point) => [...point]);
}

function beginRouteDraw(point) {
  state.drawingRoute = true;
  state.pendingRouteDraw = false;
  state.pendingDrawPoint = null;
  state.drawStartPoints = clonePoints(state.points);
  state.drawAddedPointCount = 0;
  syncMapDragPan();
  appendDrawPoint(point, true);
  updateMapCursor();
}

function appendDrawPoint(point, force = false) {
  const snappedPoint = snapToVisibleLines(point);
  const previous = state.points[state.points.length - 1];
  if (previous && sameRoutePoint(previous, snappedPoint)) return;
  if (!force && previous && distanceBetween(previous, snappedPoint) < FREEHAND_MIN_DISTANCE_METERS) return;
  state.points = [...state.points, snappedPoint];
  state.selectedPointIndex = state.points.length - 1;
  state.drawAddedPointCount += 1;
  updateMapRoute();
  renderSidebar();
}

function finishRouteDraw() {
  if (!state.drawingRoute) return;
  state.drawingRoute = false;
  if (state.drawAddedPointCount > 0) {
    pushUndo(state.drawStartPoints || []);
    suppressMapClicks();
    setStatus(state.drawAddedPointCount === 1 ? "Point added." : "Route segment drawn.");
  }
  state.drawStartPoints = null;
  state.drawAddedPointCount = 0;
  syncMapDragPan();
  render();
}

function toggleAreaSelectMode() {
  state.areaSelectMode = !state.areaSelectMode;
  state.drawingArea = false;
  state.areaStartPoint = null;
  if (state.areaSelectMode) {
    if (state.mode === "edit") setMode("view");
    syncMapDragPan();
    ensureAreaLayers();
    updateAreaOverlay();
    setStatus("Drag a rectangle to choose map data area.");
  } else {
    syncMapDragPan();
    setStatus("Area drawing cancelled.");
  }
  renderSidebar();
}

function finishAreaDraw() {
  state.drawingArea = false;
  state.areaStartPoint = null;
  state.areaSelectMode = false;
  syncMapDragPan();
  ensureAreaLayers();
  updateAreaOverlay();
  renderSidebar();
  if (state.selectedAreaBbox && bboxAreaIsUsable(state.selectedAreaBbox)) {
    setStatus("Map data area selected.");
  } else {
    state.selectedAreaBbox = null;
    updateAreaOverlay();
    setStatus("Map data area selection cancelled.");
  }
}

function undoPointEdit() {
  const previous = state.undoStack.pop();
  if (!previous) return;
  pushHistory(state.redoStack, state.points);
  state.points = previous;
  normalizeSelectedPoint();
  setStatus("Point edit undone.");
  render();
}

function redoPointEdit() {
  const next = state.redoStack.pop();
  if (!next) return;
  pushHistory(state.undoStack, state.points);
  state.points = next;
  normalizeSelectedPoint();
  setStatus("Point edit redone.");
  render();
}

function markRouteSavedToMobile() {
  state.mobileSavedSignature = routeSignature();
}

function routeSignature() {
  return JSON.stringify({
    name: state.routeName.trim(),
    points: state.points.map(([lon, lat]) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))]),
    breakSpots: state.breakSpots.map((spot) => ({
      name: spot.name,
      description: spot.description || "",
      point: spot.point.map((value) => Number(value.toFixed(6))),
    })),
  });
}

function routeSaveStateText() {
  if (state.points.length === 0) return "No route loaded";
  if (!canExport()) return "Need 2 points to save";
  if (state.mobileSavedSignature === routeSignature()) return "Saved to mobile";
  return state.mobileRouteId ? "Unsaved mobile edits" : "Not saved to mobile";
}

function hasUnsavedRouteChanges() {
  return state.points.length > 0 && state.mobileSavedSignature !== routeSignature();
}

function confirmDiscardUnsavedRoute() {
  if (!hasUnsavedRouteChanges()) return true;
  return window.confirm(DISCARD_UNSAVED_ROUTE_MESSAGE);
}

function render() {
  if (!map?.isStyleLoaded()) {
    renderSidebar();
    return;
  }
  ensureRouteLayers(map, routeFeatureCollection(state));
  ensureAreaLayers();
  updateMapRoute();
  updateAreaOverlay();
  renderSidebar();
}

function renderSidebar() {
  const editing = state.mode === "edit";
  const hasRoute = state.points.length > 0;
  const exportable = canExport();
  const showRouteDetails = editing || hasRoute;
  elements.modeBadge.textContent = state.mode === "edit" ? "Edit" : "View";
  setCommandButtonLabel(elements.newRouteButton, "Reset");
  setCommandButtonLabel(elements.editButton, hasRoute ? "Edit route" : "Draw route");
  elements.editButton.disabled = editing;
  elements.fitRouteButton.disabled = !hasRoute;
  elements.doneButton.disabled = !editing;
  elements.drawRouteButton.disabled = !editing;
  elements.undoButton.disabled = state.undoStack.length === 0;
  elements.redoButton.disabled = state.redoStack.length === 0;
  elements.simplifyButton.disabled = !editing || state.points.length < 3;
  elements.clearButton.disabled = !hasRoute;
  elements.exportButton.disabled = !exportable;
  elements.mobileSaveButton.disabled = !exportable || state.mobileSaveBusy;
  elements.drawAreaButton.disabled = state.areaDownloadBusy || editing;
  elements.downloadAreaButton.disabled = !state.selectedAreaBbox || state.areaDownloadBusy;
  renderDownloadAreaButton();
  elements.drawAreaButton.classList.toggle("active", state.areaSelectMode || state.drawingArea);
  elements.newRouteButton.hidden = editing || !hasRoute;
  elements.editButton.hidden = editing;
  elements.fitRouteButton.hidden = !hasRoute;
  elements.importButton.hidden = editing;
  elements.doneButton.hidden = !editing;
  elements.drawRouteButton.hidden = !editing;
  elements.undoButton.hidden = !editing;
  elements.redoButton.hidden = !editing;
  elements.simplifyButton.hidden = !editing || state.points.length < 3;
  elements.clearButton.hidden = !hasRoute;
  elements.exportButton.hidden = !exportable;
  elements.mobileSaveButton.hidden = !exportable;
  elements.mobileRoutesSection.hidden = editing;
  elements.mapToolsSection.hidden = editing;
  elements.routeSection.hidden = !showRouteDetails;
  elements.pointsSection.hidden = !editing;
  elements.streetNamesToggle.checked = state.layerSettings.streetNames;
  elements.poisToggle.checked = state.layerSettings.pois;
  elements.buildingsToggle.checked = state.layerSettings.buildings;
  elements.minorPathsToggle.checked = state.layerSettings.minorPaths;
  applyLayerSettings();
  elements.snapToLinesToggle.checked = state.snapToLines;
  elements.snapToLinesOption.hidden = !editing;
  elements.drawRouteButton.classList.toggle("active", editing && !isMapPanOverrideActive());
  elements.areaStatusText.textContent = areaStatusText();
  renderMobileSaveButton();
  renderMobileRoutes();
  renderDatasetStats();
  renderShortcutContext();
  elements.distanceValue.textContent = formatDistance(totalDistance(state.points));
  elements.pointCountValue.textContent = String(state.points.length);
  const routeSaveState = routeSaveStateText();
  elements.routeSaveState.textContent = routeSaveState;
  elements.routeSaveState.dataset.state = routeSaveState.toLowerCase().replaceAll(" ", "-");

  const newestFirstPoints = state.points
    .map((point, index) => ({ point, index }))
    .reverse();
  elements.pointsList.replaceChildren(
    ...newestFirstPoints.map(({ point, index }) => {
      const item = document.createElement("li");
      item.dataset.pointIndex = String(index);
      item.classList.toggle("selected", index === state.selectedPointIndex);
      item.setAttribute("aria-selected", index === state.selectedPointIndex ? "true" : "false");
      const pointText = document.createElement("span");
      pointText.className = "point-row-main";
      const pointIndex = document.createElement("span");
      pointIndex.className = "point-index";
      pointIndex.textContent = `#${index + 1}`;
      const code = document.createElement("code");
      code.textContent = `${point[1].toFixed(6)}, ${point[0].toFixed(6)}`;
      pointText.append(pointIndex);
      pointText.append(code);
      item.append(pointText);
      item.addEventListener("click", () => selectPoint(index));
      if (state.mode === "edit") {
        const deleteButton = document.createElement("button");
        deleteButton.className = "point-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          deletePoint(index);
        });
        item.append(deleteButton);
      }
      return item;
    }),
  );
}

function setCommandButtonLabel(button, label) {
  button.textContent = label;
}

function renderDownloadAreaButton() {
  elements.downloadAreaButton.setAttribute("aria-busy", state.areaDownloadBusy ? "true" : "false");
  if (state.areaDownloadBusy) {
    elements.downloadAreaButton.replaceChildren(
      spinnerElement(),
      document.createTextNode("Downloading"),
    );
    return;
  }
  elements.downloadAreaButton.textContent = "Download area map";
}

function renderMobileSaveButton() {
  elements.mobileSaveButton.setAttribute("aria-busy", state.mobileSaveBusy ? "true" : "false");
  if (state.mobileSaveBusy) {
    elements.mobileSaveButton.replaceChildren(
      spinnerElement(),
      document.createTextNode("Saving"),
    );
    return;
  }
  elements.mobileSaveButton.textContent = "Save to mobile app";
}

function spinnerElement() {
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");
  return spinner;
}

async function refreshMobileRoutes(options = {}) {
  const preservedRoutes = routesPreservedForRefresh(state.mobileRoutes, options.preserveRouteIds);
  if (!options.background) state.mobileRoutesLoading = true;
  state.mobileRoutesError = "";
  if (!options.background) renderMobileRoutes();
  try {
    const response = await fetch(MOBILE_ROUTES_URL);
    if (!response.ok) throw new Error(`Mobile route catalog failed: ${response.status}`);
    const data = await response.json();
    state.mobileRoutes = mergePreservedMobileRoutes(
      Array.isArray(data.routes) ? data.routes : [],
      preservedRoutes,
    );
    state.mobileRoutesError = "";
  } catch {
    if (!options.preserveOnError) state.mobileRoutes = [];
    state.mobileRoutesError = "Start map data service to load app routes.";
  } finally {
    if (!options.background) state.mobileRoutesLoading = false;
    renderSidebar();
  }
}

function refreshManagedMobileRoutes() {
  refreshMobileRoutes({
    preserveOnError: true,
    preserveRouteIds: [state.mobileRouteId],
  });
}

function renderMobileRoutes() {
  if (!elements.mobileRouteSelect) return;
  const selectedId = elements.mobileRouteSelect.value;
  if (elements.mobileRouteSearch.value !== state.mobileRouteFilter) {
    elements.mobileRouteSearch.value = state.mobileRouteFilter;
  }
  const filteredRoutes = filteredMobileRoutes();
  const nextSelectedId = nextMobileRouteSelection(selectedId, filteredRoutes, state.mobileRouteId);

  elements.mobileRouteSelect.replaceChildren(
    ...(state.mobileRoutesLoading
      ? [new Option("Loading routes...", "")]
      : filteredRoutes.length > 0
        ? filteredRoutes.map((route) => new Option(mobileRouteLabel(route), route.id))
        : [new Option(state.mobileRoutes.length > 0 ? "No matching routes" : "No mobile routes", "")]),
  );
  elements.mobileRouteSelect.value = nextSelectedId;
  elements.mobileRouteSelect.disabled = state.mobileRoutesLoading || filteredRoutes.length === 0;
  elements.refreshMobileRoutesButton.disabled = state.mobileRoutesLoading;
  renderMobileRouteSortButtons();
  renderMobileRouteLoadButton(nextSelectedId);
  renderMobileRouteDeleteButton(nextSelectedId);
  renderMobileRouteList(filteredRoutes, nextSelectedId);

  if (state.mobileRoutesLoading) {
    elements.mobileRouteStatus.textContent = "Loading mobile route catalog.";
  } else if (state.mobileRoutesError) {
    elements.mobileRouteStatus.textContent = state.mobileRoutesError;
  } else {
    elements.mobileRouteStatus.textContent = mobileRouteStatusText(filteredRoutes, {
      allRouteCount: state.mobileRoutes.length,
      filter: state.mobileRouteFilter,
      selectedRouteId: elements.mobileRouteSelect.value,
    });
  }
}

function renderMobileRouteLoadButton(selectedRouteId) {
  const selectedLoadedRoute = selectedRouteId && selectedRouteId === state.mobileRouteId;
  const selectedLoadedRouteDirty = selectedLoadedRoute && hasUnsavedRouteChanges();
  if (selectedLoadedRouteDirty) {
    elements.loadMobileRouteButton.textContent = "Revert changes";
    elements.loadMobileRouteButton.disabled = state.mobileRoutesLoading;
    return;
  }
  if (selectedLoadedRoute) {
    elements.loadMobileRouteButton.textContent = "Loaded";
    elements.loadMobileRouteButton.disabled = true;
    return;
  }
  elements.loadMobileRouteButton.textContent = "Load route";
  elements.loadMobileRouteButton.disabled = state.mobileRoutesLoading || !selectedRouteId;
}

function renderMobileRouteDeleteButton(selectedRouteId) {
  elements.deleteMobileRouteButton.disabled = state.mobileRoutesLoading ||
    state.mobileRouteDeleteBusy ||
    !selectedRouteId;
  elements.deleteMobileRouteButton.setAttribute("aria-busy", state.mobileRouteDeleteBusy ? "true" : "false");
  if (state.mobileRouteDeleteBusy) {
    elements.deleteMobileRouteButton.replaceChildren(
      spinnerElement(),
      document.createTextNode("Deleting"),
    );
    return;
  }
  elements.deleteMobileRouteButton.textContent = "Delete route";
}

function renderMobileRouteList(filteredRoutes, selectedId) {
  if (!elements.mobileRouteList) return;
  if (state.mobileRoutesLoading) {
    elements.mobileRouteList.replaceChildren(emptyMobileRouteListItem("Loading routes..."));
    return;
  }
  if (filteredRoutes.length === 0) {
    elements.mobileRouteList.replaceChildren(
      emptyMobileRouteListItem(state.mobileRoutes.length > 0 ? "No matching routes" : "No mobile routes"),
    );
    return;
  }

  elements.mobileRouteList.replaceChildren(
    ...filteredRoutes.map((route) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mobile-route-item";
      button.dataset.mobileRouteId = route.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", route.id === selectedId ? "true" : "false");
      if (route.id === selectedId) button.classList.add("selected");
      const routeLoaded = route.id === state.mobileRouteId;
      if (routeLoaded) {
        button.classList.add("loaded");
        button.dataset.loaded = "true";
      }
      const routeUnsaved = routeLoaded && hasUnsavedRouteChanges();
      if (routeUnsaved) {
        button.classList.add("unsaved");
        button.dataset.unsaved = "true";
      }

      const title = document.createElement("span");
      title.className = "mobile-route-title";
      const titleText = document.createElement("span");
      titleText.textContent = mobileRouteDisplayTitle(
        route,
        state.mobileRouteId,
        hasUnsavedRouteChanges() ? state.routeName : null,
      );
      title.append(titleText);
      if (routeLoaded) {
        const loadedBadge = document.createElement("span");
        loadedBadge.className = "route-state-badge";
        loadedBadge.textContent = routeUnsaved ? "Unsaved" : "Loaded";
        title.append(loadedBadge);
      }
      const meta = document.createElement("span");
      meta.className = "mobile-route-meta";
      meta.textContent = mobileRouteMeta(route);
      button.append(title, meta);
      button.addEventListener("click", () => {
        elements.mobileRouteSelect.value = route.id;
        renderMobileRoutes();
      });
      button.addEventListener("dblclick", () => {
        elements.mobileRouteSelect.value = route.id;
        loadSelectedMobileRoute(route.id);
      });
      return button;
    }),
  );
  elements.mobileRouteList.querySelector(".mobile-route-item.selected")
    ?.scrollIntoView({ block: "nearest" });
}

function selectAdjacentMobileRoute(direction) {
  const filteredRoutes = filteredMobileRoutes();
  if (filteredRoutes.length === 0) return;
  const currentIndex = filteredRoutes.findIndex((route) => route.id === elements.mobileRouteSelect.value);
  const fallbackIndex = direction > 0 ? -1 : filteredRoutes.length;
  const nextIndex = Math.max(0, Math.min(
    filteredRoutes.length - 1,
    (currentIndex === -1 ? fallbackIndex : currentIndex) + direction,
  ));
  elements.mobileRouteSelect.value = filteredRoutes[nextIndex].id;
  renderMobileRoutes();
}

function emptyMobileRouteListItem(message) {
  const item = document.createElement("p");
  item.className = "mobile-route-empty";
  item.textContent = message;
  return item;
}

function renderMobileRouteSortButtons() {
  elements.mobileRouteSortButtons.forEach((button) => {
    const selected = button.dataset.routeSort === state.mobileRouteSortMode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function filteredMobileRoutes() {
  const filteredRoutes = state.mobileRoutes.filter((route) => routeMatchesMobileFilter(
    route,
    state.mobileRouteFilter,
    mobileRouteDisplayTitle(route, state.mobileRouteId, hasUnsavedRouteChanges() ? state.routeName : null),
  ));
  const center = map?.getCenter();
  const mapCenter = center ? [center.lng, center.lat] : null;
  return [...filteredRoutes].sort(mobileRouteComparator(state.mobileRouteSortMode, mapCenter));
}

function upsertSavedMobileRoute(payload, gpx) {
  const route = payload.route || {};
  const routeId = route.id || state.mobileRouteId;
  if (!routeId) return;
  const savedRoute = {
    id: routeId,
    title: route.title || state.routeName,
    lengthKm: Number.isFinite(route.lengthKm) ? route.lengthKm : undefined,
    trackPointCount: Number.isFinite(route.trackPointCount)
      ? route.trackPointCount
      : Number.isFinite(route.pointCount)
        ? route.pointCount
        : state.points.length,
    source: route.source || "LiteGPX",
    bounds: route.bounds,
    gpxAsset: route.gpxAsset,
  };
  state.mobileRoutes = [
    ...state.mobileRoutes.filter((entry) => entry.id !== savedRoute.id),
    savedRoute,
  ].sort((left, right) => (left.title || left.id).localeCompare(right.title || right.id, "fi"));
  state.mobileRouteGpxById[savedRoute.id] = gpx;
}

async function loadSelectedMobileRoute(routeId = elements.mobileRouteSelect.value) {
  if (!routeId) return;
  elements.mobileRouteSelect.value = routeId;
  const revertingLoadedRoute = routeId === state.mobileRouteId && hasUnsavedRouteChanges();
  if (routeId === state.mobileRouteId && !revertingLoadedRoute) return;
  if (!confirmDiscardUnsavedRoute()) {
    restoreLoadedMobileRouteSelection();
    return;
  }
  elements.loadMobileRouteButton.disabled = true;
  try {
    if (state.mobileRouteGpxById[routeId]) {
      const route = state.mobileRoutes.find((entry) => entry.id === routeId) || { id: routeId };
      applyMobileRoutePayload({ route, gpx: state.mobileRouteGpxById[routeId] });
    } else {
      const response = await fetch(`${MOBILE_ROUTES_URL}/${encodeURIComponent(routeId)}`);
      if (!response.ok) throw new Error(`Mobile route load failed: ${response.status}`);
      applyMobileRoutePayload(await response.json());
    }
    setStatus(revertingLoadedRoute ? "Mobile route changes reverted." : "Mobile route loaded for viewing.");
  } catch {
    setStatus("Mobile route load failed.", true);
  } finally {
    renderSidebar();
  }
}

async function deleteSelectedMobileRoute(routeId = elements.mobileRouteSelect.value) {
  if (!routeId || state.mobileRouteDeleteBusy) return;
  const route = state.mobileRoutes.find((entry) => entry.id === routeId) || { id: routeId };
  if (!window.confirm(`Delete "${mobileRouteDisplayTitle(
    route,
    state.mobileRouteId,
    hasUnsavedRouteChanges() ? state.routeName : null,
  )}" from mobile routes?`)) return;

  state.mobileRouteDeleteBusy = true;
  renderMobileRoutes();
  try {
    const response = await fetch(`${MOBILE_ROUTES_URL}/${encodeURIComponent(routeId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`Mobile route delete failed: ${response.status}`);
    await response.json();

    state.mobileRoutes = state.mobileRoutes.filter((entry) => entry.id !== routeId);
    delete state.mobileRouteGpxById[routeId];
    if (state.mobileRouteId === routeId) {
      clearLoadedRouteState();
    }
    setStatus("Mobile route deleted.");
  } catch {
    setStatus("Mobile route delete failed.", true);
  } finally {
    state.mobileRouteDeleteBusy = false;
    renderSidebar();
  }
}

function clearLoadedRouteState() {
  state.routeName = "Untitled route";
  state.points = [];
  state.selectedPointIndex = null;
  state.mobileRouteId = null;
  state.mobileSavedSignature = null;
  clearRouteHistory();
  state.imported = false;
  state.importedEditingCopy = false;
  state.mode = "view";
  state.breakSpots = [];
  elements.routeName.value = state.routeName;
}

function restoreLoadedMobileRouteSelection() {
  if (!state.mobileRouteId) return;
  const hasLoadedRouteOption = Array.from(elements.mobileRouteSelect.options)
    .some((option) => option.value === state.mobileRouteId);
  if (!hasLoadedRouteOption) return;
  elements.mobileRouteSelect.value = state.mobileRouteId;
  renderMobileRoutes();
}

function applyMobileRoutePayload(payload) {
  const parsed = parseGpx(payload.gpx || "");
  if (parsed.points.length < 2) throw new Error("No usable GPX track");
  const route = payload.route || {};
  state.routeName = route.title || parsed.name || route.id || "Mobile route";
  state.mobileRouteId = route.id || null;
  state.points = parsed.points;
  state.breakSpots = parsed.breakSpots || [];
  state.selectedPointIndex = null;
  clearRouteHistory();
  state.imported = true;
  state.importedEditingCopy = false;
  state.mode = "view";
  elements.routeName.value = state.routeName;
  markRouteSavedToMobile();
  fitRoute();
  render();
}

function renderDatasetStats() {
  const countedDetailMaps = countedDetailMapsForStats();
  const detailBytes = countedDetailMaps.reduce((sum, detailMap) => (
    Number.isFinite(detailMap.sizeBytes) ? sum + detailMap.sizeBytes : sum
  ), 0);
  const anyDetailLoading = countedDetailMaps.some((detailMap) => detailMap.sizeLoading);
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
  elements.detailDatasetCount.textContent = String(countedDetailMaps.length);
}

function countedDetailMapsForStats() {
  return state.detailMaps.filter((detailMap) => detailMap.url !== LOCAL_BASE_MAP_URL);
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
  if (state.mode === "edit") return "edit";
  return "view";
}

function setStatus(message, error = false) {
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("error", error);
}

function updateMapRoute() {
  if (!map?.getSource("route")) return;
  map.getSource("route").setData(routeFeatureCollection(state));
}

function updateAreaOverlay() {
  if (!map?.getSource("selected-area")) return;
  map.getSource("selected-area").setData(areaFeatureCollection());
}

function areaFeatureCollection() {
  if (!state.selectedAreaBbox || !bboxAreaIsUsable(state.selectedAreaBbox)) {
    return { type: "FeatureCollection", features: [] };
  }
  const [minLon, minLat, maxLon, maxLat] = state.selectedAreaBbox;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ]],
      },
    }],
  };
}

function areaStatusText() {
  if (state.areaDownloadBusy) return "Downloading selected map data.";
  if (state.areaSelectMode || state.drawingArea) return "Drag on the map to draw area.";
  if (!state.selectedAreaBbox) return "No area selected.";
  return `BBox ${state.selectedAreaBbox.map((value) => value.toFixed(6)).join(", ")}`;
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

function downloadGpx() {
  if (!canExport()) return;
  const gpx = exportGpx(state.routeName, state.points, state.breakSpots);
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

async function saveRouteToMobileApp() {
  if (!canExport() || state.mobileSaveBusy) return;
  const gpx = exportGpx(state.routeName, state.points, state.breakSpots);
  state.mobileSaveBusy = true;
  renderSidebar();
  setStatus("Saving route and corridor map to mobile app.");
  try {
    const response = await fetch(MOBILE_SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routeId: state.mobileRouteId,
        routeName: state.routeName,
        gpx,
        bufferMeters: 1000,
        coverage: "corridor",
        maxzoom: 15,
        providers: "digiroad",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Mobile save failed");
    state.mobileRouteId = payload.route?.id || state.mobileRouteId;
    upsertSavedMobileRoute(payload, gpx);
    state.mobileRouteFilter = "";
    elements.mobileRouteSelect.value = state.mobileRouteId || "";
    markRouteSavedToMobile();
    setStatus(`Saved to mobile app: ${payload.route?.file || "route GPX"} and ${payload.map?.mobileFile || "map data"}.`);
    refreshStoredDetailMaps();
    refreshMobileRoutes({ background: true, preserveOnError: true, preserveRouteIds: [state.mobileRouteId] });
  } catch (error) {
    setStatus(`Mobile save failed: ${error.message}`, true);
  } finally {
    state.mobileSaveBusy = false;
    renderSidebar();
  }
}

async function downloadSelectedAreaMap() {
  if (!state.selectedAreaBbox || state.areaDownloadBusy) return;
  state.areaDownloadBusy = true;
  renderSidebar();
  setStatus("Downloading selected area map data.");
  try {
    const response = await fetch(EXTRACT_BBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bbox: state.selectedAreaBbox,
        name: `web-area-${new Date().toISOString().slice(0, 10)}`,
        maxzoom: 15,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Area map download failed");
    addDetailMap(payload.url, {
      name: payload.name,
      cacheKey: payload.cacheKey,
      sizeBytes: payload.sizeBytes,
    });
    if (payload.provider?.url) {
      addDetailMap(payload.provider.url, {
        name: payload.provider.name || `${payload.name} providers`,
        kind: "provider",
        cacheKey: payload.provider.cacheKey,
        sizeBytes: payload.provider.sizeBytes,
      });
    }
    state.selectedAreaBbox = null;
    updateAreaOverlay();
    refreshStoredDetailMaps();
    setStatus(`Downloaded area map: ${payload.name || "selected area"}.`);
  } catch (error) {
    setStatus(`Area map download failed: ${error.message}`, true);
  } finally {
    state.areaDownloadBusy = false;
    renderSidebar();
  }
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

function snapToVisibleLines(point) {
  if (!state.snapToLines || !map?.isStyleLoaded()) return point;
  const layerIds = visibleSnapLayerIds();
  if (layerIds.length === 0) return point;
  const screenPoint = map.project(point);
  let features = [];
  try {
    features = map.queryRenderedFeatures([
      [screenPoint.x - SNAP_TOLERANCE_PIXELS, screenPoint.y - SNAP_TOLERANCE_PIXELS],
      [screenPoint.x + SNAP_TOLERANCE_PIXELS, screenPoint.y + SNAP_TOLERANCE_PIXELS],
    ], { layers: layerIds });
  } catch {
    return point;
  }
  const snappedScreenPoint = nearestRenderedLinePoint(screenPoint, features);
  if (!snappedScreenPoint || snappedScreenPoint.distance > SNAP_TOLERANCE_PIXELS) return point;
  const snappedLngLat = map.unproject([snappedScreenPoint.x, snappedScreenPoint.y]);
  return [snappedLngLat.lng, snappedLngLat.lat];
}

function visibleSnapLayerIds() {
  return allSnapLayerIds().filter((layerId) => {
    if (!map.getLayer(layerId)) return false;
    return map.getLayoutProperty(layerId, "visibility") !== "none";
  });
}

function allSnapLayerIds() {
  const detailLayerIds = state.detailMaps.flatMap((detailMap) =>
    SNAP_LINE_LAYER_IDS.map((layerId) => detailLayerId(detailMap.sourceId, layerId)),
  );
  return [...SNAP_LINE_LAYER_IDS, ...detailLayerIds];
}

function nearestRenderedLinePoint(screenPoint, features) {
  let best = null;
  features.forEach((feature) => {
    lineCoordinateSets(feature.geometry).forEach((line) => {
      for (let index = 0; index < line.length - 1; index++) {
        const start = line[index];
        const end = line[index + 1];
        if (!isCoordinate(start) || !isCoordinate(end)) continue;
        const candidate = nearestScreenPointOnSegment(
          screenPoint,
          map.project(start),
          map.project(end),
        );
        if (!best || candidate.distance < best.distance) best = candidate;
      }
    });
  });
  return best;
}

function lineCoordinateSets(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function isCoordinate(value) {
  return Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]);
}

function findSnapTestCandidate() {
  if (!map?.isStyleLoaded()) return null;
  const layerIds = visibleSnapLayerIds();
  if (layerIds.length === 0) return null;
  const canvas = map.getCanvas();
  for (const layerId of layerIds) {
    let features = [];
    try {
      features = map.queryRenderedFeatures(undefined, { layers: [layerId] });
    } catch {
      continue;
    }
    for (const feature of features) {
      for (const line of lineCoordinateSets(feature.geometry)) {
        for (let index = 0; index < line.length - 1; index++) {
          const startCoordinate = line[index];
          const endCoordinate = line[index + 1];
          if (!isCoordinate(startCoordinate) || !isCoordinate(endCoordinate)) continue;
          const start = map.project(startCoordinate);
          const end = map.project(endCoordinate);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const length = Math.hypot(dx, dy);
          if (length < 40) continue;
          const mid = { x: start.x + dx / 2, y: start.y + dy / 2 };
          const offset = {
            x: mid.x + (-dy / length) * (SNAP_TOLERANCE_PIXELS / 2),
            y: mid.y + (dx / length) * (SNAP_TOLERANCE_PIXELS / 2),
          };
          if (!isScreenPointInsideCanvas(mid, canvas) || !isScreenPointInsideCanvas(offset, canvas)) continue;
          const testLngLat = map.unproject([offset.x, offset.y]);
          const snappedPoint = snapToVisibleLines([testLngLat.lng, testLngLat.lat]);
          const snappedScreen = map.project(snappedPoint);
          const distanceAfterPixels = Math.hypot(snappedScreen.x - mid.x, snappedScreen.y - mid.y);
          if (distanceAfterPixels > 1.5) continue;
          return {
            layerId: feature.layer?.id || layerId,
            testPoint: [testLngLat.lng, testLngLat.lat],
            snappedPoint,
            distanceBeforePixels: Math.hypot(offset.x - mid.x, offset.y - mid.y),
            distanceAfterPixels,
          };
        }
      }
    }
  }
  return null;
}

function exposeTestApi() {
  window.__trailLiteTest = {
    getState: () => ({
      mode: state.mode,
      routeName: state.routeName,
      mobileRouteId: state.mobileRouteId,
      routeSaveState: routeSaveStateText(),
      mobileSaveBusy: state.mobileSaveBusy,
      mobileRouteDeleteBusy: state.mobileRouteDeleteBusy,
      points: clonePoints(state.points),
      distanceMeters: totalDistance(state.points),
      canExport: canExport(),
      undoDepth: state.undoStack.length,
      redoDepth: state.redoStack.length,
      imported: state.imported,
      importedEditingCopy: state.importedEditingCopy,
      status: elements.statusText.textContent,
      drawingRoute: state.drawingRoute,
      selectedPointIndex: state.selectedPointIndex,
      snapToLines: state.snapToLines,
      layerSettings: { ...state.layerSettings },
      dataset: {
        baseBytes: state.dataset.baseBytes,
        baseLoading: state.dataset.baseLoading,
        detailBytes: countedDetailMapsForStats().reduce((sum, detailMap) => (
          Number.isFinite(detailMap.sizeBytes) ? sum + detailMap.sizeBytes : sum
        ), 0),
        detailCount: countedDetailMapsForStats().length,
        detailLoading: countedDetailMapsForStats().some((detailMap) => detailMap.sizeLoading),
      },
      cursor: currentMapCursor(),
      mapSourceUrl: state.mapSourceUrl,
      detailMaps: state.detailMaps.map((detailMap) => ({ ...detailMap })),
      mobileRoutes: state.mobileRoutes.map((route) => ({ ...route })),
      mobileRoutesLoading: state.mobileRoutesLoading,
      mobileRoutesError: state.mobileRoutesError,
      areaSelectMode: state.areaSelectMode,
      selectedAreaBbox: state.selectedAreaBbox ? [...state.selectedAreaBbox] : null,
      mapCenter: map ? [map.getCenter().lng, map.getCenter().lat] : null,
      mapZoom: map ? map.getZoom() : null,
    }),
    setRoute: (points, name = "Test route") => {
      state.points = clonePoints(points);
      state.breakSpots = [];
      state.selectedPointIndex = null;
      state.routeName = name;
      state.mobileRouteId = null;
      state.mobileSavedSignature = null;
      elements.routeName.value = name;
      clearRouteHistory();
      render();
    },
    setSnapToLines: (enabled) => {
      state.snapToLines = Boolean(enabled);
      renderSidebar();
    },
    snapPoint: (lon, lat) => snapToVisibleLines([lon, lat]),
    findSnapTestCandidate,
    startEditing,
    addPoint: (lon, lat) => addPoint([lon, lat]),
    beginRouteDraw: (lon, lat) => beginRouteDraw([lon, lat]),
    appendDrawPoint: (lon, lat) => appendDrawPoint([lon, lat]),
    finishRouteDraw,
    undoPointEdit,
    redoPointEdit,
    simplifyRoute,
    applyMobileRoutePayload,
    refreshMobileRoutes,
    deleteSelectedMobileRoute,
    setMobileRoutesForTest: (routes) => {
      state.mobileRoutes = routes.map(({ gpx, ...route }) => ({ ...route }));
      state.mobileRouteGpxById = Object.fromEntries(
        routes
          .filter((route) => typeof route.gpx === "string")
          .map((route) => [route.id, route.gpx]),
      );
      state.mobileRouteFilter = "";
      state.mobileRoutesLoading = false;
      state.mobileRoutesError = "";
      renderSidebar();
    },
    insertPoint: (index, lon, lat) => insertPoint(index, [lon, lat]),
    movePoint: (index, lon, lat) => movePoint(index, [lon, lat]),
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
    addDetailMap,
    setSelectedAreaBbox: (bbox) => {
      state.selectedAreaBbox = bbox ? [...bbox] : null;
      ensureAreaLayers();
      updateAreaOverlay();
      renderSidebar();
    },
    setAreaDownloadBusy: (busy) => {
      state.areaDownloadBusy = Boolean(busy);
      renderSidebar();
    },
    formatBytes,
    findPlace,
    exportGpx: () => exportGpx(state.routeName, state.points, state.breakSpots),
    saveRouteToMobileApp,
    parseGpx,
    getLastExportedGpx: () => state.lastExportedGpx,
  };
}
