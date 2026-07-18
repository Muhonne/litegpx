# Web Planning Detail Download

## Description

The web app lets the user draw a map rectangle and ask the local data service to generate reusable PMTiles detail packages for future planning sessions.

## Code

- `web/src/app.js` handles rectangle drawing, download requests, temporary area overlay state, and loading returned datasets.
- `web/src/features/map-style.js` classifies returned base extracts and Finnish provider overlays for rendering.
- `mapdataservice/server.mjs` handles `POST /api/extract-bbox` and dataset listing.
- `mapdataservice/extract-route-map.mjs` runs the PMTiles extraction workflow used by bbox downloads.
- `mapdataservice/build-finnish-map.mjs` builds Finnish provider overlays when provider data is enabled.
- `web/tests/manual/05-map-tools.sh` covers rectangle selection and download busy state.

## Scenario

```gherkin
Feature: Download reusable web planning detail
  Scenario: Store a downloaded rectangle
    Given the web app and local map data service are running
    When the user draws a rectangle and presses "Download area map"
    Then the web app sends the bbox to the data service
    And the service writes generated PMTiles packages under mapdataservice/output
    And repeated matching requests can reuse cached output
    And later web sessions list and render the stored provider overlays
```
