# Mobile App Settings

## Description

The Android Settings dialog stores rider-facing map, GPS, camera, and display preferences. Settings must be glanceable, persistent, and directly tied to rendering or tracking behavior.

Current settings are Street names, POIs, Buildings, Paths and tracks, GPS refresh, Move map on every, Automatic tracking zoom, Zoom, Keep screen on, App brightness, Dark theme, Map info card, and Route info card.

## Code

- `mobile/app/src/main/java/com/example/traillite/MapLayerSettings.kt` defines defaults, preference keys, load, and save behavior.
- `mobile/app/src/main/java/com/example/traillite/MainActivity.kt` renders the Settings dialog and applies screen-on and App brightness changes.
- `mobile/app/src/main/java/com/example/traillite/TrailMapController.kt` applies layer visibility, Dark theme style reloads, tracking Zoom, and Move map on every behavior.
- `mobile/app/src/main/java/com/example/traillite/BatteryLocationClient.kt` uses GPS refresh as the fused-location interval.

## Verification

- Build with `cd mobile && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug`.
- Use `mobile/tests/manual/04-display-and-tracking-settings.sh` for display and tracking settings.
- Use `mobile/tests/manual/05-settings-layout-and-dark-map.sh` for Settings layout and Dark theme.
- Use `mobile/tests/manual/06-tracking-camera-update-cadence.sh` for Move map on every cadence.

## Scenario

```gherkin
Feature: Mobile app settings
  Scenario: Persist and apply rider settings
    Given the user opens Settings
    When the user changes map layers, GPS refresh, Move map on every, tracking camera, display, and info-card controls
    Then the app persists the selected values
    And map rendering, camera updates, location cadence, brightness, and visible info cards reflect those settings
```
