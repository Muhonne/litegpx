# TrailLite MVP Iteration Log

This log captures 10 product iteration rounds across Product Owner, UI Designer, and Developer roles. The working goal is a marketable low-energy offline route tracking app for cyclists and hikers.

## Round 1: Product Positioning

- Product Owner: The core promise must be "offline route confidence" rather than a general map viewer. The main success case is loading a route and knowing whether the user is still on it.
- UI Designer: The first screen should remain the usable map, with controls kept compact and operational. Avoid a landing screen or explanatory copy.
- Developer: Preserve the existing MapLibre offline rendering and Bikeland route picker. Add route-aware navigation metrics before adding secondary features.
- Decision: Prioritize route-relative GPS feedback as the next marketable differentiator.

## Round 2: Route-Aware Navigation

- Product Owner: Users need immediate answers: am I on the route, how far off am I, how much remains?
- UI Designer: Use a compact bottom readout that can be scanned while moving. It should not hide the map more than the current status panel already does.
- Developer: Add a pure Kotlin route analysis module that calculates nearest route point, off-route distance, progress, and remaining distance from the current location.
- Decision: Implement route health in the status surface instead of creating a separate navigation screen.

## Round 3: GPS Start Behavior

- Product Owner: Pressing Start should show a position quickly, especially in the emulator and on devices with an existing GPS fix.
- UI Designer: The location state should change visibly from idle to tracking and show concrete coordinates or route status.
- Developer: Emit the fused provider's last known location immediately before starting throttled updates.
- Decision: Use last known location for fast feedback, then keep 10-15 second low-power updates.

## Round 4: Route Picker Usability

- Product Owner: A bundled catalog of 32 routes is useful only if routes can be found quickly.
- UI Designer: Add a search field at the top of the route dialog and show the filtered count.
- Developer: Filter bundled routes by title in Compose state without introducing persistence or indexing.
- Decision: Add search to the picker as a lightweight catalog improvement.

## Round 5: Battery Strategy

- Product Owner: Low energy must remain a strict product value, not just a tagline.
- UI Designer: The GPS button should be short and visible in the top control row.
- Developer: Keep balanced-power fused location, low MapView FPS, no wake lock, and no forced screen-on behavior.
- Decision: Continue using low-power cadence and make the controls less crowded by shortening GPS button text.

## Round 6: Offline Trust

- Product Owner: Marketability depends on confidence that the app will work outside coverage.
- UI Designer: The status area should clearly show current map and route state.
- Developer: Keep `INTERNET`, `ACCESS_NETWORK_STATE`, and `ACCESS_WIFI_STATE` removed from the merged manifest. Force MapLibre connectivity state offline at startup.
- Decision: Maintain zero network runtime dependency even with MapLibre's default connectivity receiver.

## Round 7: Navigation Architecture

- Product Owner: Route math will grow into warnings, ETA, and cueing; it needs a stable place.
- UI Designer: Future additions should not make the activity harder to reason about.
- Developer: Add `RouteNavigation.kt` for route analysis rather than embedding distance math in UI code.
- Decision: Keep navigation computation separate from Compose and MapLibre rendering.

## Round 8: Moving Dot Correctness

- Product Owner: The blue dot must update while the user moves, even if the camera does not recenter.
- UI Designer: Camera movement should be calm; the dot movement is the primary navigation feedback.
- Developer: Update the location dot on every throttled location callback and only freeze camera recentering while the location remains visible.
- Decision: Separate render updates from camera updates.

## Round 9: Marketable Route Data

- Product Owner: The bundled Bikeland routes make the app demonstrable immediately.
- UI Designer: Show route name, distance, and duration in the picker without extra detail pages.
- Developer: Keep the generated catalog fields for Bikeland id, detail URL, GPX URL, bounds, local asset, and track point count.
- Decision: Treat the Bikeland catalog as demo-ready seed content while keeping SAF GPX import for user-owned routes.

## Round 10: MVP Release Criteria

- Product Owner: The MVP is marketable when it can load a bundled route, show location, show off-route/progress/remaining, and work offline.
- UI Designer: The current visual design is functional but should later move toward a denser outdoor navigation HUD with larger route status and safer touch targets.
- Developer: Verify Gradle build, packaged route assets, no network permissions, and emulator location behavior.
- Decision: This iteration raises the MVP from GPX viewer to low-power route tracker. Next release candidates should add distance-to-start/end, route simulation tests, and corridor map extraction.

## Implemented In This Pass

- Immediate last-location emission when tracking starts.
- Route navigation snapshot with nearest route, off-route status, progress, and remaining distance.
- Bottom status panel now shows route health when a track and location are available.
- Route picker search with filtered route count.
- Blue dot updates independently from camera recentering.
- GPS control label shortened to reduce toolbar clipping.
