# TrailLite Map Data Service

This directory contains a minimal CLI/API workflow for creating local map packages.

V1 is intentionally simple:

```text
GPX route or bbox -> corridor/area -> pmtiles extract -> cached PMTiles
```

The script does not build map tiles from raw OSM/NLS/Digiroad data yet. It extracts a smaller package from an existing PMTiles archive.

## Requirements

- Node.js 18+
- `pmtiles` CLI

On macOS:

```sh
brew install pmtiles
```

## Source PMTiles

By default the script reads from a full remote Protomaps z15 build:

```text
https://build.protomaps.com/20260703.pmtiles
```

This lets the service download only the byte ranges needed for the produced route dataset.

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

To create one initial dataset covering all bundled mobile routes:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --out mapdataservice/output/mobile-bundled-routes.pmtiles
```

The current generated initial dataset is:

```text
mapdataservice/output/mobile-bundled-routes.pmtiles
```

It was produced from the bundled mobile routes with a 1000 m corridor buffer and max zoom 15.

## Web App Service

The desktop web app can ask the local service to extract a drawn rectangle:

```sh
node mapdataservice/server.mjs
```

The service listens on:

```text
http://localhost:5174/api/health
```

The web app posts selected rectangles to `POST /api/extract-bbox`. The service runs the same CLI, writes to `mapdataservice/output/`, and returns a PMTiles URL served by the web dev server.

The web app also reads:

```text
GET /api/datasets
```

That endpoint lists every `.pmtiles` package already stored under `mapdataservice/output/` with URL, size, bbox, and cache metadata where available. On startup the web app uses this list so previously downloaded rectangle/corridor datasets are added back to the map as detail overlays.

The web app can also save the current route directly into the local Android workspace:

```text
POST /api/save-mobile-route
```

The request body contains a route name and GPX text. The service then:

- writes the GPX to `mobile/app/src/main/assets/routes/<route>.gpx`
- upserts the route in `mobile/app/src/main/assets/routes/routes.json`
- extracts a corridor map package with `--coverage corridor --buffer-meters 1000 --maxzoom 15`
- copies the generated PMTiles to `shared/maps/finland.pmtiles`, which the Android Gradle asset source set bundles as `maps/finland.pmtiles`

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

## Later Pipeline

The intended future service shape is:

```text
GPX route
  -> route corridor or bbox
  -> OSM Finland extract
  -> optional Digiroad enrichment
  -> optional NLS topographic enrichment
  -> TrailLite vector tile schema
  -> PMTiles
```

Keep that as a server/tooling concern. The Android app should only download or import the resulting `.pmtiles` file.
