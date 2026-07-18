# Data Service Route Corridor Generation

## Description

The data service builds route corridor data for offline mobile use. Saving a web route writes GPX/catalog data, extracts a buffered corridor base map, builds a matching Finnish provider overlay, and refreshes the shared map manifest for the next Android build.

The default `mapScope` is all bundled routes so one saved route does not shrink existing offline coverage. `mapScope: "route"` intentionally builds only the saved route corridor.

## Code

- `mapdataservice/server.mjs` handles `POST /api/save-mobile-route`, selects `mapScope`, copies generated map files, and writes the bundled manifest.
- `mapdataservice/extract-route-map.mjs` builds base PMTiles route corridors from GPX files or a route directory.
- `mapdataservice/build-finnish-map.mjs` builds provider overlay PMTiles for the same route corridor.
- `mapdataservice/tests/bundled-map-manifest.test.mjs` covers bundled map manifest metadata.
- `web/src/app.js` sends save-to-mobile requests with corridor coverage.
- `mobile/app/src/main/java/com/example/traillite/TrailStorage.kt` copies bundled map files according to the manifest.

Generated artifacts are `mapdataservice/output/*.pmtiles`, `shared/maps/finland.pmtiles`, `shared/maps/finland.providers.pmtiles`, and `shared/maps/manifest.json`.

## Verification

- Run service unit checks with `cd mapdataservice && npm test`.
- Run `bash web/tests/manual/10-mobile-save-button.sh` with `node mapdataservice/server.mjs` running for the web save flow.
- Inspect `shared/maps/manifest.json` after save-to-mobile map generation.

## Scenario

```gherkin
Feature: Data service route corridor generation
  Scenario: Save a route and refresh offline map coverage
    Given the web app has a named route with at least two points
    And the local data service is running
    When the user saves the route to the mobile workspace
    Then the service writes the GPX and route catalog entry
    And it generates route corridor base and provider PMTiles
    And it updates the shared map manifest consumed by Android
```
