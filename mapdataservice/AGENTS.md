# Map Data Service Notes

This directory contains CLI and local API tooling for creating map packages for TrailLite.

## Purpose

Use `extract-route-map.mjs` when a GPX route or selected map rectangle should produce a smaller `.pmtiles` map package that can be imported into or bundled with the mobile app.

The current implementation extracts from an existing source PMTiles archive. It does not yet build fresh vector tiles from raw OSM, NLS, or Digiroad data.

Use `build-finnish-map.mjs` when working on Finnish-provider enrichment. It wraps `extract-route-map.mjs`, downloads provider data for the same bbox/corridor, normalizes it into TrailLite-compatible GeoJSON layers, and emits a provider overlay PMTiles package. Web lists the overlay through `/api/datasets`, and Android loads the bundled `finland.providers.pmtiles` overlay beside `finland.pmtiles`.

## Required Local Data

The default source map is the full remote Protomaps z15 build:

```text
https://build.protomaps.com/20260716.pmtiles
```

The `protomaps` and `protomaps-latest` source aliases resolve the current build through `https://build-metadata.protomaps.dev/builds.json` and fall back to the URL above if metadata lookup fails. This lets the extractor download only the chunks needed for the produced dataset. To force the ignored local workspace map, pass:

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

Install service-local npm dependencies before running `build-finnish-map.mjs`:

```sh
cd mapdataservice
npm install
cd ..
```

Finnish-provider packaging also needs `sqlite3` for temporary MBTiles assembly before PMTiles conversion:

```sh
brew install sqlite
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

To regenerate the bundled base map for all GPX files already bundled in the mobile application:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --maxzoom 15 \
  --out shared/maps/finland.pmtiles \
  --force
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

The service listens on `http://localhost:5174` and exposes `POST /api/extract-bbox`. It calls the same CLI, so cache and output rules remain identical. Bbox extraction writes both the base PMTiles package and a Finnish provider overlay PMTiles package for the same rectangle. API callers can pass `providers`, `nlsGeojsonDir`, or `nlsApiKey`; `TRAILLITE_NLS_GEOJSON_DIR` also sets a service-wide local NLS source directory.

It also exposes `GET /api/datasets`, which lists all `.pmtiles` packages in `mapdataservice/output/`. The web app uses this endpoint on startup so every stored detail dataset is loaded as a map overlay.

It also exposes `POST /api/save-mobile-route` for the web app's "Save to mobile app" action. That endpoint writes the submitted GPX to `mobile/app/src/main/assets/routes/`, updates `routes.json`, then rebuilds the bundled mobile base and provider PMTiles from all GPX files in that route directory by default. The resulting files are copied to `shared/maps/finland.pmtiles` and `shared/maps/finland.providers.pmtiles` so Android bundles them through the shared asset source set. Pass `"mapScope": "route"` only when intentionally creating a single-route map package. Service requests default to Digiroad; use request `providers` or `TRAILLITE_FINNISH_PROVIDERS` to explicitly include NLS.

`DELETE /api/mobile-routes/:id` removes a route from the bundled Android route catalog and deletes its GPX asset when no remaining route references that file.

To download Finnish provider data for a route corridor:

```sh
node mapdataservice/build-finnish-map.mjs \
  --gpx mobile/app/src/main/assets/routes/poutamaentie-15-to-papinmaentie-31.gpx \
  --buffer-meters 1000 \
  --coverage corridor \
  --providers digiroad,nls
```

For NLS, set `NLS_API_KEY`, pass `--nls-api-key <key>`, or pass `--nls-geojson-dir <dir>` for local NLS exports/tests containing `tieviiva.geojson` and `rakennus.geojson`. Digiroad WFS does not require authentication. If `--providers` is omitted, the builder uses `digiroad` by default, or `digiroad,nls` when `NLS_API_KEY` is set. Generated provider downloads are cached under `mapdataservice/cache/finnish-providers/`; normalized provider GeoJSON is written under `mapdataservice/output/.work/finnish-providers/`; provider overlay PMTiles files are written under `mapdataservice/output/`. Provider downloads page through OGC `next` links and WFS `startIndex` pages. Use `--download-only` to stop before MBTiles/PMTiles creation.

The CLI and service also read `NLS_API_KEY` from the workspace root `.env`. For a full all-route provider overlay, use the route directory and a larger Node heap:

```sh
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

Keep heavier map-data packaging in this service or a server-side successor, not inside the Android app. The intended future single-package pipeline is:

```text
GPX route
  -> buffered route area
  -> OSM Finland extract
  -> Digiroad road/street and path enrichment
  -> NLS topographic enrichment for buildings, land use, water, names, and terrain context
  -> TrailLite vector tile schema
  -> PMTiles
```
