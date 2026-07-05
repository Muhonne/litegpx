# TrailLite Workspace Notes

This repository is being organized as a small multi-app workspace.

## Layout

- `mobile/` contains the Android TrailLite application and its Gradle wrapper.
- `web/` contains the desktop GPX generation web app.
- `mapdataservice/` contains local CLI/API tooling for creating cached PMTiles map packages from GPX routes or selected map rectangles.
- Keep root-level files focused on workspace coordination. Android-specific source, docs, tooling, and build commands belong under `mobile/`.
- Shared map datasets live under `shared/maps/` for local development, but PMTiles binaries are not committed to Git because they exceed normal GitHub file limits. Keep `shared/maps/*.pmtiles` ignored unless the project explicitly moves to Git LFS or another artifact storage flow.

## Documentation Index

- `PRODUCT.md` is the top-level product overview, feature scope, and data-format contract.
- `USE_CASES.md` contains Gherkin-style user flows and acceptance scenarios.
- `DATA.md` explains route/map data layers, storage locations, generated artifacts, credentials, and service ownership.
- `mapdataservice/README.md` documents map data service commands and local API endpoints.
- `mobile/README.md` documents Android build/runtime behavior and bundled map/route assets.
- `web/README.md` documents web app install, run, build, and manual checks.

## Working From The Root

- To build or run Android code, `cd mobile` first and use the Gradle wrapper there.
- Do not add network permissions to the Android app unless the product requirement changes. TrailLite navigation is designed to work offline.
- Keep generated files out of the root. Build outputs should stay under each subproject and remain ignored.
- Do not stage or commit local PMTiles files. If a map package is needed, place it at the expected local path, for example `shared/maps/finland.pmtiles`, outside Git tracking.
- Generated PMTiles packages from `mapdataservice/output/` should stay out of Git unless the project adopts an artifact storage flow. Keep generated route corridors and web-selected rectangle extracts in that folder so the cache can prevent repeat downloads.

## Required Change Workflow

Always follow this workflow when making changes:

1. Understand the user's request. Do not assume; ask questions if the request is unclear.
2. Read the relevant documentation to understand scope before editing.
3. Write a simple test case that fails because the implementation is not there yet.
4. Make small, concise edits.
5. Verify the test case passes. Continue editing if it does not.
6. Update documentation.
7. Commit with a short message and push.

## Expected Commands

```sh
cd mobile
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
```

The Android debug APK is produced under `mobile/app/build/outputs/apk/debug/` relative to this workspace root.
