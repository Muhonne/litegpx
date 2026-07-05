# TrailLite Web

Technical notes for running, building, and testing the desktop GPX Builder.

Product scope and behavior live at the workspace root:

- [../PRODUCT.md](../PRODUCT.md)
- [../USE_CASES.md](../USE_CASES.md)
- [../DATA.md](../DATA.md)

## Stack

- Static HTML
- Plain CSS
- Plain JavaScript ES modules
- MapLibre GL JS
- PMTiles browser protocol
- npm scripts for local serving, build, and manual checks

Code starting points:

- `index.html` for the app shell.
- `src/app.js` for map setup, route editing, GPX import/export, map data service calls, and test hooks.
- `src/styles.css` for the sidebar/map UI.
- `scripts/serve.mjs` for the local static server.
- `scripts/build.mjs` for static build output.
- `tests/manual/` for agent-browser-compatible manual checks.

## Install

From this directory:

```sh
npm install
```

## Run

From this directory:

```sh
npm run serve
```

Default local URL:

```text
http://localhost:5173/web/
```

The map data service is separate. Start it from the workspace root when testing area downloads, save-to-mobile, or loading routes already bundled in the Android workspace:

```sh
node mapdataservice/server.mjs
```

## Build

From this directory:

```sh
npm run build
```

Build output:

```text
web/dist/
```

## Manual Checks

Run all web manual checks:

```sh
npm test
```

Individual checks live under `tests/manual/`, for example:

```sh
bash tests/manual/00-map-foundation.sh
bash tests/manual/05-map-tools.sh
bash tests/manual/09-route-draw-mouseup.sh
```

`03-basic-editing.sh` covers imported route editing and newest-first point list behavior.
`05-map-tools.sh` covers layer toggles, area selection, and the area-download busy button state.
`07-polish-controls-shortcuts-data.sh` covers compact route controls, edit-mode shortcuts, and 10-step undo/redo history.
`09-route-draw-mouseup.sh` covers drag-to-draw and verifies editing can be toggled off/on without breaking drawing.
`11-mobile-route-management.sh` covers filtering bundled mobile routes, loading a selected route into the editor, preserving mobile route identity on save, and showing saved/unsaved mobile edit state.
These checks use `agent-browser`, so keep the web server running before running individual scripts.
