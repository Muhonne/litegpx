#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  buildBundledMapManifest,
  deleteMobileRoute,
  mobileProviderOverlayConfig,
  mobileRouteSaveTarget,
  mobileMapGpxInput,
  providerList,
  readMobileRouteCatalog,
  readMobileRouteGpx,
} from "../server.mjs";

const tempDir = await mkdtemp(resolve(tmpdir(), "traillite-map-manifest-"));

try {
  const base = resolve(tempDir, "finland.pmtiles");
  const provider = resolve(tempDir, "finland.providers.pmtiles");
  await writeFile(base, "base corridor data");
  await writeFile(provider, "provider corridor data");

  const manifest = await buildBundledMapManifest([
    { name: "finland.pmtiles", path: base },
    { name: "finland.providers.pmtiles", path: provider },
  ]);

  assert.equal(manifest.version, 1);
  assert.equal(manifest.files.length, 2);
  assert.deepEqual(
    manifest.files.map((file) => file.name),
    ["finland.pmtiles", "finland.providers.pmtiles"],
  );
  assert.ok(manifest.files.every((file) => file.sizeBytes > 0), "manifest records file sizes");
  assert.ok(
    manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)),
    "manifest records sha256 hashes",
  );

  assert.equal(
    mobileMapGpxInput({
      body: {},
      savedRoutePath: resolve(tempDir, "routes/new-route.gpx"),
      routesDir: resolve(tempDir, "routes"),
    }),
    resolve(tempDir, "routes"),
    "save-to-mobile should rebuild bundled map data from every bundled route by default",
  );
  assert.equal(
    mobileMapGpxInput({
      body: { mapScope: "route" },
      savedRoutePath: resolve(tempDir, "routes/new-route.gpx"),
      routesDir: resolve(tempDir, "routes"),
    }),
    resolve(tempDir, "routes/new-route.gpx"),
    "route-scoped map extraction should remain available as an explicit option",
  );
  assert.equal(
    providerList({}, { env: { NLS_API_KEY: "secret" } }),
    "digiroad",
    "service provider builds should not opt into NLS just because a key is configured",
  );
  assert.equal(
    providerList({}, { env: { NLS_API_KEY: "secret", TRAILLITE_FINNISH_PROVIDERS: "digiroad,nls" } }),
    "digiroad,nls",
    "service provider builds should honor explicit provider overrides",
  );
  assert.deepEqual(
    mobileProviderOverlayConfig({
      body: { source: "protomaps" },
      bundledMapPath: resolve(tempDir, "finland.pmtiles"),
      env: { NLS_API_KEY: "secret" },
    }),
    {
      source: resolve(tempDir, "finland.pmtiles"),
      providers: "digiroad",
    },
    "mobile provider overlays should reuse the generated bundled base map and default to Digiroad",
  );

  const routesDir = resolve(tempDir, "routes");
  await mkdir(routesDir, { recursive: true });
  const routeGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg><trkpt lat="60.1" lon="24.1" /><trkpt lat="60.2" lon="24.2" /></trkseg></trk>
</gpx>`;
  await writeFile(resolve(routesDir, "test-route.gpx"), routeGpx, "utf8");
  const catalogPath = resolve(routesDir, "routes.json");
  await writeFile(catalogPath, JSON.stringify([
    {
      id: "test-route",
      title: "Test route",
      lengthKm: 1.2,
      durationText: "--",
      source: "LiteGPX",
      gpxAsset: "routes/test-route.gpx",
      bounds: { minLon: 24.1, minLat: 60.1, maxLon: 24.2, maxLat: 60.2 },
      trackPointCount: 2,
    },
  ]), "utf8");

  const routes = await readMobileRouteCatalog({ catalogPath, routesDir });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].id, "test-route");
  assert.equal(routes[0].sizeBytes, Buffer.byteLength(routeGpx));
  assert.ok(routes[0].updatedAt, "mobile route listing includes file timestamp");

  const loadedRoute = await readMobileRouteGpx({ id: "test-route", catalogPath, routesDir });
  assert.equal(loadedRoute.route.title, "Test route");
  assert.equal(loadedRoute.gpx, routeGpx);

  const saveTarget = await mobileRouteSaveTarget({
    routeId: "test-route",
    routeName: "Renamed Test Route",
    catalogPath,
    routesDir,
  });
  assert.equal(saveTarget.id, "test-route");
  assert.equal(saveTarget.title, "Renamed Test Route");
  assert.equal(saveTarget.gpxFile, "test-route.gpx");
  assert.equal(saveTarget.gpxAsset, "routes/test-route.gpx");

  const deleteResult = await deleteMobileRoute({ id: "test-route", catalogPath, routesDir });
  assert.equal(deleteResult.route.id, "test-route");
  assert.equal(deleteResult.deletedGpx, true);
  await assert.rejects(
    () => readFile(resolve(routesDir, "test-route.gpx"), "utf8"),
    /ENOENT/,
    "route GPX asset should be removed",
  );
  assert.deepEqual(
    JSON.parse(await readFile(catalogPath, "utf8")),
    [],
    "route catalog should drop the deleted route",
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
