# TrailLite GPX Builder Implementation Log

This log records the milestone implementation pass for the desktop GPX web app and the Android data compatibility work.

## Current Status

- Web app: implemented under `web/` as static HTML, CSS, and plain JavaScript ES modules.
- Shared assets: map, styles, and glyphs are under `shared/`.
- Android app: consumes shared map/style/glyph assets through the Android asset source set.
- Map tools: web exposes the same TrailLite mobile layer toggles and a local place search.
- Manual browser scripts: implemented under `web/tests/manual/` and runnable with `npm test` from `web/`.
- Result: all planned skeleton, polish, and map-tools enhancement sprints are complete.

## Sprint 0: Shared Assets And Map Foundation

Plan:
- Create shared workspace asset directories.
- Move map, style, and glyph assets out of Android-only ownership.
- Build the first desktop web map view.
- Keep the app static and simple.

PM notes:
- Completed the workspace split without changing the offline Android product assumption.
- Kept scope to a static local web app and shared map ownership.

Designer notes:
- Established the desktop-only layout: fixed left sidebar and full map.
- Controls, route name, stats, and export remain visible above the scrollable point list.

Lead dev notes:
- Added `shared/maps/`, `shared/styles/`, and `shared/glyphs/`.
- Updated Android to load `styles/style_template.json` and `styles/style_empty.json` from shared assets.
- Added a Node static server with byte-range support because PMTiles cannot be served correctly by a naive static server.

Review:
- Reopened because the first static serving approach did not satisfy PMTiles range requests.
- Closed after `web/scripts/serve.mjs` handled byte ranges and the map rendered in `agent-browser`.

## Sprint 1: GPX Rendering

Plan:
- Import GPX.
- Render imported track geometry on the map.
- Keep imported routes view-only until editing starts.

PM notes:
- Existing GPX files can be imported for viewing.
- Broken imports preserve the existing route state and use the required alert text.

Designer notes:
- View mode uses coral route color.
- Imported route metadata appears in the sidebar with distance and point count.

Lead dev notes:
- Implemented GPX parsing from `<trkpt>` nodes.
- Flattened track points into the internal route point array.
- Added route fitting after successful import.

Review:
- Closed after `01-gpx-rendering.sh` verified import, route stats, view mode, broken GPX alert text, and route preservation after failed import.

## Sprint 2: GPX Creation

Plan:
- Start a new route.
- Add points manually with mouse clicks.
- Export a clean GPX file.

PM notes:
- The web app now covers the main use case: manually creating a GPX route for TrailLite.

Designer notes:
- Creation starts from the visible sidebar controls.
- Map remains the primary work surface.

Lead dev notes:
- Implemented edit mode point creation from map clicks.
- Implemented route name editing, distance calculation, point count, and download.
- GPX export uses GPX 1.1 `<trk><trkseg><trkpt>` geometry only.

Review:
- Reopened once to make the manual test use actual map mouse clicks instead of only test API calls.
- Closed after `02-gpx-creation-export.sh` verified click creation and GPX output.

## Sprint 3: Basic Editing

Plan:
- Imported GPX remains view-only until editing starts.
- First edit creates a copy.
- Add, drag, insert, delete, undo, and clear route points.
- Shift-drag pans the map while editing.

PM notes:
- Editing now respects the import-copy rule.
- The point list stays mostly informational but has the minimal delete affordance needed for route edits.

Designer notes:
- Edit mode uses blue route styling and small point handles.
- Added a white route casing during polish so route colors stay readable over water and land.

Lead dev notes:
- Added point drag editing with undo snapshots.
- Added route-line click insertion.
- Added per-point delete controls in edit mode.
- Added undo for add, insert, delete, and drag operations.
- Disabled normal map panning in edit mode while preserving Shift-drag pan.

Review:
- Reopened because delete was not initially reachable from the UI.
- Closed after adding edit-only point-row delete controls and extending `03-basic-editing.sh`.

## Sprint 4: TrailLite Android GPX Compatibility Pass

Plan:
- Verify mobile compatibility as data/application compatibility, not responsive web work.
- Keep GPX output compatible with the Android TrailLite parser.
- Keep Android map assets aligned with shared workspace assets.

PM notes:
- Completed as its own sprint before polish work.
- Scope stayed on exported data and shared Android/web assets.

Designer notes:
- No mobile browser responsive design was introduced.
- Desktop UI decisions remain unchanged.

Lead dev notes:
- Android shared asset source set now includes `../../shared`.
- Android map/style asset references now use shared paths.
- Exported GPX avoids unsupported route-point-only formats.

Review:
- Reopened while selecting the clean Gradle asset source-set API.
- Closed after Android `assembleDebug` and `04-android-gpx-contract.sh` passed.

## Sprint 5: Polish Sprint 1 - Design Review

Plan:
- Review the skeleton as a desktop route-planning tool.
- Identify blocking, important, and polish issues.

PM notes:
- No blocking product gaps remained after Sprint 4.
- Important issue found: route readability needed improvement over map colors.

Designer notes:
- Sidebar hierarchy is acceptable: controls first, route details second, scrollable points last.
- The app reads as utilitarian and minimal, not a marketing page.

Lead dev notes:
- Verified layout with `agent-browser` screenshots.
- Confirmed only the point list scrolls.

Review:
- Closed with one follow-up assigned to Sprint 7: improve route line contrast.

## Sprint 6: Polish Sprint 2 - Functionality Review

Plan:
- Exercise import, invalid import, creation, edit-copy, insert, delete, undo, clear, export, and Android GPX contract.

PM notes:
- Covered the full local-only workflow from GPX import through edited export.

Designer notes:
- Controls remain visible throughout the workflows.
- Point list delete controls are intentionally small and edit-only.

Lead dev notes:
- Added broken GPX alert verification.
- Fixed `npm test` to run the manual browser suite.

Review:
- Closed after the full manual suite passed cleanly.

## Sprint 7: Polish Sprint 3 - Design Rework

Plan:
- Apply design fixes found in Sprint 5.

PM notes:
- Kept the rework limited to usability and readability.

Designer notes:
- Added route casing rather than changing the overall visual system.
- Preserved coral for view mode and blue for edit mode.

Lead dev notes:
- Added `route-line-casing` under the colored route layer.

Review:
- Closed after build and browser tests passed with the route casing.

## Sprint 8: Polish Sprint 4 - Functionality Fixes And Tweaks

Plan:
- Fix bugs found in import, route state, editing, undo, validation, and export.

PM notes:
- No new feature scope was added.

Designer notes:
- Kept the UI simple after adding the missing delete path.

Lead dev notes:
- Verified broken GPX does not replace the current route.
- Verified delete and undo behavior in the manual suite.
- Verified browser error and console logs are clean.

Review:
- Closed with no pending functionality blockers.

## Sprint 9: Polish Sprint 5 - Release Readiness

Plan:
- Confirm the app is ready for local use as a polished desktop web app.

PM notes:
- The app is ready for local use in the planned workflow.
- Dataset refinement remains future work, as previously decided.

Designer notes:
- Final layout matches the requested desktop pattern: left sidebar, full map, always-visible controls, scrollable points only.

Lead dev notes:
- `npm run build` passes.
- `npm test` passes.
- `agent-browser errors` reports no page errors.
- `agent-browser console` reports no console output after the test pass.
- Android `./gradlew assembleDebug` passes with shared assets.

Review:
- Closed. No sprint was skipped, and the TrailLite Android GPX Compatibility Pass was completed before polish.

## Sprint 10: Mobile-Matching Map Tools

Plan:
- Add the same map-layer controls used by TrailLite mobile.
- Add a simple search box to locate common places such as Helsinki.
- Preserve the desktop sidebar layout where only the point list scrolls.

PM notes:
- This closes the gap between the mobile map controls and the GPX builder map controls.
- Search stays local and simple; no network geocoder or account service was introduced.

Designer notes:
- Added a compact map tools block below the primary route controls.
- Controls use plain labels and checkboxes, matching the utility style of the app.
- Route controls, search, layer settings, route name, stats, and export remain visible above the point list.

Lead dev notes:
- Matched Android `MapLayerSettings`: Street names, POIs, Buildings, and Paths and tracks.
- Web layer IDs map to the shared style: `street-names`, `poi-dots`, `poi-names`, `buildings`, `paths-highlight`, and `roads-minor`.
- Added a small offline place index for southern Finland with Helsinki and common nearby cities.
- Added `05-map-tools.sh` to verify defaults, toggled layer visibility, Helsinki search, and missing-place status.

Review:
- Closed after `npm run build`, `npm test`, `agent-browser errors`, and `agent-browser console` all passed.
- Visual review confirmed the sidebar remains fixed and the point list remains the scrollable area.

## Verification Commands

Run from the workspace root unless noted:

```sh
cd web
npm run build
npm test
```

```sh
cd mobile
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
```

The local web server command is:

```sh
cd web
npm run serve
```

The served app URL is:

```text
http://localhost:5173/web/
```
