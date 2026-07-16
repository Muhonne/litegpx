# LiteGPX Map Data Service

This directory contains a minimal CLI/API workflow for creating local map packages.

Related documents:

- [../docs/DATA.md](../docs/DATA.md) for data layers, storage locations, generated artifacts, and credentials.
- [../docs/USE_CASES.md](../docs/USE_CASES.md) for user-facing data workflows.
- [../docs/PRODUCT.md](../docs/PRODUCT.md) for product scope and data-format contracts.

V1 is intentionally simple:

```text
GPX route or bbox
  -> corridor/area
  -> base PMTiles extract
  -> optional Finnish provider overlay PMTiles
```

`extract-route-map.mjs` does not build map tiles from raw OSM/NLS/Digiroad data. It extracts a smaller package from an existing PMTiles archive.

`build-finnish-map.mjs` wraps the base extractor and downloads Finnish provider data for the same bbox or route corridor:

```text
GPX route or bbox
  -> base PMTiles extract
  -> Digiroad WFS download
  -> optional NLS OGC API Features download
  -> normalized LiteGPX GeoJSON layers
  -> provider overlay PMTiles package
```

Current mobile/web packages use two files: the base Protomaps corridor extract and a separate Finnish provider overlay PMTiles beside it. Android loads `finland.providers.pmtiles` over `finland.pmtiles` when both are bundled. The service also writes `shared/maps/manifest.json` when saving to mobile so Android can detect app-updated bundled maps and refresh its copied runtime files.

## Code Starting Points

- `server.mjs` exposes the local HTTP API: `GET /api/datasets`, `GET /api/base-map-source`, `GET /api/mobile-routes`, `GET /api/mobile-routes/:id`, `DELETE /api/mobile-routes/:id`, `POST /api/extract-bbox`, and `POST /api/save-mobile-route`.
- `server.mjs` writes `shared/maps/manifest.json` through `buildBundledMapManifest` after a mobile save.
- `extract-route-map.mjs` wraps `pmtiles extract` for GPX route corridors and bboxes.
- `build-finnish-map.mjs` downloads/normalizes Finnish provider data and builds provider overlay PMTiles.
- `tests/fixtures/nls/` contains local NLS GeoJSON fixtures for smoke checks.

## Requirements

- Node.js 18+
- npm dependencies installed in `mapdataservice/`
- `pmtiles` CLI
- `sqlite3` CLI for Finnish-provider MBTiles assembly before PMTiles conversion

On macOS:

```sh
brew install pmtiles
```

Install the service-local npm dependencies:

```sh
cd mapdataservice
npm install
cd ..
```

## Source PMTiles

By default the script reads from a full remote Protomaps z15 build:

```text
https://build.protomaps.com/20260716.pmtiles
```

At runtime, `protomaps` and `protomaps-latest` resolve through `https://build-metadata.protomaps.dev/builds.json` and fall back to the URL above if the metadata lookup fails. This lets the service download only the byte ranges needed for the produced route dataset.

For local extraction from the ignored workspace map file, pass:

```sh
--source local
```

That resolves to:

```text
shared/maps/finland.pmtiles
```

Important: the source archive must contain the layer names expected by `shared/styles/style_template.json`, including:

- `landcover`
- `water`
- `buildings`
- `roads`
- `pois`

If the source PMTiles uses another schema, the mobile and web styles may render blank or incomplete maps.

## Usage

From the workspace root:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes/hameen-harkatie.gpx \
  --buffer-meters 10000 \
  --coverage corridor \
  --out mapdataservice/output/hameen-harkatie.pmtiles
```

The output can be copied into the mobile app through its existing map import flow, or bundled locally as a map package.

To extract a rectangle drawn in the web app or copied from the map:

```sh
node mapdataservice/extract-route-map.mjs \
  --bbox 24.930000,60.160000,24.940000,60.170000 \
  --name helsinki-test-area
```

To regenerate the bundled base map covering all mobile routes:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --maxzoom 15 \
  --out shared/maps/finland.pmtiles \
  --force
```

To regenerate the bundled Finnish provider overlay for all mobile routes:

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

Both files are ignored by Git because they are generated artifacts.

## Finnish Provider Builder

Use this when the map service should fetch Finnish source data for the same area as the LiteGPX map package:

```sh
node mapdataservice/build-finnish-map.mjs \
  --gpx mobile/app/src/main/assets/routes/poutamaentie-15-to-papinmaentie-31.gpx \
  --buffer-meters 1000 \
  --coverage corridor \
  --providers digiroad,nls
```

For a rectangle:

```sh
node mapdataservice/build-finnish-map.mjs \
  --bbox 24.840000,60.210000,24.880000,60.230000 \
  --name helsinki-provider-test \
  --providers digiroad
```

Provider details:

- Digiroad uses the open WFS endpoint and needs no authentication.
- NLS Topographic Database OGC API Features requires an API key. Put `NLS_API_KEY=<key>` in the workspace root `.env`, pass `--nls-api-key <key>`, or export `NLS_API_KEY=<key>`.
- For local NLS exports or tests, pass `--nls-geojson-dir <dir>`. The directory must contain `tieviiva.geojson` and `rakennus.geojson` as GeoJSON FeatureCollections. The builder filters those files to the requested bbox/corridor before normalizing.
- If `--providers` is omitted, the builder uses `digiroad` by default, or `digiroad,nls` when `NLS_API_KEY` is set.
- When a GPX directory is used, provider downloads are made per route corridor and then deduplicated, so the service does not request one huge combined bbox.
- Generated raw provider downloads are cached under `mapdataservice/cache/finnish-providers/`.
- Normalized output is written under `mapdataservice/output/.work/finnish-providers/<dataset>.providers/`.
- The generated provider overlay PMTiles is written under `mapdataservice/output/<dataset>-finnish-<hash>.pmtiles`.
- Use `--download-only` when you only want the raw and normalized GeoJSON provider files.
- Provider downloads page through OGC `next` links and WFS `startIndex` pages so larger bboxes are not silently truncated by one response limit.
- Full all-route provider builds can normalize hundreds of MB of GeoJSON. Use `NODE_OPTIONS=--max-old-space-size=12288` if Node runs out of heap.

Normalized layers currently target the same source-layer names used by `shared/styles/style_template.json`:

```text
Digiroad dr_tielinkki_tielinkin_tyyppi -> roads
NLS tieviiva                           -> roads
NLS rakennus                           -> buildings
```

The provider GeoJSON and PMTiles use LiteGPX/Protomaps-compatible properties such as `kind`, `kind_detail`, `name`, and `name:fi`, so the existing Android and web styles can render the data once the apps load the provider PMTiles as an overlay source.

Local NLS fixture smoke test:

```sh
node mapdataservice/build-finnish-map.mjs \
  --bbox 24.840000,60.210000,24.880000,60.230000 \
  --name nls-fixture-smoke \
  --source local \
  --providers nls \
  --nls-geojson-dir mapdataservice/tests/fixtures/nls \
  --force
```

## Web App Service

The desktop web app can ask the local service to extract a drawn rectangle:

```sh
node mapdataservice/server.mjs
```

The service listens on:

```text
http://localhost:5174/api/health
```

The web app posts selected rectangles to `POST /api/extract-bbox`. The service runs the same CLI, writes to `mapdataservice/output/`, and returns a PMTiles URL served by the web dev server. It also builds a Finnish provider overlay PMTiles for the same bbox and returns it under the response `provider` object.

Provider options accepted by `POST /api/extract-bbox` and `POST /api/save-mobile-route`:

```json
{
  "providers": "digiroad,nls",
  "mapScope": "all-routes",
  "nlsGeojsonDir": "mapdataservice/tests/fixtures/nls",
  "nlsApiKey": "optional-api-key"
}
```

The local API service defaults to `digiroad` for interactive web requests. Pass `"providers": "digiroad,nls"` or set `TRAILLITE_FINNISH_PROVIDERS=digiroad,nls` when NLS enrichment is wanted. `nlsGeojsonDir` can also be set for the service process with `TRAILLITE_NLS_GEOJSON_DIR`. `NLS_API_KEY` is read from the workspace root `.env` by both the CLI and local API service, but it does not opt web API requests into NLS by itself.

The web app also reads:

```text
GET /api/datasets
GET /api/base-map-source
```

That endpoint lists every `.pmtiles` package already stored under `mapdataservice/output/` with URL, size, bbox, and cache metadata where available. On startup the web app uses this list so previously downloaded rectangle/corridor datasets are added back to the map as detail overlays. Rectangle downloads now appear as two entries with the same bbox: the base extracted PMTiles and the Finnish provider overlay PMTiles.

`GET /api/base-map-source` returns the current Protomaps build URL from the Protomaps build metadata feed, with the documented fallback URL if the metadata feed is unavailable.

The web app can also load routes already bundled into the local Android workspace:

```text
GET /api/mobile-routes
GET /api/mobile-routes/:id
DELETE /api/mobile-routes/:id
```

Those endpoints let the desktop web app list the bundled Android route catalog and load a selected GPX route from `mobile/app/src/main/assets/routes/` for view/edit workflows. Route loading only reads files under the mobile routes asset directory.

The delete endpoint removes the route from `routes.json` and deletes its GPX asset when no remaining catalog entry references the same file. This mutates the local Android workspace.

The web app can also save the current route directly into the local Android workspace:

```text
POST /api/save-mobile-route
```

The request body contains a route name and GPX text. When the web app is saving a route loaded from the Android catalog, it also sends `routeId`; the service reuses that catalog id and GPX asset path so a rename updates the same mobile route instead of creating a duplicate. The service then:

- writes the GPX to `mobile/app/src/main/assets/routes/<route>.gpx`
- upserts the route in `mobile/app/src/main/assets/routes/routes.json`
- extracts a corridor map package with `--coverage corridor --buffer-meters 1000 --maxzoom 15` from all bundled GPX files by default
- copies the generated PMTiles to `shared/maps/finland.pmtiles`, which the Android Gradle asset source set bundles as `maps/finland.pmtiles`
- builds a Finnish provider overlay PMTiles for the same all-route corridor set and copies it to `shared/maps/finland.providers.pmtiles`
- writes `shared/maps/manifest.json` with file sizes and SHA-256 hashes for both bundled PMTiles files

By default the save endpoint builds the provider overlay with Digiroad and reuses the newly generated bundled base PMTiles as the provider builder source. This keeps the web save action from doing a second remote Protomaps extraction or an all-route NLS build just because `NLS_API_KEY` exists. Override with request `"providers": "digiroad,nls"` or `TRAILLITE_FINNISH_PROVIDERS=digiroad,nls` when the mobile bundle should include NLS data.

The default `mapScope` is `all-routes`, which means the saved route is added first and then the bundled mobile map packages are rebuilt from `mobile/app/src/main/assets/routes/`. This prevents a new saved route from shrinking close-zoom offline map coverage for existing routes. Pass `"mapScope": "route"` only for an intentional single-route extraction.

This endpoint mutates local workspace files. It is for local development, not a public web deployment.

## Dry Run

Use `--dry-run` to inspect the route bounds and generated command without creating a PMTiles file:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx web/tests/fixtures/simple-route.gpx \
  --buffer-meters 5000 \
  --dry-run
```

## Options

```text
--gpx, -g             GPX route file or directory of .gpx files.
--bbox                Rectangle as minLon,minLat,maxLon,maxLat.
--name                Output name prefix for bbox extracts.
--source, -s          Source PMTiles archive or URL.
--out, -o             Output PMTiles path.
--buffer-meters       Padding around route bounds. Default: 10000.
--coverage            bbox, route-bboxes, or corridor. Default: corridor.
--minzoom             Optional pmtiles extract minimum zoom.
--maxzoom             Optional pmtiles extract maximum zoom. Default: 15.
--force               Overwrite existing output.
--dry-run             Print metadata and command only.
```

## Output Metadata

For every generated PMTiles file, the script writes a sidecar JSON file:

```text
<output>.pmtiles.json
```

It records:

- content-based cache key
- source PMTiles path or URL
- GPX input path
- raw route bounds
- padded route bounds
- bbox passed to `pmtiles extract`
- region GeoJSON path when using `route-bboxes` or `corridor`
- buffer distance
- generated command

## Cache

Generated data belongs in:

```text
mapdataservice/output/
```

Default output names include a short hash. The hash covers source, zooms, bbox/route geometry, buffer, coverage mode, and GPX file content where applicable. If the same output already exists and the sidecar cache key matches, the extractor reuses it instead of downloading more data. Pass `--force` only when intentionally replacing an existing package.
