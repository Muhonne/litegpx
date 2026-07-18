# LiteGPX Map Data Service

Local CLI/API tooling for creating LiteGPX PMTiles packages.

Related docs:

- [../docs/PRODUCT.md](../docs/PRODUCT.md) for product contract and non-goals.
- [../docs/FEATURES.md](../docs/FEATURES.md) for feature scenarios.
- [../docs/DATA.md](../docs/DATA.md) for ownership, generated artifacts, and credentials.

## What It Does

```text
GPX route or bbox
  -> corridor/area
  -> base PMTiles extract
  -> optional Finnish provider overlay PMTiles
```

- `extract-route-map.mjs` extracts smaller PMTiles packages from an existing PMTiles source.
- `build-finnish-map.mjs` builds Finnish provider overlays from Digiroad and optional NLS data.
- `server.mjs` exposes the local API used by the web app.
- The service writes generated data under `mapdataservice/output/`; those files are ignored by Git.
- The save-to-mobile API rebuilds Android route corridor packages under `shared/maps/` and updates `shared/maps/manifest.json`.

## Requirements

- Node.js 18+
- `pmtiles` CLI
- `sqlite3` CLI for Finnish provider overlay packaging
- service-local npm dependencies

```sh
brew install pmtiles sqlite
cd mapdataservice
npm install
```

## Source PMTiles

Default source:

```text
https://build.protomaps.com/20260716.pmtiles
```

The `protomaps` and `protomaps-latest` aliases resolve the current build through Protomaps build metadata and fall back to the URL above.

To extract from the ignored local workspace map:

```sh
--source local
```

That resolves to:

```text
shared/maps/finland.pmtiles
```

The source PMTiles must contain the layer names expected by `shared/styles/style_template.json`.

## CLI

Run commands from the workspace root.

Extract a route corridor:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes/hameen-harkatie.gpx \
  --buffer-meters 10000 \
  --coverage corridor \
  --out mapdataservice/output/hameen-harkatie.pmtiles
```

Extract a selected rectangle:

```sh
node mapdataservice/extract-route-map.mjs \
  --bbox 24.930000,60.160000,24.940000,60.170000 \
  --name helsinki-test-area
```

Regenerate the bundled Android base map for all bundled routes:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --maxzoom 15 \
  --out shared/maps/finland.pmtiles \
  --force
```

Build the bundled Finnish provider overlay:

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

Useful dry run:

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx web/tests/fixtures/simple-route.gpx \
  --buffer-meters 5000 \
  --dry-run
```

## Provider Builds

Digiroad requires no credentials. NLS requires `NLS_API_KEY` through a CLI option, API request, process environment, or workspace root `.env`.

Local NLS fixture smoke command:

```sh
node mapdataservice/build-finnish-map.mjs \
  --bbox 24.840000,60.210000,24.880000,60.230000 \
  --name nls-fixture-smoke \
  --source local \
  --providers nls \
  --nls-geojson-dir mapdataservice/tests/fixtures/nls \
  --force
```

Provider options:

- `--providers digiroad,nls`
- `--nls-api-key <key>`
- `--nls-geojson-dir <dir>`
- `--download-only`

Provider downloads page through source API pagination. Full all-route provider builds can normalize hundreds of MB of GeoJSON; use the larger `NODE_OPTIONS` heap shown above when needed.

## Local API

Start the service:

```sh
node mapdataservice/server.mjs
```

Health check:

```text
GET http://localhost:5174/api/health
```

Endpoints:

- `GET /api/datasets` lists generated PMTiles packages in `mapdataservice/output/`.
- `GET /api/base-map-source` resolves the Protomaps planning base URL.
- `GET /api/mobile-routes` lists bundled Android route catalog entries.
- `GET /api/mobile-routes/:id` returns one bundled route plus GPX text.
- `DELETE /api/mobile-routes/:id` removes one bundled route and its unshared GPX asset.
- `POST /api/extract-bbox` extracts base and provider PMTiles for a web-selected rectangle.
- `POST /api/save-mobile-route` writes the current web route into Android assets and regenerates shared map packages.

Provider options accepted by `POST /api/extract-bbox` and `POST /api/save-mobile-route`:

```json
{
  "providers": "digiroad,nls",
  "mapScope": "all-routes",
  "nlsGeojsonDir": "mapdataservice/tests/fixtures/nls",
  "nlsApiKey": "optional-api-key"
}
```

`POST /api/save-mobile-route` defaults to `mapScope: "all-routes"` so one saved route does not shrink offline coverage for existing bundled routes. Use `mapScope: "route"` only for intentional single-route map packages.

This API mutates local workspace files. It is for local development, not public deployment.

## Outputs And Cache

- Base PMTiles: `mapdataservice/output/<name>-<hash>.pmtiles`
- Provider PMTiles: `mapdataservice/output/<name>-finnish-<hash>.pmtiles`
- Sidecar metadata: `<output>.pmtiles.json`
- Corridor region debug GeoJSON: `<output>.pmtiles.region.geojson`
- Provider cache: `mapdataservice/cache/finnish-providers/`
- Provider work files: `mapdataservice/output/.work/finnish-providers/`

Default output names include a short content hash. Matching existing outputs are reused unless `--force` is passed.

## Tests

```sh
cd mapdataservice
npm test
```
