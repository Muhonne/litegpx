# LiteGPX Product Contract

LiteGPX is a small offline route navigation workspace for planning GPX routes on desktop and riding them on Android.

## Current Components

- `mobile/` is the offline Android app. It renders GPX routes on a local MapLibre map and tracks current position against the selected route.
- `web/` is the desktop route builder. It draws, imports, edits, exports, and saves GPX routes into the local Android workspace.
- `mapdataservice/` is the local data tool/API. It creates PMTiles extracts and Finnish provider overlays for web planning and Android builds.
- `shared/` holds generated local map packages and shared style assets. PMTiles outputs are ignored by Git.

## Canonical Docs

- `docs/FEATURES.md` is the active feature/use-case index.
- `docs/features/` contains one short behavior doc per feature. Each feature doc has description, code references, verification, and one Gherkin scenario.
- `docs/DATA.md` owns route/map data contracts, storage locations, generated artifacts, and credentials.
- `docs/archive/` contains historical notes that are not active product contracts.
- `mobile/README.md`, `web/README.md`, and `mapdataservice/README.md` own run/build/test commands for each subproject.

## Hard Constraints

- Android must work offline after install.
- Android must not add `android.permission.INTERNET` unless the product requirement changes.
- External map/provider downloads belong in `mapdataservice/`, not in Android.
- Generated PMTiles and provider caches stay out of Git.
- GPX route geometry is WGS84 longitude/latitude in route order.
- The normal local save-to-mobile flow mutates the Android workspace and shared generated maps for the next debug build.

## Mobile App

Code starting points:

- `mobile/app/src/main/java/com/example/traillite/MainActivity.kt`
- `mobile/app/src/main/java/com/example/traillite/TrailMapController.kt`
- `mobile/app/src/main/java/com/example/traillite/TrailStorage.kt`
- `mobile/app/src/main/java/com/example/traillite/BatteryLocationClient.kt`
- `mobile/app/src/main/java/com/example/traillite/BundledRoute.kt`
- `mobile/app/src/main/java/com/example/traillite/GpxParser.kt`
- `mobile/app/src/main/java/com/example/traillite/MapLayerSettings.kt`

Current behavior:

- Loads bundled GPX routes from `mobile/app/src/main/assets/routes/`.
- Imports GPX through Android document/share flows.
- Renders a local PMTiles map and optional provider overlay from bundled or imported map files.
- Shows the route line, current position, progress, remaining distance, and on-route/off-route status.
- Settings cover Street names, POIs, Buildings, Paths and tracks, GPS refresh, Move map on every, Automatic tracking zoom, Zoom, Keep screen on, App brightness, Dark theme, Map info card, and Route info card.
- Moves the location dot on every accepted GPS fix and moves the map camera according to the configured map update cadence.

## Web App

Code starting points:

- `web/src/app.js` for app state, UI wiring, map interaction flow, service calls, and test hooks.
- `web/src/features/route-layers.js` for route MapLibre layers and route GeoJSON.
- `web/src/features/map-style.js` for PMTiles style loading, detail overlays, layer groups, and provider overlay styling.
- `web/src/features/mobile-routes.js` for mobile route catalog filtering, sorting, labels, and stale-refresh handling.
- `web/src/features/places.js` for built-in map search locations.
- `web/src/lib/gpx.js` for GPX parse/export.
- `web/src/lib/geo.js` for route distance, snapping geometry, bbox, and point-copy helpers.
- `web/src/lib/format.js` for display formatting and slug/search helpers.

Current behavior:

- Opens as a map-first desktop route builder.
- Draws freehand route points and supports click-to-add points.
- Lets the user select, drag, insert, delete, simplify, undo, and redo route points.
- Holding Space temporarily enables map dragging in any mode.
- Clicking a route point selects it; Delete or Backspace removes the selected point in edit mode.
- Imports GPX track points for viewing and creates an editable copy when editing starts.
- Exports clean GPX 1.1 using `<trk><trkseg><trkpt lat="..." lon="..." />`.
- Lists bundled Android routes through the local data service, with filtering and Nearby/A-Z/Length sorting.
- Saves valid routes into the Android workspace through `POST /api/save-mobile-route`.
- Requests reusable planning detail through `POST /api/extract-bbox`.

## Map Data Service

Code starting points:

- `mapdataservice/server.mjs`
- `mapdataservice/extract-route-map.mjs`
- `mapdataservice/build-finnish-map.mjs`
- `mapdataservice/protomaps-source.mjs`

Current behavior:

- Resolves a full Protomaps PMTiles source for broad planning/base extraction.
- Extracts route-corridor or bbox PMTiles packages into `mapdataservice/output/`.
- Builds Finnish provider overlay PMTiles from Digiroad and optional NLS data.
- Lists generated datasets for the web app.
- Reads and mutates the Android route catalog for local development.
- Saves web-created routes and regenerates shared Android route corridor base/provider map packages plus `shared/maps/manifest.json` for the next build.

## Data Contracts

GPX export/import:

- Use GPX 1.1 XML.
- Store route geometry as track points, not route-only points.
- Use decimal WGS84 coordinates.
- Include at least two valid points.
- Keep latitude in `-90..90` and longitude in `-180..180`.
- XML-escape route names.

Route catalog:

- Bundled route metadata lives in `mobile/app/src/main/assets/routes/routes.json`.
- GPX assets referenced by the catalog live under `mobile/app/src/main/assets/routes/`.
- Saved web edits preserve the loaded route id when the route came from the catalog.

Map packages:

- `shared/maps/finland.pmtiles` is the generated Android base map package.
- `shared/maps/finland.providers.pmtiles` is the optional generated Finnish provider overlay.
- `shared/maps/manifest.json` lets Android refresh copied bundled map files after app updates.
- `mapdataservice/output/` contains generated reusable local map packages.

## UX Direction

- The web app is utilitarian, map-first, desktop-oriented, and sparse.
- The Android app is rider-oriented: large glanceable route state matters more than dense text.
- Avoid marketing pages, decorative layouts, account flows, social sharing, and cloud persistence.
- Prefer explicit controls over hidden gestures, but keep common shortcuts where they speed real editing.

## Non-Goals

- Turn-by-turn navigation.
- Hosted accounts or cloud route storage.
- Mobile browser route editing.
- Android runtime map downloads.
- Automatic road/path routing until routing data and profile rules are intentionally designed.
