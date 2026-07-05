# TrailLite Use Cases

This document contains the main product behavior in Gherkin-style scenarios so implementation, manual testing, and documentation stay aligned.

Related documents:

- [PRODUCT.md](PRODUCT.md) for product scope, features, and data-format contracts.
- [DATA.md](DATA.md) for map/route data layers, storage locations, and service workflows.
- [../mapdataservice/README.md](../mapdataservice/README.md) for map data service commands and API details.

## Mobile App

Code starting points:

- App state, route selection, imports, permissions, and top-level UI: `mobile/app/src/main/java/com/example/traillite/MainActivity.kt`
- Route picker UI: `mobile/app/src/main/java/com/example/traillite/MainActivity.kt` `RoutePickerDialog`
- Bundled route metadata loading: `mobile/app/src/main/java/com/example/traillite/BundledRoute.kt` `BundledRouteCatalog`
- GPX parsing: `mobile/app/src/main/java/com/example/traillite/GpxParser.kt` `parseTrackPoints`
- Map rendering, route overlay, GPS dot, route projection, and navigation camera: `mobile/app/src/main/java/com/example/traillite/TrailMapController.kt`
- Location update cadence and permissions: `mobile/app/src/main/java/com/example/traillite/BatteryLocationClient.kt`
- Settings persistence: `mobile/app/src/main/java/com/example/traillite/MapLayerSettings.kt`

```gherkin
Feature: Mobile offline route navigation
  TrailLite mobile lets the user select an offline GPX route and track their current position against it.

  Scenario: Select a bundled route
    Given the Android app is installed with bundled GPX routes
    And the bundled offline map packages are available in app assets
    When the user opens the route list
    And selects a route
    Then the route is drawn on the offline map
    And the route name, point count, and distance are shown
    And the app remains usable without network access

  Scenario: Track position against the selected route
    Given a route is selected
    And location permission is granted
    When the user starts GPS tracking
    Then the app updates the current position on the map
    And the map follows the current position during tracking
    And the navigation readout shows route progress, remaining distance, and on-route/off-route status

  Scenario: Adjust tracking settings
    Given the app is open
    When the user opens Settings
    Then the user can adjust the GPS refresh interval
    And the user can keep the screen on while riding
    And the user can enable app-specific screen brightness and set the brightness level
    And the user can enable automatic tracking zoom and choose the route-tracking zoom level
    And the user can toggle light or dark display behavior
    And the user can show or hide the Map info card and Route info card independently
```

## Web Route Editing

Code starting points:

- Web app state, UI bindings, route drawing, imports, exports, and save-to-mobile calls: `web/src/app.js`
- Route drawing/editing: `beginRouteDraw`, `appendDrawPoint`, `finishRouteDraw`, `addPoint`, `insertPoint`, `deletePoint`, `undoPointEdit`, `redoPointEdit`
- GPX import/export: `parseGpx`, `exportGpx`, `downloadGpx`
- Mobile route management: `refreshMobileRoutes`, `loadSelectedMobileRoute`, `applyMobileRoutePayload`
- Route rendering: `ensureRouteLayers`, `routeFeatureCollection`, `updateMapRoute`
- Web runtime and manual check commands: `web/README.md`

```gherkin
Feature: Web GPX route creation
  TrailLite GPX Builder lets the user create mobile-compatible GPX routes on desktop.

  Scenario: Draw a new route by dragging on the map
    Given the web app is open in view mode
    And no route points exist
    When the user presses "Draw route"
    And drags the mouse across the map
    Then the app adds route points along the drag path
    And the route is shown in edit mode using the edit route color
    And the route distance and point count update

  Scenario: Finish and save a drawn route
    Given the user has drawn at least two route points
    And the route has a name
    When the user presses "Done"
    Then the app returns to view mode
    And the user can press "Fit route" to refocus the map on the current route
    When the user presses "Save route"
    Then the browser downloads a GPX 1.1 file
    And the GPX contains TrailLite-compatible track points in route order

  Scenario: Undo and redo route drawing mistakes
    Given the user is editing a route
    And route point edits have been made
    When the user presses "Undo"
    Then the most recent point edit is reverted
    And the reverted edit can be restored with "Redo"
    And the app keeps the last 10 route edit actions in history
    And the route distance and point count update
    And the newest-first point list still shows each point's route-order number

  Scenario: Simplify a dense drawn route
    Given the user is editing a route with many freehand points
    When the user presses "Simplify"
    Then unnecessary intermediate points are removed
    And the route start and end points are preserved
    And the simplification can be undone
```

```gherkin
Feature: Web GPX import and editing
  TrailLite GPX Builder lets the user inspect existing GPX files and edit a copy.

  Scenario: Import a valid GPX file for viewing
    Given the web app is open
    When the user imports a valid GPX file
    Then the route is parsed from GPX track points
    And the route is shown on the map in view mode
    And the route name, distance, and point count are shown

  Scenario: Edit an imported GPX copy
    Given a GPX route has been imported
    When the user presses "Edit route"
    Then the app creates an editable copy
    And edits do not mutate the original imported file
    And the user can drag, insert, delete, draw, or undo route points

  Scenario: Load a bundled mobile route for editing
    Given the local map data service is running
    And the Android mobile workspace contains bundled routes
    When the user refreshes the Mobile routes list
    Then the web app lists routes from mobile/app/src/main/assets/routes/routes.json
    And the user can filter the list by route name or route metadata
    And the filtered routes are visible as a compact selectable list in the sidebar
    And every filtered route remains reachable from the visible list
    And ArrowUp and ArrowDown move selection through the filtered route list
    And pressing Enter in the filtered route search loads the selected route
    When the user chooses a route and presses "Load route"
    Then the web app loads that route GPX in view mode
    And the route save state shows the loaded route is saved to mobile
    And the loaded route is visibly marked in the mobile route list
    And pressing "Edit route" creates an editable copy before changes are made
    And route geometry or name edits mark the route as having unsaved mobile edits
    And loading another route, importing GPX, resetting, or clearing asks for confirmation before discarding unsaved route changes
    And cancelling a route load keeps the picker selected on the currently loaded route
    And saving to mobile preserves the loaded mobile route id when writing the edited route back into the Android workspace
    And the save-to-mobile button stays disabled and shows progress while route and map data are being written
    And a newly saved route is immediately visible as the loaded route in the mobile route list
    And a successful mobile save clears the unsaved edit state

  Scenario: Reject a broken GPX file
    Given the user has selected a broken GPX file
    When the app cannot parse usable track points
    Then the app shows a simple browser alert
    And the current route remains unchanged
```

## Map Data

Code starting points:

- Web dataset loading and detail overlays: `web/src/app.js` `refreshStoredDetailMaps`, `addDetailMap`, `ensureDetailMapLayers`
- Web rectangle selection/download: `web/src/app.js` `toggleAreaSelectMode`, `finishAreaDraw`, `downloadSelectedAreaMap`
- Web route save-to-mobile action: `web/src/app.js` `saveRouteToMobileApp`
- Local service API endpoints: `mapdataservice/server.mjs` `listDatasets`, `extractBbox`, `saveMobileRoute`
- Base PMTiles extraction CLI: `mapdataservice/extract-route-map.mjs`
- Finnish provider overlay builder: `mapdataservice/build-finnish-map.mjs`
- Shared MapLibre style contract: `shared/styles/style_template.json`
- Android map/style loading: `mobile/app/src/main/java/com/example/traillite/TrailStorage.kt` and `TrailMapController.kt`

```gherkin
Feature: Web map data management
  TrailLite GPX Builder renders broad map context and can download local detail data for selected areas.

  Scenario: Render full planning map context
    Given the web app is open
    When the map loads
    Then the full map viewport is drawn with broad Finland map context
    And the mobile bundled PMTiles package is loaded as a local detail overlay
    And every stored map data service dataset is loaded as an additional detail overlay

  Scenario: Download detail data for a rectangle
    Given the local map data service is running
    When the user presses "Draw area"
    And drags a rectangle on the map
    Then the selected bbox is shown temporarily
    And "Download area map" becomes enabled
    When the user presses "Download area map"
    Then the service extracts a base PMTiles package for the bbox
    And the service extracts a Finnish provider overlay for the same bbox
    And the web app loads both outputs as detail overlays
    And the temporary rectangle is cleared after a successful download

  Scenario: Reuse previously downloaded map data
    Given map data packages already exist under mapdataservice/output
    When the web app starts
    Then it lists stored datasets from the local service
    And it loads those datasets as map overlays without downloading them again
```

```gherkin
Feature: Save web-created routes into the mobile workspace
  TrailLite GPX Builder can write a route and its corridor map data into the Android project for local builds.

  Scenario: Save route and corridor data to mobile
    Given the user has a named route with at least two points
    And the local map data service is running
    When the user presses "Save to mobile"
    Then the service writes the GPX under mobile/app/src/main/assets/routes
    And the service updates the bundled route catalog
    And the service extracts corridor map data for the route
    And the service writes the Android bundled PMTiles packages under shared/maps
    And the web route manager immediately reflects the saved mobile route
    And the next Android build can include the route and required offline map data
```

```gherkin
Feature: Download reusable web planning detail
  The web app can download a selected map rectangle for future planning sessions.

  Scenario: Store a downloaded rectangle
    Given the web app is running
    And the local map data service is running on localhost
    When the user draws a rectangle on the web map
    And presses "Download area map"
    Then the web app sends the bbox to POST /api/extract-bbox
    And the service writes generated PMTiles packages under mapdataservice/output
    And the service reuses cached output when the same bbox/data request is repeated
    And the web app lists stored datasets through GET /api/datasets on later startups
    And the web app renders all stored Finnish provider overlays it knows about
```

```gherkin
Feature: Save a route with mobile map data
  The web app can save a route and its required offline corridor data into the Android project.

  Scenario: Save a route for the next Android build
    Given the user has drawn or imported a valid route in the web app
    And the local map data service is running on localhost
    When the user presses "Save to mobile"
    Then the web app sends the route name and GPX text to POST /api/save-mobile-route
    And the service writes the GPX under mobile/app/src/main/assets/routes
    And the service updates mobile/app/src/main/assets/routes/routes.json
    And the service extracts a route-corridor base PMTiles package
    And the service builds a Finnish provider overlay for the same corridor
    And the service copies the mobile bundle outputs to shared/maps/finland.pmtiles and shared/maps/finland.providers.pmtiles
    And the next Android build bundles those shared maps as offline app assets
```

```gherkin
Feature: Use Finnish provider enrichment
  The map data service can enrich route corridors and rectangles with Finnish source data.

  Scenario: Build provider overlay with available credentials
    Given the service needs Finnish provider detail for a bbox or route corridor
    When Digiroad is enabled
    Then the service downloads road/path data without authentication
    When NLS is enabled
    Then the service reads NLS_API_KEY from the workspace root .env, the process environment, or the request/CLI option
    And the service downloads NLS topographic data for the requested area
    And the service normalizes provider data into TrailLite-compatible roads and buildings layers
    And the generated provider PMTiles overlay can be rendered by web and mobile over the base PMTiles map
```
