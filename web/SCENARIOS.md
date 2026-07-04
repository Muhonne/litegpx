# TrailLite GPX Builder Scenarios

These scenarios describe the desktop web app that creates and edits GPX routes for the TrailLite Android app.

## Current Flows

Feature: Create a route from an empty map

Scenario: Draw a blank route
  Given I have opened the GPX Builder
  And no route points exist
  When I press "Draw route"
  Then the app enters edit mode
  And I can draw route points on the map by dragging the mouse
  And the app stores the route as GPX track points in browser memory
  And I can finish editing with "Done editing"

Scenario: Reset the current route
  Given I have route points on the map
  When I press "Reset route" or "Clear"
  Then the route points are removed
  And the route name returns to "Untitled route"

Feature: Import and edit GPX

Scenario: Import a GPX file for viewing
  Given I have a GPX file
  When I import the file
  Then the route is shown on the map in view mode
  And the route name, distance, and point count are shown in the sidebar

Scenario: Edit an imported route copy
  Given I imported a GPX file
  When I press "Edit route"
  Then the app creates an editable copy
  And the imported source is not modified directly

Feature: Save GPX

Scenario: Save an exportable route
  Given I have a route with at least two points
  And the route has a name
  When I press "Save route"
  Then the browser downloads a GPX file using the route name as the filename
  And the GPX uses the format expected by TrailLite Android
  And the route is not saved into the repository or a server-side project file

Scenario: Save a route into the mobile app workspace
  Given I have a route with at least two points
  And the route has a name
  And the local map data service is running
  When I press "Save to mobile app"
  Then the service writes the GPX under mobile/app/src/main/assets/routes
  And the service updates mobile/app/src/main/assets/routes/routes.json
  And the service extracts a 1000 m corridor PMTiles package for the route
  And the service copies that PMTiles package to shared/maps/finland.pmtiles for Android bundling

## UX Review

- "New route" and "Start route" are confusing together. One clears state and one enters drawing mode, but both sound like ways to begin a route.
- The primary empty-state action should be "Draw route". It starts route creation and does not imply data loss.
- "New route" should not be shown before a route exists. Once a route exists, the destructive action should be named "Reset route".
- Route editing controls should be contextual. In edit mode, show finish, undo, clear, and save. In view mode, show draw or edit, import, reset when relevant, and save when relevant.
- Map data details should stay informational in this app. Rectangle drawing competes with route drawing and should not be part of the main GPX creation surface.
- Keyboard shortcuts should describe the current mode: route shortcuts in view mode and edit shortcuts in edit mode.

## Revised Flows

Feature: Draw a new route

Scenario: Begin a blank route
  Given I have no route loaded
  When I press "Draw route"
  Then the app enters edit mode
  And the sidebar shows edit controls
  And the map accepts drag drawing for route points
  And shift-drag pans the map

Scenario: Finish route editing
  Given I am editing a route
  When I press "Done editing"
  Then the app returns to view mode
  And the sidebar shows route-level controls
  And "Save route" is visible if the route can be exported

Feature: Work with an existing route

Scenario: Edit an existing route
  Given I have a route on the map
  When I press "Edit route"
  Then the app enters edit mode
  And I can drag points, draw more points, delete points, undo edits, or clear the route

Scenario: Reset an existing route
  Given I have a route on the map
  When I press "Reset route"
  Then the route is removed
  And the app returns to a blank view state
  And the primary route action becomes "Draw route"

Feature: Save a route

Scenario: Save from view or edit mode
  Given I have at least two route points
  And the route has a name
  When I press "Save route"
  Then the browser downloads a GPX file
  And I remain in the current mode
  And I choose the final file location through the browser's normal download behavior

Scenario: Install into the local mobile app
  Given I have at least two route points
  And the route has a name
  And the local map data service is running
  When I press "Save to mobile app"
  Then the route appears in the bundled mobile route catalog
  And the bundled Android map asset is replaced by the generated route corridor map package
  And I remain in the current mode

Feature: Import a GPX route

Scenario: View an imported route before editing
  Given I import a valid GPX file
  Then the route is shown in view mode
  And the primary route action is "Edit route"
  And editing creates a copy for changes

Scenario: Reject a broken GPX file
  Given I import a broken GPX file
  Then the app shows a simple alert
  And the current route remains unchanged

Feature: Use available map data

Scenario: View stored map data status
  Given the app has base and detail map datasets available
  Then the sidebar shows the total map data size
  And the map uses every stored dataset when rendering visible map detail
