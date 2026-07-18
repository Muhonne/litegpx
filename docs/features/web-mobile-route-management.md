# Web Mobile Route Management

## Description

The web route manager reads the Android workspace route catalog through the local data service, lets the user search and sort saved mobile routes, and loads or deletes selected routes.

## Code

- `web/src/app.js` owns mobile route fetches, load/delete requests, dirty-state prompts, and DOM rendering.
- `web/src/features/mobile-routes.js` owns catalog filtering, sorting, labels, metadata text, and stale-refresh preservation.
- `web/src/lib/gpx.js` parses loaded route GPX payloads.
- `mapdataservice/server.mjs` serves the mobile route catalog and route load/delete API.
- `mobile/app/src/main/assets/routes/routes.json` is the bundled Android route catalog.
- `web/tests/manual/11-mobile-route-management.sh` covers filtering, sorting, loading, dirty state, saving, refresh preservation, and deletion.

## Verification

- Start `node mapdataservice/server.mjs`.
- Run `bash web/tests/manual/11-mobile-route-management.sh`.

## Scenario

```gherkin
Feature: Web mobile route management
  Scenario: Load and manage a bundled mobile route
    Given the local map data service is running
    And the Android workspace has routes in its bundled catalog
    When the user filters, sorts, and selects a mobile route
    Then the selected route can be loaded into the web map
    And loaded or unsaved route state is reflected in the route list
    And the user can delete a selected mobile route after confirmation
```
