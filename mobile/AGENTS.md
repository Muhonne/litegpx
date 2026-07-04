# TrailLite Android App Notes

This directory is the Android Gradle project root for TrailLite.

## Layout

- `settings.gradle.kts` includes the Android application module `:app`.
- `app/` is the Android application module.
- `app/src/main/assets/maps/finland.pmtiles` is the bundled offline vector map package.
- `app/src/main/assets/routes/` contains bundled GPX files and `routes.json`.
- `app/src/main/assets/glyphs/` contains offline glyph PBF files used by map label layers.
- `docs/iteration-log.md` records product/UI/development iteration notes.
- `tools/build_route_catalog.py` regenerates the bundled route catalog and GPX assets.

## Android Constraints

- The app intentionally has no `android.permission.INTERNET`.
- Location permissions are limited to fine/coarse location.
- GPX import uses Android's document picker, so broad storage permissions should not be added.
- Map labels, POIs, buildings, paths, routes, and the location dot must render from local assets/data.

## Build

Use the Gradle wrapper from this directory:

```sh
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
```

The debug APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Emulator

Install and launch with:

```sh
/Users/mattias/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
/Users/mattias/Library/Android/sdk/platform-tools/adb shell am start -n com.example.traillite/.MainActivity
```

If the emulator reports insufficient space, uninstall the previous app copy and reinstall:

```sh
/Users/mattias/Library/Android/sdk/platform-tools/adb uninstall com.example.traillite
```

## Route Data

Regenerate bundled Bikeland routes from this directory:

```sh
python3 tools/build_route_catalog.py
```

Check generated route assets before committing or packaging because they are bundled into the APK.
