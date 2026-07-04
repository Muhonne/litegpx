# Map Data Service Notes

This directory contains CLI and local API tooling for creating map packages for TrailLite.

## Purpose

Use `extract-route-map.mjs` when a GPX route or selected map rectangle should produce a smaller `.pmtiles` map package that can be imported into or bundled with the mobile app.

The current implementation extracts from an existing source PMTiles archive. It does not yet build fresh vector tiles from raw OSM, NLS, or Digiroad data.

## Required Local Data

The default source map is the full remote Protomaps z15 build:

```text
https://build.protomaps.com/20260703.pmtiles
```

This lets the extractor download only the chunks needed for the produced dataset. To force the ignored local workspace map, pass:

```sh
--source local
```

That resolves to:

```text
../shared/maps/finland.pmtiles
```

The source PMTiles must match the TrailLite style schema in `../shared/styles/style_template.json`. Required Protomaps source layers include:

- `landcover`
- `water`
- `buildings`
- `roads`
- `pois`

## Required Tooling

The script uses only Node.js standard library code, but real extraction requires the external `pmtiles` CLI.

On macOS:

```sh
brew install pmtiles
```

## CLI Usage

Run from the workspace root:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes/hameen-harkatie.gpx \
  --buffer-meters 10000 \
  --coverage corridor \
  --out mapdataservice/output/hameen-harkatie.pmtiles
```

Useful dry run:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx web/tests/fixtures/simple-route.gpx \
  --buffer-meters 5000 \
  --dry-run
```

To cover all GPX files already bundled in the mobile application:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --out mapdataservice/output/mobile-bundled-routes.pmtiles
```

To extract a rectangle selected in the web app:

```sh
node mapdataservice/extract-route-map.mjs \
  --bbox 24.930000,60.160000,24.940000,60.170000 \
  --name helsinki-test-area
```

To run the local API used by the web app:

```sh
node mapdataservice/server.mjs
```

The service listens on `http://localhost:5174` and exposes `POST /api/extract-bbox`. It calls the same CLI, so cache and output rules remain identical.

It also exposes `GET /api/datasets`, which lists all `.pmtiles` packages in `mapdataservice/output/`. The web app uses this endpoint on startup so every stored detail dataset is loaded as a map overlay.

The dry run prints:

- parsed GPX point count
- parsed GPX file count when `--gpx` points at a directory
- raw route bounds
- buffered bbox
- region GeoJSON path for `corridor` and `route-bboxes` modes
- source PMTiles path
- output path
- exact `pmtiles extract` command

## Outputs

For a real run, the script writes:

```text
mapdataservice/output/<name>.pmtiles
mapdataservice/output/<name>.pmtiles.json
```

The JSON sidecar records source, route bounds, buffer distance, and command metadata.

All generated map packages go under `mapdataservice/output/`. Default names include a short content hash. If the output file exists and its sidecar cache key matches the requested source, zooms, bbox/route, buffer, coverage mode, and GPX file content, the CLI reuses it and does not download data again. Use `--force` only for intentional replacement.

Generated outputs are ignored by Git. Do not stage route-area `.pmtiles` packages unless the project explicitly moves to Git LFS or another artifact storage flow.

## Mobile App Handoff

The generated `.pmtiles` file can be used through the mobile app's existing map import path. The mobile app stores imported map packages under `TrailLite/maps/` and loads them through MapLibre using local `pmtiles://` URLs.

## Future Pipeline

Keep future OSM/NLS/Digiroad enrichment in this service or a server-side successor, not inside the Android app. The intended future pipeline is:

```text
GPX route
  -> buffered route area
  -> OSM Finland extract
  -> optional Digiroad enrichment
  -> optional NLS topographic enrichment
  -> TrailLite vector tile schema
  -> PMTiles
```
