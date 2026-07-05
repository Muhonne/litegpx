# TrailLite

TrailLite is a Kotlin + Jetpack Compose Android app for offline GPX viewing over local OSM vector packages.

## What It Implements

- Offline MapLibre map rendering from bundled or app-specific `.pmtiles` / `.mbtiles` files.
- SAF-based GPX route import with no broad storage permissions.
- Route catalog combining bundled Bikeland.fi assets and GPX files added through the app.
- Streaming GPX parsing of `<trkpt lat="..." lon="...">` points while ignoring metadata and extensions.
- Coral GPX line overlay and a passive blue GPS dot.
- Route-aware navigation readout with distance from route, progress percentage, and remaining distance.
- Fast GPS startup by rendering the fused provider's last known location before throttled updates arrive.
- High-accuracy fused location updates while tracking, defaulting to 5 seconds and configurable in Settings.
- Navigation camera mode that keeps the current position 40% from the bottom and rotates toward the next 50 m of route.
- Explicit manifest merge removal of `android.permission.INTERNET`.
- No keep-screen-on or wake-lock usage.
- A 10-round product/UI/development iteration log in `docs/iteration-log.md`.

## Local Storage

Imported files are copied into app-specific storage:

- `TrailLite/maps/` for `.pmtiles` and `.mbtiles`
- `TrailLite/tracks/` for `.gpx`

On most devices this resolves under the app-specific external files directory, avoiding broad storage permissions.

## Using Route Tracking

Open the app, tap `Routes`, select a route, then tap `Start` to begin GPS tracking. The selected route becomes the active track, and the bottom status panel shows whether the current location is on or off route, distance from the route line, progress percentage, and remaining distance.

The route list sorts by distance from the current location by default. Use the list controls to switch to alphabetical or length sorting. Tap `Add route` in the route list to copy a GPX file into app storage and add it to the selectable routes.

The app requests fine or coarse location permission when tracking starts. Tracking runs against the currently loaded route; if no route is loaded, GPS can still start but route progress is not shown.

While tracking, each accepted GPS fix updates the location dot and navigation camera. The camera keeps the current position horizontally centered and 40% from the bottom, preserves the user's current zoom level, and rotates so the next 50 m of the active route points toward the top of the screen. If the user manually pans or zooms the map, automatic follow pauses for 10 seconds before resuming.

Tap `Settings` to change map layers, GPS refresh interval, light/dark theme, and bottom info box visibility. The dark theme also rewrites the generated local MapLibre style so the map itself uses dark colors.

The emulator navigation camera check is documented in `tests/manual/01-navigation-camera-emulator.md`. It uses `tests/manual/play-gpx-route.sh` to play a bundled GPX route through `adb emu geo fix`.

## Bundled Routes

The bundled route catalog lives at `app/src/main/assets/routes/routes.json`. Each entry points to a local GPX asset in the same directory, so the app can load bundled routes without network access. User-added GPX routes are copied into `TrailLite/tracks/` and listed together with bundled routes.

Regenerate the catalog and GPX assets from Bikeland:

```sh
python3 tools/build_route_catalog.py
```

Route metadata is matched against the Bikeland WordPress route API and each GPX file is downloaded from Bikeland's `loadGPXFile` endpoint. The generated catalog stores the Bikeland route id, detail URL, GPX download URL, local GPX asset path, bounds, and track point count for every bundled route.

## Bundled Map Data

The Android build includes these shared offline map assets when present:

- `../shared/maps/finland.pmtiles` -> `maps/finland.pmtiles`
- `../shared/maps/finland.providers.pmtiles` -> `maps/finland.providers.pmtiles`

The provider file is an overlay source for Finnish detail data: Digiroad roads/paths plus NLS road lines and buildings when `NLS_API_KEY` is available.

Before installing an APK that must cover every bundled route, regenerate both map packages from the full route asset directory:

```sh
cd ..
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --maxzoom 15 \
  --out shared/maps/finland.pmtiles \
  --force

NODE_OPTIONS=--max-old-space-size=12288 node mapdataservice/build-finnish-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --source local \
  --maxzoom 15 \
  --providers digiroad,nls \
  --out shared/maps/finland.providers.pmtiles \
  --force
```

`build-finnish-map.mjs` reads `NLS_API_KEY` from the workspace root `.env`. The larger Node heap is needed for full all-route provider builds because the normalized provider GeoJSON can be hundreds of MB.

For a provider-only refresh after the base map already exists, run only:

```sh
cd ..
NODE_OPTIONS=--max-old-space-size=12288 \
node mapdataservice/build-finnish-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --source local \
  --maxzoom 15 \
  --providers digiroad,nls \
  --out shared/maps/finland.providers.pmtiles \
  --force
```

The web app's `Save to mobile app` button writes the current route into `app/src/main/assets/routes/`, updates `routes.json`, generates a corridor base map for that saved route, and writes the Finnish provider overlay to `shared/maps/finland.providers.pmtiles`. Run the full-directory generation above when the APK should include provider detail for all bundled routes, not only the latest saved route.

Verify the package before installing a route-ready APK:

```sh
pmtiles show ../shared/maps/finland.pmtiles | rg "bounds|max zoom"
pmtiles show ../shared/maps/finland.providers.pmtiles | rg "bounds|max zoom|addressed tiles"
```

For tight navigation testing, the bundled route corridor package should report `max zoom: 15`. MapLibre can zoom further, but zooms above the package max are overzoomed and do not add map detail.

## Build

Open this directory in Android Studio and run the `app` configuration, or use the included Gradle wrapper:

```sh
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.
