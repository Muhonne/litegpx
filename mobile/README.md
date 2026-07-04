# TrailLite

TrailLite is a Kotlin + Jetpack Compose Android app for offline GPX viewing over local OSM vector packages.

## What It Implements

- Offline MapLibre map rendering from `.pmtiles` or `.mbtiles` files copied through the Android document picker.
- SAF-based GPX import with no storage permissions.
- Bundled route catalog from the pasted Bikeland.fi list with local GPX assets selectable in the app.
- Streaming GPX parsing of `<trkpt lat="..." lon="...">` points while ignoring metadata and extensions.
- Coral GPX line overlay and a passive blue GPS dot.
- Route-aware navigation readout with distance from route, progress percentage, and remaining distance.
- Fast GPS startup by rendering the fused provider's last known location before throttled updates arrive.
- Low-power fused location updates at 10-15 second cadence with balanced power accuracy.
- Explicit manifest merge removal of `android.permission.INTERNET`.
- No keep-screen-on or wake-lock usage.
- A 10-round product/UI/development iteration log in `docs/iteration-log.md`.

## Local Storage

Imported files are copied into app-specific storage:

- `TrailLite/maps/` for `.pmtiles` and `.mbtiles`
- `TrailLite/tracks/` for `.gpx`

On most devices this resolves under the app-specific external files directory, avoiding broad storage permissions.

## Bundled Routes

The route catalog lives at `app/src/main/assets/routes/routes.json`. Each entry points to a local GPX asset in the same directory, so the app can load routes without network access.

Regenerate the catalog and GPX assets from Bikeland:

```sh
python3 tools/build_route_catalog.py
```

Route metadata is matched against the Bikeland WordPress route API and each GPX file is downloaded from Bikeland's `loadGPXFile` endpoint. The generated catalog stores the Bikeland route id, detail URL, GPX download URL, local GPX asset path, bounds, and track point count for every bundled route.

## Build

Open this directory in Android Studio and run the `app` configuration, or use the included Gradle wrapper:

```sh
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.
