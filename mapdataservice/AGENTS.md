# Map Data Service Notes

This directory contains local CLI/API tooling for LiteGPX map package generation.

## Read First

- Workspace rules: `../AGENTS.md`
- Product/data contracts: `../docs/PRODUCT.md`, `../docs/DATA.md`, `../docs/FEATURES.md`
- Command reference: `README.md`

## Service Boundaries

- Keep external map/provider downloads here, not in Android.
- `extract-route-map.mjs` extracts smaller PMTiles packages from an existing PMTiles source.
- `build-finnish-map.mjs` builds Finnish provider overlays from Digiroad and optional NLS data.
- `server.mjs` is a local development API, not a public service.
- `POST /api/save-mobile-route` mutates the Android workspace and shared generated map files.

## Artifacts

- Generated packages go under `output/`.
- Provider caches go under `cache/finnish-providers/`.
- Shared Android bundle outputs go under `../shared/maps/`.
- Do not stage generated PMTiles, provider cache files, or `.env`.
- Route GPX assets and `mobile/app/src/main/assets/routes/routes.json` are source data and can be committed when route changes are intentional.

## Credentials

- Digiroad needs no credentials.
- NLS requires `NLS_API_KEY` through a CLI/API option, process environment, or workspace root `.env`.
- Do not commit credentials.

## Core Commands

Run from the workspace root unless a command says otherwise.

```sh
cd mapdataservice
npm install
npm test
```

```sh
node mapdataservice/server.mjs
```

```sh
node mapdataservice/extract-route-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --maxzoom 15 \
  --out shared/maps/finland.pmtiles
```

```sh
NODE_OPTIONS=--max-old-space-size=12288 node mapdataservice/build-finnish-map.mjs \
  --gpx mobile/app/src/main/assets/routes \
  --buffer-meters 1000 \
  --coverage corridor \
  --source local \
  --maxzoom 15 \
  --providers digiroad,nls \
  --out shared/maps/finland.providers.pmtiles
```

## Verification

- Run `npm test` in `mapdataservice/` for service unit checks.
- For web API workflows, keep `node mapdataservice/server.mjs` running and use the relevant web manual script.
- Check `git status --short` before staging; service runs often create ignored and untracked local artifacts.
