# Web Mobile Workspace Save

## Description

The web app can write a drawn or imported route into the Android workspace, update the bundled route catalog, and trigger route-corridor map package generation for the next mobile build.

## Code

- `web/src/app.js` sends named route GPX to the save-to-mobile API and updates the visible mobile route list after success.
- `web/src/lib/gpx.js` serializes the current route as GPX.
- `mapdataservice/server.mjs` implements the save-to-mobile endpoint and route catalog update.
- `mapdataservice/extract-route-map.mjs` extracts route-corridor PMTiles packages.
- `mobile/app/src/main/assets/routes/routes.json` is updated with saved route metadata.
- `shared/maps` receives local map packages used by development builds.
- `web/tests/manual/10-mobile-save-button.sh` covers save payloads, busy state, catalog refresh, and stale refresh handling.

## Verification

- Start `node mapdataservice/server.mjs`.
- Run `bash web/tests/manual/10-mobile-save-button.sh`.
- Inspect generated Android route assets before committing route-data changes.

## Scenario

```gherkin
Feature: Save web-created routes into the mobile workspace
  Scenario: Save a route and corridor map data
    Given the user has a named route with at least two points
    And the local map data service is running
    When the user presses "Save to mobile app"
    Then the service writes GPX under the Android route assets
    And the bundled route catalog is updated
    And route-corridor map packages are generated for mobile offline use
    And the web route manager shows the saved route as loaded and clean
```
