# Manual Test: Navigation Camera With Emulator GPS

Purpose: verify that TrailLite behaves like route navigation when GPS fixes are played through the Android emulator.

## Preconditions

- An Android emulator is running and visible.
- The emulator has Google location simulation enabled through `adb emu geo fix`.
- The current workspace has the debug APK buildable from `mobile/`.
- The bundled map asset at `../shared/maps/finland.pmtiles` should be a route corridor package with `max zoom: 15` when testing tight navigation zooms.

Check the bundled map before building:

```sh
pmtiles show ../shared/maps/finland.pmtiles | rg "bounds|max zoom"
```

If APK install fails with a storage error, free emulator data space before retrying:

```sh
adb -s emulator-5554 shell df -h /data
adb -s emulator-5554 uninstall com.example.traillite
```

## Route Playback

From `mobile/`:

```sh
tests/manual/play-gpx-route.sh \
  --install \
  --launch \
  --route app/src/main/assets/routes/hameen-harkatie.gpx \
  --interval 5 \
  --step 5
```

The script builds and installs the debug APK, launches TrailLite, grants location permissions, then pauses.

In the emulator:

1. Tap `Routes`.
2. Search/select `Hämeen Härkätie`.
3. Tap `Start`.
4. Return to the terminal and press Enter.

## Expected Results

- The blue location dot updates at the GPX playback cadence.
- The map camera follows every played GPS fix while tracking is active.
- The location dot stays horizontally centered and about 40% from the bottom of the screen.
- The map rotates so the next route segment, about 50 m ahead, points toward the top of the screen.
- If automatic tracking zoom is off, the current zoom level is preserved and manual zoom remains under user control.
- If automatic tracking zoom is on, the camera applies the configured tracking zoom level while tracking a selected route.
- The bottom panel shows the current `Zoom: n.n` value so repeated runs can verify different tested zoom levels.
- The bottom panel keeps updating location and route status.
- Manually pan or zoom the map during playback. Auto-follow should pause for about 10 seconds, then resume.

## Faster Development Run

Use this when checking camera behavior quickly:

```sh
tests/manual/play-gpx-route.sh \
  --launch \
  --route app/src/main/assets/routes/hameen-harkatie.gpx \
  --interval 1 \
  --step 10 \
  --max-points 60
```

The production tracking request remains 5 seconds; this faster mode only accelerates emulator playback.

## Zoom Sweep

Run the playback at several user-selected zooms. A good minimum sweep is:

- route-fit zoom after selecting the route, usually around `Zoom: 8.x`
- medium navigation zoom around `Zoom: 12.x`
- tight native-detail zoom around `Zoom: 15.x`

Use double-tap or pinch gestures in the emulator to change zoom before tapping `Start`. Manual gestures pause auto-follow for about 10 seconds, so wait before beginning the next playback run.

## Dry Run

Verify GPX parsing without an emulator:

```sh
tests/manual/play-gpx-route.sh \
  --route app/src/main/assets/routes/hameen-harkatie.gpx \
  --step 10 \
  --max-points 5 \
  --dry-run
```
