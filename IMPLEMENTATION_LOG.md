# TrailLite GPX Builder Implementation Log

This log records the milestone implementation pass for the desktop GPX web app and the Android data compatibility work.

## Current Status

- Web app: implemented under `web/` as static HTML, CSS, and plain JavaScript ES modules.
- Shared assets: map, styles, and glyphs are under `shared/`.
- Android app: consumes shared map/style/glyph assets through the Android asset source set.
- Map tools: web exposes the same TrailLite mobile layer toggles and a local place search.
- Manual browser scripts: implemented under `web/tests/manual/` and runnable with `npm test` from `web/`.
- Result: all planned skeleton, polish, map-tools, and usability improvement sprints are complete.

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

## Sprint 11: Improvement Sprint 1 - Shortcut Discovery

Plan:
- Make keyboard shortcuts visible in the app instead of requiring memory or documentation lookup.
- Keep the shortcut surface compact so it does not compete with route controls.

Product round:
- Shortcuts are part of daily use, so they belong in the left sidebar where the user is already working.
- Added shortcuts for route editing, finish/cancel, undo, map-area selection, search, GPX download, and Shift-pan.

Design round:
- Added a compact `Shortcuts` block below map data.
- Added small shortcut badges on primary buttons where the shortcut triggers the same action.
- Kept the shortcut copy terse: key on the left, action on the right.

Development round:
- Added keyboard handling for `E`, `Esc`, `Ctrl+Z`/`Cmd+Z`, `A`, `F`, and `D`.
- Guarded shortcuts while typing in inputs, except `Esc`.
- Added `07-polish-controls-shortcuts-data.sh` coverage for visible shortcut labels and key behavior.

Review:
- Closed after static syntax checks and browser tests covered shortcut visibility and behavior.

## Sprint 12: Improvement Sprint 2 - Cursor And Mode Feedback

Plan:
- Make the mouse cursor reflect the current map interaction mode.
- Avoid ambiguity between viewing, route drawing, point dragging, and area selection.

Product round:
- Cursor feedback now reinforces whether a map click will pan, draw a route point, drag a point, or draw a map-data rectangle.
- Shift-pan remains available in edit mode and now has matching cursor feedback.

Design round:
- View mode uses a grab cursor.
- Route edit and area-select modes use a crosshair cursor.
- Point hover and point drag use grab/grabbing cursors.

Development round:
- Added a single cursor state function based on mode, area selection, Shift state, point hover, and point drag state.
- Updated map event handlers to refresh cursor state after mode changes, Escape cancel, point hover, point drag, and Shift key changes.
- Exposed cursor state through the test API for deterministic browser verification.

Review:
- Closed after manual browser tests verified edit and area modes report `crosshair`.

## Sprint 13: Improvement Sprint 3 - Left Sidebar Control Review

Plan:
- Make left-side controls easier to scan without changing the requested left-sidebar plus full-map layout.
- Keep the route workflow controls above route details and the scrollable point list.

Product round:
- Route actions are grouped first, route details second, map tools third, points last.
- Search, layers, map-area download, map data, and shortcuts are separated into clear compact groups.

Design round:
- Added small section titles for `Route actions`, `Map tools`, `Map data`, and `Shortcuts`.
- Added shortcut badges directly inside buttons instead of adding longer explanatory text.
- Preserved the utility style: plain buttons, checkboxes, compact stats, and no card-heavy layout.

Development round:
- Updated `web/index.html` sidebar hierarchy.
- Added CSS for section titles, shortcut badges, dataset stats, and compact keyboard rows.
- Kept the point list as the only scrollable region.

Review:
- Closed after the browser suite confirmed existing route, map-tool, and area-selection workflows still work.

## Sprint 14: Improvement Sprint 4 - Dataset Size Visibility

Plan:
- Show the full local map dataset size and selected detail map sizes in the app.
- Make it clear that selected detailed areas add to the base map rather than replacing it.

Product round:
- The sidebar now reports base PMTiles size, detail overlay size, total dataset size, and detail-area count.
- This directly supports deciding how much local map data has been loaded for use.

Design round:
- Added a compact four-cell `Map data` panel.
- Used short labels: `Base`, `Detail`, `Total`, and `Areas`.
- Dataset totals remain visible above the route details.

Development round:
- Added byte-range size checks against the local static server.
- Base dataset size loads from `shared/maps/finland.pmtiles`.
- Detail overlay sizes load when a selected rectangle PMTiles package is added.
- Kept the broad base map source always active and added detail packages as overlay sources.

Review:
- Closed after browser tests verified base dataset size loads and detail overlays do not replace the base map source.

## Sprint 15: Improvement Sprint 5 - Usability Verification Pass

Plan:
- Verify the app still works as a polished desktop GPX tool after shortcut, cursor, sidebar, and dataset changes.
- Extend manual coverage for the new UX requirements.

Product round:
- The app remains local-only and desktop-focused.
- GPX creation/editing remains the primary workflow; map-data rectangle download is supporting functionality.

Design round:
- The final sidebar remains dense and work-focused.
- The map remains the primary surface; no landing page or extra navigation was introduced.

Development round:
- Added `07-polish-controls-shortcuts-data.sh` to the manual suite.
- The test verifies dataset size loading, shortcut visibility, edit-mode keyboard entry, undo shortcut behavior, Escape exit/cancel behavior, search focus, and area-selection cursor state.
- Existing manual tests continue to cover map foundation, GPX rendering, GPX export, editing, Android GPX compatibility, map tools, and area overlays.

Review:
- Closed after `node --check web/src/app.js`, `npm run build`, and `npm test` passed.

## Sprint 16: Stored Detail Map Persistence

Plan:
- Make rectangle-downloaded map data survive page reloads and future app sessions.
- Ensure the map uses all locally stored PMTiles detail packages, not only the one loaded in current memory.

Product round:
- Downloaded detail rectangles are now treated as persistent local map data.
- The web app loads every stored package reported by the local map data service.
- Browser storage keeps recently used detail overlays available even before the service list responds.

Design round:
- The existing `Map data` totals remain the user-facing surface.
- Detail overlays are added silently to the full base map rather than changing the primary map interaction model.

Development round:
- Added `GET /api/datasets` to `mapdataservice/server.mjs`.
- The endpoint lists every `.pmtiles` in `mapdataservice/output/` with URL, byte size, cache key, bbox, and metadata path where available.
- The web app restores detail maps from `localStorage` and then merges in all service-listed datasets on startup.
- Downloaded rectangles are persisted back to `localStorage` after extraction and after size discovery.
- Updated `06-map-area-selection.sh` to verify detail overlay persistence after reload.

Review:
- Closed after `node --check`, service API verification, `npm run build`, and `npm test` passed.

## Sprint 17: Final UX Sprint 1 - Area Selection Lifecycle

Plan:
- Remove the drawn map rectangle after a successful detail-map download.
- Keep downloaded map data loaded and persistent, but stop showing stale selection geometry.

Product round:
- A rectangle is an input to a download action, not a lasting map annotation.
- After the data is downloaded, the selected area should be represented by stored map data and dataset totals.

Design round:
- The dashed rectangle disappears after download completion.
- The area control returns to its empty state with `No area selected.`

Development round:
- Added `finishAreaDownload()` as the single completion path for downloaded detail maps.
- The function adds the detail PMTiles overlay, clears area bounds, updates the selected-area GeoJSON source, and disables the area download button.
- Extended `06-map-area-selection.sh` to verify the rectangle and bbox text clear after completion.

Review:
- Closed after browser tests verified the rectangle lifecycle.

## Sprint 18: Final UX Sprint 2 - Route Action Simplification

Plan:
- Stop showing every route action all the time.
- Keep only currently relevant controls visible.

Product round:
- Route actions now prioritize the next likely action: new route, start/edit, and import.
- Done/undo/clear/download appear only when the route state makes them useful.

Design round:
- Disabled secondary controls no longer consume the initial sidebar layout.
- Shortcut badges remain on action buttons that are visible.

Development round:
- `renderSidebar()` now toggles `hidden` for done, undo, clear, and GPX download.
- Added shared `[hidden]` CSS so hidden controls collapse fully.
- Added manual test coverage that verifies secondary actions are hidden by default.

Review:
- Closed after route editing tests still passed with mode-specific controls.

## Sprint 19: Final UX Sprint 3 - Compact Map Data Summary

Plan:
- Keep full dataset size visible while reducing sidebar height.
- Avoid the four-box data grid that made the sidebar feel crowded.

Product round:
- The most important value is total local map data size.
- Base/detail/area count remain visible as supporting context.

Design round:
- Replaced the four stat boxes with one strong total line and a smaller breakdown line.
- Kept the Map data section above shortcuts and route point list.

Development round:
- Updated `web/index.html` map-data markup.
- Replaced `.dataset-grid` CSS with compact `.dataset-total` and `.dataset-breakdown` styles.
- Existing dataset size IDs remain in place for tests and accessibility.

Review:
- Closed after dataset-size tests still passed.

## Sprint 20: Final UX Sprint 4 - Shortcut Disclosure

Plan:
- Keep shortcuts discoverable without permanently showing the whole shortcut table.
- Preserve keyboard shortcut functionality.

Product round:
- Shortcuts are now available on demand from a collapsed section.
- Primary button shortcut badges remain visible where they help immediate action.

Design round:
- Replaced the always-open shortcut block with a collapsed `details` panel.
- The sidebar is calmer by default while still answering "what are the shortcuts?"

Development round:
- Converted the shortcut section to `<details class="shortcut-panel">`.
- Updated shortcut tests to open the panel before verifying all shortcut labels.
- Kept all existing keyboard handlers unchanged.

Review:
- Closed after shortcut visibility and behavior tests passed.

## Sprint 21: Final UX Sprint 5 - Final Sidebar Density Pass

Plan:
- Verify the left sidebar no longer feels overcrowded with every action visible.
- Preserve the desktop workflow: route controls, route details, map tools, data summary, optional shortcuts, points.

Product round:
- The sidebar now exposes the current workflow instead of the full command set.
- Downloaded map data remains represented through totals and automatic overlays.

Design round:
- Route actions are shorter by default.
- Map data is compact.
- Shortcuts are collapsed.
- Points remain the only scrolling area.

Development round:
- Updated manual tests for simplified controls, collapsed shortcuts, and rectangle clearing.
- Kept existing tests for GPX creation/editing, Android GPX compatibility, map tools, and persistent detail-map overlays.

Review:
- Closed after build, full browser suite, clean console/errors, and screenshot review.

## Sprint 22: Route Freehand Drawing

Plan:
- Make route creation less tedious than click-per-point.
- Preserve precise point editing, undo, and Shift-pan behavior.

Product round:
- Edit mode now supports press-and-drag route drawing.
- A normal click still adds one point.
- A drawn stroke is one undoable edit, so rough freehand drawing can be corrected quickly.

Design round:
- No new always-visible toolbar was added.
- The collapsed shortcuts panel now includes `Drag` for route drawing.
- Edit-mode status text explains that dragging draws and clicking adds a single point.

Development round:
- Added freehand draw state and a 12 m minimum point spacing.
- Added `beginRouteDraw`, `appendDrawPoint`, and `finishRouteDraw`.
- Mouse down/move/up in edit mode now draws continuously unless Shift-pan, point dragging, or area selection is active.
- Extended `03-basic-editing.sh` to verify drawn segments add multiple points and undo as one operation.

Review:
- Closed after syntax, build, and browser manual suite passed.

## Sprint 23: UX Sprint - Route Drawing Visual Cleanup

Plan:
- Stop freehand routes from visually reading as filled areas.
- Keep precise edit points available without rendering thousands of point handles.

Product round:
- Freehand route data remains a route line with route points, not an area.
- Large freehand routes preserve all GPX points internally but display a sampled set of handles.

Design round:
- Edit route lines are thinner than view route lines.
- Edit point handles are smaller and less visually dominant.
- Dense freehand paths no longer become a solid blue mass.

Development round:
- Increased freehand point spacing to 25 m.
- Added `MAX_VISIBLE_ROUTE_POINTS` sampling for the route point layer.
- Reduced edit line and casing widths and point handle radius/stroke.

Review:
- Closed after browser tests verified click creation and freehand drawing still work.

## Sprint 24: UX Sprint - Explicit Save Route Action

Plan:
- Make the export action obvious as the route save action.

Product round:
- Renamed the primary GPX export action from `Download GPX` to `Save route`.
- The saved artifact remains a GPX file for TrailLite Android compatibility.

Design round:
- Save route remains a primary route action and uses the existing `D` shortcut badge.
- Status now says `Route saved as GPX.`

Development round:
- Updated the export button label and shortcut copy.
- Kept the existing GPX export function and Android GPX contract unchanged.

Review:
- Closed after existing GPX export and Android compatibility tests passed.

## Sprint 25: UX Sprint - Context-Aware Edit Panel

Plan:
- Make the sidebar show controls and shortcuts relevant to the current mode.

Product round:
- View mode shows route-start/import actions.
- Edit mode hides view/import actions and shows edit actions: done, undo, clear, and save when possible.
- Shortcut rows are filtered to the current context: route, edit, or map-area selection.

Design round:
- The panel avoids disabled clutter while editing.
- Shortcut disclosure remains compact but now opens to the relevant shortcut set.

Development round:
- Added `shortcutSummary` and `data-shortcut-context` rows.
- `renderSidebar()` now hides route action controls based on current mode.
- `renderShortcutContext()` filters shortcut rows for route/edit/area contexts.
- Updated manual tests to assert context-specific controls and shortcuts.

Review:
- Closed after syntax, build, and the full browser suite passed.

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
