# Mobile Offline Navigation

## Description

The Android app lets a rider select a bundled GPX route, view it on the offline PMTiles map, and track current position against the route without network access.

## Code

- `mobile/app/src/main/java/com/example/traillite/MainActivity.kt` owns top-level UI state, route selection, permissions, and settings entry points.
- `mobile/app/src/main/java/com/example/traillite/BundledRoute.kt` loads bundled route metadata from the app assets.
- `mobile/app/src/main/java/com/example/traillite/GpxParser.kt` parses GPX track points used by route rendering.
- `mobile/app/src/main/java/com/example/traillite/TrailMapController.kt` renders the map, route overlay, position dot, progress, and camera movement.
- `mobile/app/src/main/java/com/example/traillite/BatteryLocationClient.kt` controls location update cadence.
- `mobile/app/src/main/java/com/example/traillite/MapLayerSettings.kt` persists map and route display settings.

## Verification

- Build with `cd mobile && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug`.
- Use `mobile/tests/manual/06-tracking-camera-update-cadence.sh` for camera cadence behavior.
- Use `mobile/tests/manual/07-route-card-readability.sh` for riding route-card readability.

## Scenario

```gherkin
Feature: Mobile offline route navigation
  Scenario: Track a selected route offline
    Given the Android app is installed with bundled routes and map assets
    And location permission is granted
    When the user selects a route and starts GPS tracking
    Then the app draws the route on the offline map
    And the current position, route status, progress, and remaining distance update from GPS fixes
    And camera movement follows the configured map update cadence
    And the app remains usable without network access
```
