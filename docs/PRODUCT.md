# TrailLite Product Notes

TrailLite is a small offline route navigation workspace. The current product is the Android mobile app in `mobile/`. A companion web app is planned as a sibling project for generating GPX route files that can be opened in the mobile app.

Related documents:

- [USE_CASES.md](USE_CASES.md) for Gherkin-style product scenarios and user flows.
- [DATA.md](DATA.md) for map/route data layers, ownership, generated files, and service workflows.
- [../mapdataservice/README.md](../mapdataservice/README.md) for map data service commands and API details.

## Mobile App

The mobile app is a Kotlin and Jetpack Compose Android application for viewing GPX routes on an offline MapLibre map. It is designed to work without network access after install.

Code starting points:

- `mobile/app/src/main/java/com/example/traillite/MainActivity.kt`
- `mobile/app/src/main/java/com/example/traillite/TrailMapController.kt`
- `mobile/app/src/main/java/com/example/traillite/TrailStorage.kt`
- `mobile/app/src/main/AndroidManifest.xml`

Primary capabilities:

- View an offline Finland map from the shared bundled PMTiles package.
- Import a GPX file through Android's document picker.
- Open a GPX file shared from another Android app.
- Select one of the bundled Bikeland routes.
- Show the active route as a coral line overlay.
- Show the user's current GPS position as a blue dot.
- Show simple route navigation status while tracking location.

## Main Features

Code starting points:

- Offline map loading: `mobile/app/src/main/java/com/example/traillite/TrailStorage.kt` `ensureBundledMapPackage`, `writeLocalStyle`
- Map rendering and overlays: `mobile/app/src/main/java/com/example/traillite/TrailMapController.kt`
- GPX import/open flows: `mobile/app/src/main/java/com/example/traillite/MainActivity.kt`
- Route catalog loading: `mobile/app/src/main/java/com/example/traillite/BundledRoute.kt`
- Location tracking: `mobile/app/src/main/java/com/example/traillite/BatteryLocationClient.kt`
- Settings: `mobile/app/src/main/java/com/example/traillite/MapLayerSettings.kt`
- Settings UI and screen brightness application: `mobile/app/src/main/java/com/example/traillite/MainActivity.kt` `MapSettingsDialog`, `applyDisplaySettings`
- Tracking camera zoom behavior: `mobile/app/src/main/java/com/example/traillite/TrailMapController.kt` `updateNavigationCamera`

### Offline maps

- The app has no Internet permission.
- The bundled map package is `shared/maps/finland.pmtiles`, included in the Android APK through the app asset source set.
- Imported `.pmtiles` or `.mbtiles` files are copied into app-specific storage.
- The latest imported map package is preferred over the bundled map.
- Map style JSON is generated locally from `shared/styles/style_template.json`.

### GPX route import

- GPX files are imported through Android's Storage Access Framework.
- Imported files are copied into app-specific storage before parsing.
- GPX files can also be opened through Android `ACTION_VIEW` intents when provided as GPX MIME types or `.gpx` `file:`/`content:` URIs.
- The app displays the imported file name as the track name.

### Bundled routes

- Bundled routes live under `mobile/app/src/main/assets/routes/`.
- The bundled route catalog is `routes/routes.json`.
- Each catalog entry points to a local GPX asset.
- Bundled route metadata is used for the route picker, but imported GPX metadata is not currently read.

### Navigation readout

When GPS tracking is active and a route is loaded, the app calculates:

- Distance from current location to the nearest point on the route.
- Whether the user is off route.
- Progress percentage along the route.
- Remaining route distance.

The current off-route threshold is 75 meters.

### Riding display settings

- The user can keep the screen awake while TrailLite is open.
- The user can enable an app-specific brightness override and choose the brightness percentage used by the Activity window.
- The user can enable automatic tracking zoom and choose the zoom level applied while GPS tracking is active with a selected route.
- When automatic tracking zoom is disabled, tracking keeps the current map zoom so manual zoom remains under user control.

## Data Formats

Use cases are maintained in [USE_CASES.md](USE_CASES.md). Map and route data ownership is maintained in [DATA.md](DATA.md).

Code starting points:

- Mobile GPX parsing: `mobile/app/src/main/java/com/example/traillite/GpxParser.kt`
- Web GPX parsing/export: `web/src/app.js` `parseGpx`, `exportGpx`
- Bundled route catalog model: `mobile/app/src/main/java/com/example/traillite/BundledRoute.kt`
- Save-to-mobile catalog writing: `mapdataservice/server.mjs` `buildRouteCatalogEntry`, `upsertRouteCatalog`
- Map style source-layer contract: `shared/styles/style_template.json`

### Imported GPX

The mobile app currently parses only GPX track points:

```xml
<trkpt lat="60.169900" lon="24.938400">
  <ele>12.3</ele>
</trkpt>
```

Required behavior for generated GPX:

- Use GPX 1.1 XML.
- Use WGS84 decimal degrees.
- Put route geometry in `<trk><trkseg><trkpt lat="..." lon="..." /></trkseg></trk>`.
- Include at least two valid track points.
- Keep latitude in `-90..90`.
- Keep longitude in `-180..180`.
- Use a `.gpx` filename.

Safe optional fields:

- `<metadata><name>...</name></metadata>`
- `<trk><name>...</name></trk>`
- `<ele>...</ele>` inside track points
- `<time>...</time>` inside metadata or track points

Ignored by the current mobile app:

- GPX metadata and route names for imported files.
- Elevation.
- Timestamps.
- Waypoints (`<wpt>`).
- Route points (`<rtept>`).
- GPX extensions.

The web app should export a simple track-first GPX file, not a route-only GPX file. A GPX file containing only `<rte>` and `<rtept>` elements will import with zero usable route points.

Recommended minimal export:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailLite Web" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Example Route</name>
  </metadata>
  <trk>
    <name>Example Route</name>
    <trkseg>
      <trkpt lat="60.169900" lon="24.938400" />
      <trkpt lat="60.170500" lon="24.939200" />
    </trkseg>
  </trk>
</gpx>
```

### Bundled Route Catalog

Bundled route metadata is stored as JSON in `mobile/app/src/main/assets/routes/routes.json`.

Each catalog item uses this shape:

```json
{
  "id": "route-slug",
  "title": "Route title",
  "lengthKm": 57,
  "durationText": "2 - 5 tuntia",
  "source": "Bikeland",
  "matchScore": 1.0,
  "bikelandId": 11852,
  "matchedTitle": "Matched source title",
  "detailUrl": "https://www.bikeland.fi/example/",
  "gpxDownloadUrl": "https://www.bikeland.fi/wp-admin/admin-ajax.php?action=loadGPXFile&id=11852&lang=fi",
  "gpxAsset": "routes/example.gpx",
  "bounds": {
    "minLon": 25.85,
    "minLat": 61.57,
    "maxLon": 26.02,
    "maxLat": 61.75
  },
  "trackPointCount": 427
}
```

The mobile route picker currently reads:

- `id`
- `title`
- `lengthKm`
- `durationText`
- `gpxAsset`
- `bikelandId`

Other fields are retained as catalog/source metadata.

### Offline Map Packages

Supported imported map package extensions:

- `.pmtiles`
- `.mbtiles`

Map packages are copied into app-specific storage under `TrailLite/maps/`.

### Local App Storage

Imported user files are copied to app-specific storage:

- `TrailLite/maps/` for `.pmtiles` and `.mbtiles`
- `TrailLite/tracks/` for `.gpx`

This avoids broad Android storage permissions.

## Web App Compatibility Target

The planned web app should generate downloadable GPX files that are immediately usable in the Android app.

Minimum compatibility requirements:

- Export `.gpx` files with `<trkpt>` geometry.
- Preserve point order exactly as the user builds the route.
- Avoid disconnected multi-segment routes unless the jump is intentional.
- Use a meaningful filename because the mobile app displays the filename for imported tracks.
- Keep generated files fully offline-compatible after download.

Future mobile enhancements that would improve web integration:

- Read imported GPX `<metadata><name>` or `<trk><name>` for display.
- Reject invalid imported GPX files before storing them.
- Support `<rtept>` as a fallback input format.
- Add `https` GPX intent handling if direct web-to-app opening becomes a product requirement.

## Web App Product Plan

Status: v1 product plan.

Code starting points:

- Web app shell: `web/index.html`
- Web app behavior: `web/src/app.js`
- Web app styling: `web/src/styles.css`
- Web local server/build scripts: `web/scripts/serve.mjs`, `web/scripts/build.mjs`
- Web manual checks: `web/tests/manual/`

### Product Role

The web app is the route creation companion for TrailLite mobile. Its job is to let a user create a route on a larger screen, export a mobile-compatible GPX file, and then use that file offline in the Android app.

The web app should not require changes to the mobile app for the first version. It should export GPX files that match the current mobile import contract.

V1 is a desktop-only tool. It relies on mouse input for accurate route drawing and does not need to support mobile browser editing.

### Target Users

Primary users:

- The first target user is the app owner/developer planning personal routes.
- The product should remain understandable and useful for general outdoor users.
- The first version should optimize for a simple personal workflow before broader publishing or community use.
- A user who wants a simple GPX file, not a full account-based route planning platform.
- A user who may transfer the GPX to Android through download, cloud storage, messaging, email, USB, or Android share/open flows.
- Route activity type is intentionally generic. The product creates a route line; the mobile app tracks user position against that route regardless of cycling, hiking, or other activity context.

### Core User Journey

MVP journey assumption:

1. User opens the web app.
2. User searches or pans to the route area.
3. User creates a route by placing points on a map.
4. User edits point order or removes mistakes.
5. User names the route.
6. User reviews route distance and point count.
7. User downloads a `.gpx` file.
8. User opens/imports that file in TrailLite mobile.

Secondary journey:

1. User opens an existing GPX file.
2. Web app parses the GPX track points.
3. User edits the imported route on the map.
4. User exports a new mobile-compatible `.gpx` file.

Decisions:

- V1 uses manual route drawing, not automatic routing along roads or paths.
- V1 must support importing and editing existing GPX files.
- Imported GPX should export as a clean, simplified TrailLite-compatible GPX file.
- Imported GPX opens for viewing first. When the user starts editing, the app creates an editable copy rather than treating the imported source as overwritten.

### MVP Feature Set

Candidate v1 features:

- Map-first route editor.
- Simple local map search for common southern Finland places, including Helsinki.
- Map layer settings matching TrailLite mobile: Street names, POIs, Buildings, and Paths and tracks.
- Add route point by clicking/tapping the map.
- Drag route points to adjust them.
- Delete route points.
- Insert a route point between two existing points.
- Undo the latest edit.
- Clear the route.
- Route name input.
- Live distance estimate using haversine distance over the editable route points.
- GPX 1.1 track export using `<trkpt>` points.
- Generated filename based on route name.
- Import an existing GPX for editing.
- Validate imported GPX and show import errors.
- Basic validation before download: at least two points, valid coordinates, non-empty filename.

Candidate v1 exclusions:

- Automatic road/path routing.
- Mobile browser route editing.
- User accounts.
- Cloud route storage.
- Social/public route discovery.
- Turn-by-turn instructions.
- Elevation profile.
- Offline web use.
- Direct web-to-mobile app handoff.
- Editing mobile bundled route catalog metadata.

Editing behavior:

- Undo applies to route point edits only.
- Undo does not need to cover route naming, GPX import, GPX export, or clear-route actions in v1.

### Routing And Map Data

Decisions:

- V1 uses manual route geometry. Automatic road/path routing is out of scope for the first version.
- The web app renders a broad Protomaps PMTiles source as the planning base so the full map viewport is always drawn.
- The web app also loads the same local PMTiles files used by mobile from `shared/maps/` as detail overlays.
- Stored map data service outputs are reused as additional detail overlays instead of being downloaded again.
- Mobile uses the bundled shared PMTiles files from `shared/maps/` for offline use.
- The map data service can create route-corridor extracts for mobile and bbox extracts for web planning.
- V1 is Finland-only, with the practical target area being southern Finland.

Option A: manual polyline editor

- User places points; GPX contains those points in order.
- Simple to build and reliable.
- Does not snap to roads, paths, or trails.
- Produces coarse GPX unless the user adds many points.

Deferred option: browser-side route drawing with densification

- User places control points; app interpolates extra points along straight segments.
- Still does not follow roads/paths.
- More compatible with navigation progress and map display, but can imply a false path across terrain.

Deferred option: routed path generation

- User places waypoints; app calls a routing engine and exports the returned path geometry.
- Better GPX quality.
- Requires routing data/service decisions and likely network access.
- Routing profile choice becomes product-critical.

### GPX Export Requirements

The web app must export GPX that the current mobile app can parse:

- GPX 1.1 XML.
- A single `<trk>` with one or more `<trkseg>` elements.
- `<trkpt lat="..." lon="...">` points in route order.
- At least two track points.
- Decimal coordinate precision of at least 6 digits.
- XML-escaped route names.
- `.gpx` file extension.

Recommended v1 export policy:

- Export a single continuous `<trkseg>` unless the product explicitly supports route breaks.
- Include `<metadata><name>` and `<trk><name>` even though mobile currently ignores imported metadata.
- Do not export `<rtept>` as the primary geometry.
- Do not depend on GPX extensions for core behavior.
- Export clean GPX rather than preserving imported metadata, extensions, elevation, or timestamps.

### GPX Import Requirements

V1 must import existing GPX files for editing.

Required import behavior:

- Parse GPX track points from `<trkpt lat="..." lon="...">`.
- Accept GPX files with one or more track segments.
- Flatten imported track points into one editable route.
- Ignore unsupported metadata safely.
- Show a clear error when no usable track points are found.
- Export imported routes as clean, simplified GPX.
- Import format breadth is an implementation detail. The product requirement is that exported GPX works correctly in the mobile app.

### Handoff To Mobile

Current compatible handoff paths:

- Download `.gpx` from the web app, then open/import it on Android.
- Share or copy the `.gpx` file to the Android device.
- Open the file in TrailLite through Android document picker or compatible `ACTION_VIEW`.
- Use the local "Save to mobile app" workflow during development to write the GPX, update the bundled route catalog, and generate corridor map data for the Android project.

Decision:

- A plain `.gpx` download button remains the portable user-facing handoff.
- The local workspace can additionally save a route and corridor map data directly into `mobile/app/src/main/assets/routes/` and `shared/maps/` for Android builds.
- Direct web-to-mobile app links are deferred unless they become a product requirement later.

### Success Criteria

Candidate first-release success criteria:

- A user can create a named route in the browser in under five minutes.
- A user can import an existing GPX, make a basic edit, and export a clean GPX.
- Exported GPX imports into TrailLite mobile without modification.
- The route line appears correctly on the mobile offline map.
- Mobile navigation readout works against the generated route.
- The user does not need an account.
- The route editor works well on desktop with mouse input.

Shortest useful route creation workflow:

1. Open the web app.
2. Draw or import a route.
3. Make basic point edits if needed.
4. Name the route.
5. Download a clean `.gpx` file.

Generated GPX quality threshold:

- Imports into the mobile app without modification.
- Draws as the intended route line on the same Finland map dataset.
- Contains enough points for the mobile app's route progress and off-route calculation to be useful.
- Avoids preserving source GPX complexity that is not needed by TrailLite mobile.

## Web App Technical Stack

Status: v1 stack decision.

### Stack Direction

V1 should stay as simple as the map/editor requirements allow.

Chosen default stack:

- Static HTML.
- Plain CSS.
- Plain JavaScript with browser ES modules.
- npm for package management and scripts.
- No application backend.
- No database.
- No user accounts or server-side persistence.

Tooling escalation rules:

- Start with no bundler if the app can remain a small static HTML/CSS/JavaScript codebase.
- Use plain JavaScript if the app is only a few hundred lines and stays easy to reason about.
- Use Vite if npm package handling, local development, or static build output becomes awkward without a bundler.
- Use TypeScript if the app grows enough to need multiple modules and stronger type boundaries.

Fallback UI stack if vanilla code becomes awkward:

- React for component structure.
- Tailwind for utility styling.

React and Tailwind are not the starting point. They are fallback options only if the plain HTML/CSS/JavaScript implementation becomes harder to maintain than a small component stack.

### Build And Serving

V1 is local-only.

Requirements:

- The web app should be buildable into static files.
- The built output should be servable as a basic website.
- Local development should run from npm scripts.

Recommended implementation shape:

- Start without a bundler if MapLibre/PMTiles can be loaded cleanly and the app remains simple.
- Use Vite as the preferred bundler/dev server only if package loading or build output needs it.
- Keep the source layout understandable without framework conventions.
- Avoid introducing routing, SSR, API routes, or deployment-specific abstractions in v1.

### Map Rendering

The web app needs a browser map renderer that can display broad Finland map context while also rendering the same local PMTiles datasets used by mobile.

Recommended stack:

- MapLibre GL JS for browser map rendering.
- PMTiles browser protocol support for loading `.pmtiles` data.
- A local style JSON equivalent to the mobile map style, adapted for browser MapLibre if needed.

Map constraints:

- Use a broad Protomaps PMTiles source as the desktop planning base so the full map viewport renders even when the mobile bundle is a route corridor extract.
- Load the mobile bundled PMTiles files from `shared/maps/` as local detail overlays, including provider overlays when present.
- Load every stored map data service output as additional detail overlays.
- Keep map data composition clean: the broad base source owns land, water, boundaries, and place context; local detail overlays contribute roads, paths, buildings, POIs, and labels only.
- In the web app, Protomaps bbox extracts are stored and counted as downloaded map data, but they are not rendered as extra detail because the full Protomaps source is already the visible base. Finnish provider PMTiles overlays are the rendered downloaded detail.
- Do not clone broad fill layers such as water or landcover into clipped detail overlays because route-corridor and bbox extracts can render as large visual artefacts.
- V1 target area is southern Finland.
- Shared workspace-level map assets are the desired direction.
- Use `shared/maps/` for shared PMTiles datasets.
- Use `shared/styles/` for shared or web-adapted map style JSON.
- The exact map dataset will be sorted out later.

Map layer controls:

- The web app exposes the same map-layer settings as TrailLite mobile.
- Street names toggles the `street-names` layer.
- POIs toggles the `poi-dots` and `poi-names` layers.
- Buildings toggles the `buildings` layer.
- Paths and tracks toggles `paths-highlight` and `roads-minor`.
- Defaults match mobile: Street names on, POIs on, Buildings off, Paths and tracks on.

### Route Editor Implementation

Recommended approach:

- Keep route state as an ordered array of `{ latitude, longitude }` points.
- Render the route as GeoJSON line and point overlays on the MapLibre map.
- Keep edit history as snapshots or inverse operations for point-edit undo.
- Use haversine distance over the route point array for the live distance estimate.
- Keep GPX parsing and serialization in small standalone modules.

Editing scope:

- Add point.
- Drag point.
- Insert point between existing points.
- Delete point.
- Undo point edits.
- Clear route.
- Import GPX.
- Export clean GPX.

### Dependencies

Expected runtime dependencies:

- MapLibre GL JS.
- PMTiles support for MapLibre.

Expected development dependencies:

- Vite only if package bundling or dev serving is needed.
- A lightweight test runner can be added for GPX parsing/export and distance calculations.

Avoid in v1 unless clearly needed:

- React.
- Tailwind.
- Component libraries.
- State management libraries.
- Backend frameworks.
- Hosted routing APIs.

### Testing Strategy

Primary v1 verification approach:

- Keep tests lightweight.
- Prefer minimal manual browser test scripts that an AI agent can execute with `agent-browser`.
- Add automated unit tests only where they clearly reduce risk for GPX parsing/export or distance calculation.

Manual verification:

- Load the web app locally.
- Confirm the Finland PMTiles map renders.
- Draw a route.
- Download GPX.
- Import the GPX into TrailLite mobile.
- Confirm route line and navigation readout work in the mobile app.

### Deferred Technical Decisions

- Whether to introduce Vite after a no-bundler attempt.
- Whether to introduce TypeScript after plain JavaScript becomes too large or implicit.
- Exact southern Finland PMTiles dataset and style contents.

## Web App Sprint Goals

Status: milestone-based delivery plan.

Sprints are milestone based. Calendar length is not the control metric; working results are.

### Sprint 0: Shared Assets And Map Foundation

Goal: prove the web app can render the same map data locally.

Scope:

- Create the web app skeleton.
- Move map/style assets toward shared workspace ownership.
- Use `shared/maps/` for PMTiles data.
- Use `shared/styles/` for shared or web-adapted map styles.
- Keep mobile working after the asset move.
- Render the southern Finland map in the browser.
- Decide from implementation evidence whether no-bundler setup is enough or Vite is needed.

Definition of done:

- Local web app runs from npm scripts.
- Browser displays the PMTiles map.
- Map data comes from shared workspace assets.
- Mobile app still builds or has a clear follow-up if asset migration needs mobile changes.
- Manual `agent-browser` script can open the app and verify that map tiles render.

### Sprint 1: GPX Rendering

Goal: render existing GPX routes on top of the map.

Scope:

- Import or load a GPX file.
- Parse mobile-compatible `<trkpt>` geometry.
- Flatten track points into one editable route model.
- Draw the imported GPX route as a line on the map.
- Show point count and haversine distance.
- Show clear validation errors for unusable GPX.

Definition of done:

- A known bundled/mobile-compatible GPX route can be displayed in the web app.
- Route line appears in the correct location on the shared Finland map.
- Distance and point count are visible.
- Manual `agent-browser` script can load the app, import/load a GPX fixture, and verify that route geometry appears.

### Sprint 2: GPX Creation

Goal: create a new route manually and export clean GPX.

Scope:

- Add route points with mouse clicks.
- Render route line and point handles.
- Name the route.
- Calculate live distance and point count.
- Export clean GPX 1.1 using `<trkpt>` geometry.
- Generate a filename from the route name.
- Validate before download: route name, at least two points, valid coordinates.

Definition of done:

- User can draw a simple route on the map.
- User can download a `.gpx` file.
- Exported GPX imports into TrailLite mobile without modification.
- Manual `agent-browser` script can draw points, download/export GPX, and inspect that exported XML contains valid `<trkpt>` data.

### Sprint 3: Basic Editing

Goal: make route creation and imported route changes safe enough for real planning.

Scope:

- Drag route points.
- Insert a route point between existing points.
- Delete route points.
- Undo point edits.
- Clear the route.
- Imported GPX opens for viewing first.
- First edit to an imported GPX creates an editable copy.

Definition of done:

- User can correct mistakes while drawing or editing imported GPX.
- Undo works for point edits.
- Clear route works deliberately.
- Imported GPX is not treated as overwritten before editing starts.
- Manual `agent-browser` script can exercise add, drag, insert, delete, undo, and clear.

### Sprint 4: TrailLite Android GPX Compatibility Pass

Goal: prove end-to-end GPX/data usefulness with the TrailLite Android app.

This sprint is about exported data compatibility with the Android application. It is not about making the web app responsive for mobile browsers.

Scope:

- Export routes created from scratch.
- Export routes created from imported GPX.
- Import exported files into TrailLite mobile.
- Verify route line rendering in mobile.
- Verify mobile navigation readout works against generated routes.
- Fix GPX compatibility gaps found during manual testing.
- Document known limitations.

Definition of done:

- At least one created route and one imported/edited route work in mobile.
- Mobile displays route line and point count.
- Mobile progress/off-route readout works while tracking against the generated route.
- Any remaining limitations are documented in `PRODUCT.md`.

Sprint 4 completes the initial functional skeleton and proves TrailLite Android GPX/data compatibility. It must not be skipped or replaced by polish work.

### Sprint 5: Polish Sprint 1 - Design Review

Goal: evaluate whether the functional skeleton is understandable, efficient, and visually credible as a desktop route-planning tool.

Scope:

- Review the full create/import/edit/export workflow.
- Review layout density, controls, typography, colors, and map readability.
- Check whether primary actions are obvious without explanatory page text.
- Check empty states, imported-route states, editing states, validation states, and download-ready states.
- Identify friction in mouse-based route drawing and point editing.
- Produce a prioritized design issue list.

Definition of done:

- Design review findings are documented.
- Issues are grouped by severity: blocking, important, polish.
- The team has a clear design rework target, not just a list of subjective preferences.

### Sprint 6: Polish Sprint 2 - Functionality Review

Goal: evaluate whether the functional skeleton reliably supports real route planning, not only happy-path demos.

Scope:

- Review all route creation and imported-GPX workflows.
- Exercise invalid GPX, too-few-points, clear route, undo, delete, insert, drag, and export validation paths.
- Verify distance and point count behavior during edits.
- Check GPX output against the mobile import contract.
- Identify missing functionality that blocks real use.
- Produce a prioritized functionality issue list.

Definition of done:

- Functionality review findings are documented.
- Blocking gaps are separated from nice-to-have improvements.
- Manual `agent-browser` scripts cover the core happy path and key edge cases.

### Sprint 7: Polish Sprint 3 - Design Rework

Goal: turn the reviewed skeleton into a polished, comfortable desktop web app UI.

Scope:

- Rework layout and visual hierarchy based on Sprint 5 findings.
- Improve toolbars, buttons, route metadata panels, and status/validation presentation.
- Improve route point affordances and selected/hover/editing states.
- Tune map overlay colors, line widths, point handles, and contrast.
- Remove clutter and reduce unnecessary instructional text.
- Verify text does not overflow or obscure controls at desktop target sizes.

Definition of done:

- The app feels intentionally designed, not like a wiring demo.
- Core controls are discoverable and consistent.
- Route state and export readiness are easy to scan.
- Design review blocking and important issues are resolved or explicitly deferred.

### Sprint 8: Polish Sprint 4 - Functionality Fixes And Tweaks

Goal: close the practical usability gaps found during functionality review.

Scope:

- Fix bugs found in import, route state, editing, undo, validation, and export.
- Implement small missing interactions that materially improve route planning.
- Tune point editing precision for mouse use.
- Improve error handling and recovery paths.
- Expand manual `agent-browser` scripts where they catch real regressions.

Definition of done:

- Functionality review blocking and important issues are resolved or explicitly deferred.
- Core workflows work repeatedly without state corruption.
- GPX output remains compatible with TrailLite Android.
- Manual browser scripts pass for the agreed critical flows.

### Sprint 9: Polish Sprint 5 - Release Readiness

Goal: make the web app ready for actual personal use, not just internal demonstration.

Scope:

- Run full create/import/edit/export verification.
- Run TrailLite Android GPX/data compatibility verification.
- Clean up visible rough edges.
- Confirm local build/static serving instructions.
- Document known limitations.
- Confirm shared asset assumptions and any follow-up map-data work.

Definition of done:

- A polished desktop web app is ready for use.
- The app can create a route, import a GPX, edit route geometry, and export clean GPX.
- Exported GPX works in TrailLite Android.
- Manual verification steps are documented and repeatable.
- Remaining limitations are acceptable for personal v1 use.

### Sprint Order

1. Map foundation.
2. GPX rendering.
3. GPX creation.
4. Basic editing.
5. TrailLite Android GPX compatibility pass.
6. Polish Sprint 1 - design review.
7. Polish Sprint 2 - functionality review.
8. Polish Sprint 3 - design rework.
9. Polish Sprint 4 - functionality fixes and tweaks.
10. Polish Sprint 5 - release readiness.

This order intentionally prioritizes visible map confidence before route generation complexity, then verifies TrailLite Android GPX/data compatibility, then reserves five separate polish sprints to turn the skeleton into a polished tool.

## Web App Design Direction

Status: v1 design direction.

### Overall Direction

The web app should feel like a utilitarian, polished, minimal desktop route-planning tool. It should not feel like a marketing website, dashboard, or mobile-first consumer app.

Design principles:

- Prioritize route planning efficiency over decoration.
- Keep the map as the primary workspace.
- Keep controls visible and predictable.
- Use restrained visual styling with clear states.
- Avoid unnecessary instructional text.
- Make route status, editing mode, validation, and export readiness easy to scan.

### Layout

V1 uses a persistent left sidebar plus a full map workspace.

Layout decisions:

- Left sidebar contains route controls, route metadata, import/export actions, validation state, and route stats.
- Sidebar width should be medium, around `360px`.
- Sidebar ordering starts with user controls, followed by map search/layer settings, route name, route stats, points, validation, and export state.
- Map occupies the remaining desktop viewport.
- Controls are always visible; the app targets large desktop screens.
- Panels do not need to collapse in v1.
- The initial state is map viewing/panning, not immediate drawing.
- User starts route creation from explicit controls in the sidebar.
- App identity and app status live in the sidebar; no separate top bar is needed for v1.
- Empty state should be minimal: blank map workspace plus available sidebar actions.

### Visual Style

Visual feel:

- Utilitarian.
- Polished.
- Minimal.
- Desktop-first.
- Support light and dark themes.
- Theme follows the operating system/browser color scheme automatically.

Avoid:

- Decorative hero sections.
- Marketing-style copy.
- Card-heavy layouts.
- Mobile-first bottom sheets.
- Large explanatory onboarding blocks.

### Route Visual States

Route color communicates mode:

- Viewing route: TrailLite coral, matching the Android app route color.
- Editing route: blue route treatment to distinguish active editing from passive viewing.

Initial color direction:

- Viewing route: `#FF5733`.
- Editing route: a clear blue in the TrailLite family, final exact value to be tuned against the map style.

Route overlays should be prominent enough to read on the map without hiding map details. Point handles should be visible in edit mode and quieter or hidden in view mode.

Route point handles:

- Small precise dots by default.
- Enlarge on hover for easier grabbing.
- Stay visually subordinate to the route line unless selected or hovered.

### Interaction Model

Startup behavior:

- App opens in map viewing/panning mode.
- User can inspect the map before creating or importing a route.
- User can search common southern Finland places from a simple local search box.
- Route creation starts through an explicit sidebar action.

Editing behavior:

- Editing mode should be obvious from route color, point handles, and active controls.
- View mode should show the route cleanly without unnecessary editing affordances.
- Controls should stay available in the left sidebar rather than appearing only as floating map overlays.
- Use default MapLibre map controls.
- In editing mode, normal mouse drag is for route point interaction.
- In editing mode, Shift + drag moves/pans the map.
- Route points are edited with mouse interactions only.
- Point coordinates are not numerically editable in the sidebar in v1.

Sidebar content model:

- User controls first.
- Export action is always visible near the top controls.
- Mobile routes are managed in the sidebar with a filter, compact selectable list, refresh action, and load action.
- The visible mobile route list scrolls rather than hiding matching routes behind an invisible picker.
- The currently loaded mobile route is marked separately from the selected route pending load.
- The mobile route filter supports keyboard selection with ArrowUp, ArrowDown, and Enter.
- Saving a route to mobile updates the route manager immediately, even before a full catalog refresh completes.
- A stale catalog refresh must not hide a route that was just saved from the web app.
- Fresh saved route metadata should not be replaced by stale same-id catalog metadata.
- Map search and map layer settings sit below the primary route controls and stay visible.
- Map layer settings use simple checkboxes with the same labels as mobile.
- Route name below controls.
- Route name uses a simple text input.
- Simple stats section directly under the route name.
- Stats show route name, distance, and point count.
- Points/details below stats.
- Points list shows numbered points.
- Each listed point shows coordinates in a small font.
- Coordinate precision is not product-critical; the coordinate list is small supporting information.
- Point list is mostly informational in v1.
- Only the point list scrolls inside the sidebar.
- Controls, route name, stats, validation, and export actions remain visible.
- Validation/export state near export controls.

Control style:

- Plain text labels.
- Simple button styling.
- Keep controls simple; avoid inventing custom interaction patterns where standard buttons work.
- No icon-first toolbar in v1.
- Tooltips are optional rather than required because controls use text labels.

Validation and error behavior:

- Broken imported GPX format can use a simple browser alert in v1.
- Alert text for broken GPX: `format is broken`.
