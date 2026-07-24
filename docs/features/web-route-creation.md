# Web Route Creation

## Description

The web app lets the user draw a GPX route on desktop, refine the points, inspect distance, estimated cycling calories, and point count, and export a mobile-compatible GPX file.

## Code

- `web/src/app.js` owns edit mode, pointer events, undo/redo, route saving state, and sidebar rendering.
- `web/src/features/route-layers.js` creates the MapLibre route layers and route GeoJSON source data.
- `web/src/lib/geo.js` provides distance, snapping, bbox, and point-copy helpers.
- `web/src/lib/format.js` formats route distance and ballpark cycling calorie estimates.
- `web/src/lib/gpx.js` exports GPX 1.1 track files.
- `web/tests/manual/02-gpx-creation-export.sh` covers drawing and browser GPX export.
- `web/tests/manual/09-route-draw-mouseup.sh` covers drag-to-draw, pan override, and point deletion shortcuts.

## Verification

- Run `bash web/tests/manual/02-gpx-creation-export.sh`.
- Run `bash web/tests/manual/09-route-draw-mouseup.sh`.
- Run `bash web/tests/manual/14-route-calorie-estimate.sh`.
- Run `npm run test:unit` from `web/` for doc/module structure checks.

## Scenario

```gherkin
Feature: Web GPX route creation
  Scenario: Draw and export a new route
    Given the web app is open with no route loaded
    When the user presses "Draw route"
    And drags across the map to add points
    Then the route is shown in edit mode with updated distance, calorie estimate, and point count
    When the user finishes editing and presses "Save route"
    Then the browser downloads a GPX file with route points in route order
```
