#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { buildBundledMapManifest, mobileMapGpxInput } from "../server.mjs";

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
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
