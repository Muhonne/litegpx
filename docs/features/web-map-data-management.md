# Web Map Data Management

## Description

The web app loads broad planning map context, overlays available local detail PMTiles packages, and lets users toggle map layer groups used for planning and snapping.

## Code

- `web/src/app.js` discovers datasets, adds detail maps, applies layer toggles, and updates dataset statistics.
- `web/src/features/map-style.js` owns base style loading, detail overlay classification, provider overlay paint overrides, and layer group definitions.
- `shared/styles/style_template.json` is the MapLibre style contract shared by the web map.
- `mapdataservice/server.mjs` exposes stored dataset metadata through the local API.
- `web/tests/manual/05-map-tools.sh` covers layer toggles and area-selection UI.
- `web/tests/manual/07-polish-controls-shortcuts-data.sh` covers map controls, shortcuts, and dataset stats.

## Scenario

```gherkin
Feature: Web map data management
  Scenario: Render planning map with local detail overlays
    Given the web app is open
    When the map loads
    Then broad map context is drawn from the configured PMTiles source
    And local shared and stored detail datasets are added as overlays
    And layer toggles show or hide street names, POIs, buildings, paths, and tracks
```
