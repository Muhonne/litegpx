#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");
loadDotEnv(resolve(workspaceRoot, ".env"));

const EARTH_RADIUS_METERS = 6371000;
const extractor = resolve(scriptDir, "extract-route-map.mjs");
const cacheDir = resolve(scriptDir, "cache/finnish-providers");
const workDir = resolve(scriptDir, "output/.work/finnish-providers");
const outputDir = resolve(scriptDir, "output");

const digiroadWfs = "https://avoinapi.vaylapilvi.fi/vaylatiedot/digiroad/wfs";
const nlsFeatures = "https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1";

const defaultProviders = ["digiroad", "nls"];
const nlsCollections = [
  { id: "tieviiva", layer: "roads" },
  { id: "rakennus", layer: "buildings" },
];

main();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.gpx && !options.bbox) {
    fail("Missing --gpx <file-or-directory> or --bbox <minLon,minLat,maxLon,maxLat>.");
  }

  const requestedProviders = options.providers || (process.env.NLS_API_KEY ? defaultProviders.join(",") : "digiroad");
  const providers = parseProviders(requestedProviders);
  const baseMetadata = getBaseMetadata(options);
  const bbox = baseMetadata.route?.bbox || baseMetadata.area?.bbox;
  if (!bbox) fail("Could not resolve extraction bbox from base metadata.");
  const providerAreas = providerAreasFromMetadata(baseMetadata);

  const cacheKey = hashJson({
    kind: "finnish-provider-map",
    baseCacheKey: baseMetadata.cacheKey,
    bbox,
    providerAreas,
    providers,
    maxzoom: options.maxzoom || "15",
    nlsGeojsonDir: options.nlsGeojsonDir ? resolve(options.nlsGeojsonDir) : null,
    nlsGeojsonSignature: nlsGeojsonSignature(options.nlsGeojsonDir),
    nlsCollections,
  });
  const finalPath = resolveOutputPath(options.output, baseMetadata, cacheKey);
  const basePath = resolve(workDir, `${basename(finalPath, ".pmtiles")}.base.pmtiles`);
  const providerDir = resolve(workDir, `${basename(finalPath, ".pmtiles")}.providers`);
  const metadataPath = `${finalPath}.json`;
  const nlsApiKey = options.nlsApiKey || process.env.NLS_API_KEY || "";

  const plan = {
    generatedAt: new Date().toISOString(),
    cacheKey,
    bbox,
    providerAreas,
    providers,
    ...(baseMetadata.area ? { area: { ...baseMetadata.area, providerOverlay: true } } : {}),
    ...(baseMetadata.route ? { route: { ...baseMetadata.route, providerOverlay: true } } : {}),
    base: {
      source: baseMetadata.source,
      output: basePath,
      metadata: baseMetadata,
    },
    providerData: {
      cacheDir,
      outputDir: providerDir,
      normalized: {
        roads: resolve(providerDir, "roads.geojson"),
        buildings: resolve(providerDir, "buildings.geojson"),
      },
    },
    output: {
      providerPmtiles: finalPath,
      metadata: metadataPath,
    },
    tooling: toolReport(),
  };

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (providers.includes("nls") && !nlsApiKey && !options.nlsGeojsonDir) {
    fail("NLS provider requested but neither NLS_API_KEY nor --nls-geojson-dir is set.");
  }

  if (useCachedOutput(finalPath, metadataPath, cacheKey, options.force)) return;
  if (options.force) {
    if (existsSync(finalPath)) rmSync(finalPath);
    if (existsSync(metadataPath)) rmSync(metadataPath);
  }

  mkdirSync(workDir, { recursive: true });
  mkdirSync(providerDir, { recursive: true });
  runBaseExtraction(options, basePath);

  const providerFeatures = await fetchProviderFeatures({
    providerAreas,
    providers,
    nlsApiKey,
    nlsGeojsonDir: options.nlsGeojsonDir,
    force: Boolean(options.force),
  });
  const normalized = normalizeProviderFeatures(providerFeatures);
  writeGeoJson(resolve(providerDir, "roads.geojson"), normalized.roads);
  writeGeoJson(resolve(providerDir, "buildings.geojson"), normalized.buildings);

  plan.providerData.counts = {
    raw: Object.fromEntries(Object.entries(providerFeatures).map(([key, value]) => [key, value.features.length])),
    roads: normalized.roads.features.length,
    buildings: normalized.buildings.features.length,
  };

  if (options.downloadOnly) {
    mkdirSync(dirname(metadataPath), { recursive: true });
    writeFileSync(metadataPath, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(`Wrote provider data under ${providerDir}`);
    console.log(`Wrote ${metadataPath}`);
    return;
  }

  assertProviderTileTools(plan.tooling);
  const providerBuild = buildProviderPmtiles({
    normalized,
    bbox,
    providerAreas,
    maxzoom: Number(options.maxzoom || "15"),
    pmtilesPath: finalPath,
    workPath: resolve(providerDir, "provider.mbtiles"),
    tileDir: resolve(providerDir, "tiles"),
  });
  plan.output.providerPmtiles = finalPath;
  plan.providerData.tileBuild = providerBuild;
  mkdirSync(dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Wrote provider data under ${providerDir}`);
  console.log(`Wrote ${finalPath}`);
  console.log(`Wrote ${metadataPath}`);
}

async function fetchProviderFeatures({ providerAreas, providers, nlsApiKey, nlsGeojsonDir, force }) {
  const output = {};
  if (providers.includes("digiroad")) {
    output.digiroadRoads = await fetchProviderAreaGeoJson({
      name: "digiroad-roads",
      providerAreas,
      urlForBbox: digiroadUrl,
      pageSize: 50000,
      force,
    });
  }

  if (providers.includes("nls")) {
    if (nlsGeojsonDir) {
      output["nls-tieviiva"] = readLocalNlsGeoJson(nlsGeojsonDir, "tieviiva", providerAreas);
      output["nls-rakennus"] = readLocalNlsGeoJson(nlsGeojsonDir, "rakennus", providerAreas);
      return output;
    }
    if (!nlsApiKey) {
      fail("NLS provider requested but neither NLS_API_KEY nor --nls-geojson-dir is set.");
    }
    for (const collection of nlsCollections) {
      output[`nls-${collection.id}`] = await fetchProviderAreaGeoJson({
        name: `nls-${collection.id}`,
        providerAreas,
        urlForBbox: (bbox) => nlsUrl(collection.id, bbox, nlsApiKey),
        authorization: basicAuth(nlsApiKey),
        pageSize: 10000,
        force,
      });
    }
  }
  return output;
}

function providerAreasFromMetadata(metadata) {
  if (metadata.area?.bbox) {
    return [{ id: slugify(metadata.area.name || "selected-area"), bbox: metadata.area.bbox }];
  }
  if (!metadata.route?.files?.length) return [{ id: "route-area", bbox: metadata.route?.bbox }];
  const bufferMeters = Number(metadata.route.bufferMeters || 0);
  return metadata.route.files
    .filter((file) => file.rawBounds)
    .map((file, index) => ({
      id: `${String(index + 1).padStart(3, "0")}-${slugify(basename(file.gpx || `route-${index + 1}`))}`,
      bbox: formatBounds(bufferedBoundsFromRaw(file.rawBounds, bufferMeters)),
      source: basename(file.gpx || ""),
    }));
}

function readLocalNlsGeoJson(directory, collection, providerAreas) {
  const areas = providerAreas.map((area) => ({ ...area, bounds: parseBboxString(area.bbox) }));
  const path = resolve(directory, `${collection}.geojson`);
  if (!existsSync(path)) fail(`Local NLS GeoJSON not found: ${path}`);
  const geojson = readGeoJson(path);
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    fail(`Local NLS file must be a GeoJSON FeatureCollection: ${path}`);
  }
  return {
    type: "FeatureCollection",
    features: dedupeFeatures(geojson.features.filter((feature) => (
      areas.some((area) => geometryIntersectsBounds(feature.geometry, area.bounds))
    ))),
  };
}

async function fetchProviderAreaGeoJson({ name, providerAreas, urlForBbox, authorization, pageSize, force }) {
  const collections = [];
  for (const area of providerAreas) {
    collections.push(await fetchCachedGeoJson({
      name: `${name}-${area.id}`,
      url: urlForBbox(area.bbox),
      authorization,
      pageSize,
      force,
    }));
  }
  return mergeFeatureCollections(collections);
}

async function fetchCachedGeoJson({ name, url, authorization, pageSize, force }) {
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = resolve(cacheDir, `${name}-${hashText(url).slice(0, 12)}.geojson`);
  if (!force && existsSync(cachePath)) return readGeoJson(cachePath);

  const merged = { type: "FeatureCollection", features: [] };
  let nextUrl = url;
  let page = 0;
  while (nextUrl) {
    page += 1;
    if (page > 200) fail(`${name} exceeded 200 pages; narrow the bbox or route corridor.`);
    const response = await fetch(nextUrl, {
      headers: authorization ? { Authorization: authorization } : undefined,
    });
    if (!response.ok) {
      fail(`${name} download failed: HTTP ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
      fail(`${name} did not return a GeoJSON FeatureCollection.`);
    }
    merged.features.push(...json.features);
    nextUrl = nextGeoJsonPageUrl(json) || nextWfsPageUrl(nextUrl, json.features.length, pageSize);
  }
  writeGeoJson(cachePath, merged);
  return merged;
}

function mergeFeatureCollections(collections) {
  return {
    type: "FeatureCollection",
    features: dedupeFeatures(collections.flatMap((collection) => collection.features || [])),
  };
}

function dedupeFeatures(features) {
  const seen = new Set();
  const unique = [];
  for (const feature of features) {
    const key = featureIdentity(feature);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(feature);
  }
  return unique;
}

function featureIdentity(feature) {
  const properties = feature.properties || {};
  return [
    feature.id,
    properties.mtk_id,
    properties.link_id,
    properties.link_mmlid,
    properties.kohdeluokka,
    JSON.stringify(feature.geometry),
  ].filter((part) => part != null && part !== "").join("|");
}

function digiroadUrl(bbox) {
  const url = new URL(digiroadWfs);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "digiroad:dr_tielinkki_tielinkin_tyyppi");
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("bbox", `${bbox},EPSG:4326`);
  url.searchParams.set("count", "50000");
  return url.toString();
}

function nlsUrl(collection, bbox, apiKey) {
  const url = new URL(`${nlsFeatures}/collections/${collection}/items`);
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("limit", "10000");
  url.searchParams.set("api-key", apiKey);
  return url.toString();
}

function nextGeoJsonPageUrl(json) {
  const nextLink = Array.isArray(json.links)
    ? json.links.find((link) => String(link.rel || "").toLowerCase() === "next" && link.href)
    : null;
  return nextLink?.href || null;
}

function nextWfsPageUrl(currentUrl, featureCount, pageSize) {
  if (!pageSize || featureCount < pageSize) return null;
  const url = new URL(currentUrl);
  const startIndex = Number.parseInt(url.searchParams.get("startIndex") || "0", 10);
  url.searchParams.set("startIndex", String(startIndex + pageSize));
  return url.toString();
}

function normalizeProviderFeatures(providerFeatures) {
  const roads = [];
  const buildings = [];

  for (const feature of providerFeatures.digiroadRoads?.features || []) {
    const normalized = normalizeLineFeature(feature, normalizeDigiroadRoadProperties(feature.properties || {}));
    if (normalized) roads.push(normalized);
  }

  for (const [name, collection] of Object.entries(providerFeatures)) {
    if (name === "digiroadRoads") continue;
    if (name === "nls-tieviiva") {
      for (const feature of collection.features) {
        const normalized = normalizeLineFeature(feature, normalizeNlsRoadProperties(feature.properties || {}));
        if (normalized) roads.push(normalized);
      }
    }
    if (name === "nls-rakennus") {
      for (const feature of collection.features) {
        const normalized = normalizePolygonFeature(feature, {
          kind: "building",
          source: "nls",
          name: firstText(feature.properties || {}, ["nimi", "teksti", "name"]),
        });
        if (normalized) buildings.push(normalized);
      }
    }
  }

  return {
    roads: { type: "FeatureCollection", features: roads },
    buildings: { type: "FeatureCollection", features: buildings },
  };
}

function normalizeDigiroadRoadProperties(properties) {
  const nameFi = firstText(properties, ["tienimi_su", "nimi", "name"]);
  const mtkClass = Number(properties.mtk_tie_lk);
  const functionClass = Number(properties.toiminn_lk);
  const linkType = Number(properties.linkkityyp);
  const pathClasses = new Set([12312, 12313, 12314, 12316]);
  const isPath = pathClasses.has(mtkClass) || functionClass >= 7 || linkType >= 7;

  return {
    kind: isPath ? "path" : functionClass <= 3 ? "major_road" : "minor_road",
    kind_detail: isPath ? "path" : "road",
    name: nameFi,
    "name:fi": nameFi,
    source: "digiroad",
    mtk_tie_lk: Number.isFinite(mtkClass) ? mtkClass : undefined,
    toiminn_lk: Number.isFinite(functionClass) ? functionClass : undefined,
    linkkityyp: Number.isFinite(linkType) ? linkType : undefined,
  };
}

function normalizeNlsRoadProperties(properties) {
  const classCode = Number(properties.kohdeluokka);
  const pathClasses = new Set([12312, 12313, 12314, 12316]);
  const majorClasses = new Set([12111, 12112, 12121]);
  return {
    kind: pathClasses.has(classCode) ? "path" : majorClasses.has(classCode) ? "major_road" : "minor_road",
    kind_detail: pathClasses.has(classCode) ? "path" : "road",
    name: firstText(properties, ["nimi", "teksti", "name"]),
    source: "nls",
    kohdeluokka: Number.isFinite(classCode) ? classCode : undefined,
  };
}

function normalizeLineFeature(feature, properties) {
  const geometry = cleanGeometry(feature.geometry);
  if (!geometry || !["LineString", "MultiLineString"].includes(geometry.type)) return null;
  return { type: "Feature", properties: cleanProperties(properties), geometry };
}

function normalizePolygonFeature(feature, properties) {
  const geometry = cleanGeometry(feature.geometry);
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return null;
  return { type: "Feature", properties: cleanProperties(properties), geometry };
}

function cleanGeometry(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  return {
    type: geometry.type,
    coordinates: stripExtraOrdinates(geometry.coordinates),
  };
}

function stripExtraOrdinates(value) {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === "number") return value.slice(0, 2);
  return value.map(stripExtraOrdinates);
}

function cleanProperties(properties) {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value != null && value !== ""));
}

function geometryIntersectsBounds(geometry, bounds) {
  const geometryBounds = geometryBoundsOf(geometry);
  if (!geometryBounds) return false;
  return geometryBounds.minLon <= bounds.maxLon &&
    geometryBounds.maxLon >= bounds.minLon &&
    geometryBounds.minLat <= bounds.maxLat &&
    geometryBounds.maxLat >= bounds.minLat;
}

function geometryBoundsOf(geometry) {
  if (!geometry?.coordinates) return null;
  const points = [];
  collectCoordinatePairs(geometry.coordinates, points);
  if (points.length === 0) return null;
  return points.reduce(
    (bounds, [lon, lat]) => ({
      minLon: Math.min(bounds.minLon, lon),
      minLat: Math.min(bounds.minLat, lat),
      maxLon: Math.max(bounds.maxLon, lon),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity },
  );
}

function collectCoordinatePairs(value, points) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    points.push([value[0], value[1]]);
    return;
  }
  for (const item of value) collectCoordinatePairs(item, points);
}

function firstText(properties, keys) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function getBaseMetadata(options) {
  const args = baseExtractorArgs(options, null, true);
  const result = spawnSync(process.execPath, args, { cwd: workspaceRoot, encoding: "utf8" });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(result.stderr.trim() || `Base extractor exited with status ${result.status}.`);
  return JSON.parse(result.stdout);
}

function runBaseExtraction(options, outPath) {
  const args = baseExtractorArgs(options, outPath, false);
  const result = spawnSync(process.execPath, args, { cwd: workspaceRoot, stdio: "inherit" });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`Base extractor exited with status ${result.status}.`);
}

function baseExtractorArgs(options, outPath, dryRun) {
  const args = [extractor];
  if (options.gpx) args.push("--gpx", options.gpx);
  if (options.bbox) args.push("--bbox", options.bbox);
  if (options.name) args.push("--name", options.name);
  if (options.source) args.push("--source", options.source);
  if (options.bufferMeters) args.push("--buffer-meters", options.bufferMeters);
  if (options.coverage) args.push("--coverage", options.coverage);
  if (options.minzoom) args.push("--minzoom", options.minzoom);
  if (options.maxzoom) args.push("--maxzoom", options.maxzoom);
  if (outPath) args.push("--out", outPath);
  if (dryRun) args.push("--dry-run");
  if (options.force) args.push("--force");
  return args;
}

function toolReport() {
  return {
    pmtiles: commandPath("pmtiles"),
    sqlite3: commandPath("sqlite3"),
  };
}

function assertProviderTileTools(report) {
  const missing = Object.entries(report)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    fail(`Missing provider tile tools: ${missing.join(", ")}. Install sqlite3 and pmtiles before final packaging.`);
  }
}

function buildProviderPmtiles({ normalized, bbox, providerAreas, maxzoom, pmtilesPath, workPath, tileDir }) {
  const bounds = parseBboxString(bbox);
  const roadsIndex = buildTileIndex(normalized.roads, maxzoom);
  const buildingsIndex = buildTileIndex(normalized.buildings, maxzoom);
  const tileCoordinates = providerTileCoordinates(providerAreas, maxzoom);
  const tileRecords = [];

  if (existsSync(tileDir)) rmSync(tileDir, { recursive: true, force: true });
  mkdirSync(tileDir, { recursive: true });

  for (const { z, x, y } of tileCoordinates) {
    const layerMap = {};
    const roadsTile = roadsIndex.getTile(z, x, y);
    const buildingsTile = buildingsIndex.getTile(z, x, y);
    if (roadsTile?.features?.length) layerMap.roads = roadsTile;
    if (buildingsTile?.features?.length) layerMap.buildings = buildingsTile;
    if (Object.keys(layerMap).length === 0) continue;

    const mvt = fromGeojsonVt(layerMap, { version: 2, extent: 4096 });
    const tilePath = resolve(tileDir, `${z}-${x}-${y}.mvt`);
    writeFileSync(tilePath, gzipSync(Buffer.from(mvt)));
    tileRecords.push({ z, x, y, path: tilePath });
  }

  writeMbtiles({
    mbtilesPath: workPath,
    tileRecords,
    bounds,
    maxzoom,
    vectorLayers: [
      {
        id: "roads",
        description: "Finnish provider roads and paths normalized for LiteGPX",
        fields: {
          kind: "String",
          kind_detail: "String",
          name: "String",
          "name:fi": "String",
          source: "String",
        },
      },
      {
        id: "buildings",
        description: "Finnish provider buildings normalized for LiteGPX",
        fields: {
          kind: "String",
          name: "String",
          source: "String",
        },
      },
    ],
  });

  if (existsSync(pmtilesPath)) rmSync(pmtilesPath);
  const convert = spawnSync("pmtiles", ["convert", "--force", workPath, pmtilesPath], { stdio: "inherit" });
  if (convert.error) fail(convert.error.message);
  if (convert.status !== 0) fail(`pmtiles convert exited with status ${convert.status}.`);

  return {
    mbtiles: workPath,
    pmtiles: pmtilesPath,
    tileCount: tileRecords.length,
    minzoom: 0,
    maxzoom,
    bounds: formatBoundsArray(bounds),
  };
}

function providerTileCoordinates(providerAreas, maxzoom) {
  const keys = new Set();
  const coordinates = [];
  for (let z = 0; z <= maxzoom; z++) {
    for (const area of providerAreas) {
      const range = tileRangeForBounds(parseBboxString(area.bbox), z);
      for (let x = range.minX; x <= range.maxX; x++) {
        for (let y = range.minY; y <= range.maxY; y++) {
          const key = `${z}/${x}/${y}`;
          if (keys.has(key)) continue;
          keys.add(key);
          coordinates.push({ z, x, y });
        }
      }
    }
  }
  return coordinates;
}

function buildTileIndex(geojson, maxzoom) {
  return new GeoJSONVT(geojson, {
    maxZoom: maxzoom,
    indexMaxZoom: maxzoom,
    indexMaxPoints: 0,
    extent: 4096,
    buffer: 64,
    tolerance: 1,
  });
}

function writeMbtiles({ mbtilesPath, tileRecords, bounds, maxzoom, vectorLayers }) {
  if (existsSync(mbtilesPath)) rmSync(mbtilesPath);
  mkdirSync(dirname(mbtilesPath), { recursive: true });
  const metadata = {
    name: "LiteGPX Finnish provider overlay",
    type: "overlay",
    version: "1",
    description: "Finnish Digiroad and NLS provider data normalized for LiteGPX",
    format: "pbf",
    minzoom: "0",
    maxzoom: String(maxzoom),
    bounds: formatBoundsArray(bounds),
    center: `${(bounds.minLon + bounds.maxLon) / 2},${(bounds.minLat + bounds.maxLat) / 2},${Math.min(maxzoom, 14)}`,
    json: JSON.stringify({ vector_layers: vectorLayers }),
  };
  const sql = [
    "PRAGMA synchronous=OFF;",
    "PRAGMA journal_mode=OFF;",
    "CREATE TABLE metadata (name TEXT, value TEXT);",
    "CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);",
    ...Object.entries(metadata).map(([name, value]) => (
      `INSERT INTO metadata (name, value) VALUES (${sqlString(name)}, ${sqlString(value)});`
    )),
    ...tileRecords.map((record) => (
      `INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (` +
        `${record.z}, ${record.x}, ${(1 << record.z) - 1 - record.y}, readfile(${sqlString(record.path)}));`
    )),
    "CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row);",
  ].join("\n");

  const result = spawnSync("sqlite3", [mbtilesPath], { input: sql, encoding: "utf8" });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(result.stderr.trim() || `sqlite3 exited with status ${result.status}.`);
}

function tileRangeForBounds(bounds, z) {
  const max = (1 << z) - 1;
  const minX = clamp(Math.floor(lonToTileX(bounds.minLon, z)), 0, max);
  const maxX = clamp(Math.floor(lonToTileX(bounds.maxLon, z)), 0, max);
  const minY = clamp(Math.floor(latToTileY(bounds.maxLat, z)), 0, max);
  const maxY = clamp(Math.floor(latToTileY(bounds.minLat, z)), 0, max);
  return { minX, maxX, minY, maxY };
}

function lonToTileX(lon, z) {
  return ((lon + 180) / 360) * (1 << z);
}

function latToTileY(lat, z) {
  const radians = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * (1 << z);
}

function parseBboxString(value) {
  const [minLon, minLat, maxLon, maxLat] = value.split(",").map((part) => Number.parseFloat(part));
  return { minLon, minLat, maxLon, maxLat };
}

function bufferedBoundsFromRaw(bounds, bufferMeters) {
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const latPadding = toDegrees(bufferMeters / EARTH_RADIUS_METERS);
  const lonScale = Math.max(Math.cos(toRadians(centerLat)), 0.001);
  const lonPadding = toDegrees(bufferMeters / (EARTH_RADIUS_METERS * lonScale));
  return {
    minLon: clamp(bounds.minLon - lonPadding, -180, 180),
    minLat: clamp(bounds.minLat - latPadding, -90, 90),
    maxLon: clamp(bounds.maxLon + lonPadding, -180, 180),
    maxLat: clamp(bounds.maxLat + latPadding, -90, 90),
  };
}

function formatBounds(bounds) {
  return [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat]
    .map((value) => value.toFixed(6))
    .join(",");
}

function formatBoundsArray(bounds) {
  return [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].map((value) => value.toFixed(6)).join(",");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function commandPath(command) {
  const result = spawnSync("sh", ["-c", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    process.env[key] = parseDotEnvValue(rawValue);
  }
}

function parseDotEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const commentIndex = trimmed.indexOf(" #");
  return (commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed).trim();
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--gpx" || arg === "-g") options.gpx = readValue(args, ++index, arg);
    else if (arg === "--bbox") options.bbox = readValue(args, ++index, arg);
    else if (arg === "--name") options.name = readValue(args, ++index, arg);
    else if (arg === "--source" || arg === "-s") options.source = readValue(args, ++index, arg);
    else if (arg === "--out" || arg === "-o") options.output = readValue(args, ++index, arg);
    else if (arg === "--buffer-meters" || arg === "--buffer") options.bufferMeters = readValue(args, ++index, arg);
    else if (arg === "--coverage") options.coverage = readValue(args, ++index, arg);
    else if (arg === "--minzoom") options.minzoom = readValue(args, ++index, arg);
    else if (arg === "--maxzoom") options.maxzoom = readValue(args, ++index, arg);
    else if (arg === "--providers") options.providers = readValue(args, ++index, arg);
    else if (arg === "--nls-api-key") options.nlsApiKey = readValue(args, ++index, arg);
    else if (arg === "--nls-geojson-dir") options.nlsGeojsonDir = readValue(args, ++index, arg);
    else if (arg === "--download-only") options.downloadOnly = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) fail(`Missing value for ${flag}.`);
  return value;
}

function parseProviders(value) {
  const providers = value.split(",").map((part) => part.trim()).filter(Boolean);
  for (const provider of providers) {
    if (!["digiroad", "nls"].includes(provider)) fail(`Unsupported provider: ${provider}. Use digiroad,nls.`);
  }
  return providers;
}

function nlsGeojsonSignature(directory) {
  if (!directory) return null;
  const resolved = resolve(directory);
  const files = ["tieviiva.geojson", "rakennus.geojson"];
  return files.map((file) => {
    const path = resolve(resolved, file);
    return existsSync(path)
      ? { file, hash: hashText(readFileSync(path, "utf8")) }
      : { file, missing: true };
  });
}

function resolveOutputPath(output, baseMetadata, cacheKey) {
  if (output) return resolve(output);
  const sourceName = baseMetadata.route?.input
    ? basename(baseMetadata.route.input).replace(/\.[^.]+$/, "")
    : baseMetadata.area?.name || "selected-area";
  return resolve(outputDir, `${slugify(sourceName)}-finnish-${cacheKey.slice(0, 10)}.pmtiles`);
}

function useCachedOutput(outPath, metadataPath, cacheKey, force) {
  if (force || !existsSync(outPath)) return false;
  if (existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
      if (metadata.cacheKey === cacheKey) {
        console.log(`Using cached ${outPath}`);
        console.log(`Metadata ${metadataPath}`);
        return true;
      }
    } catch {
      // Fall through to the conservative existing-output error below.
    }
  }
  fail(`Output already exists with different or missing metadata: ${outPath}. Use --force to overwrite.`);
}

function readGeoJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeGeoJson(path, geojson) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(geojson)}\n`);
}

function basicAuth(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value) {
  return hashText(JSON.stringify(value));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "map";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function printHelp() {
  console.log(`LiteGPX Finnish map dataset builder

Usage:
  node mapdataservice/build-finnish-map.mjs --gpx route.gpx [options]
  node mapdataservice/build-finnish-map.mjs --bbox minLon,minLat,maxLon,maxLat [options]

This wraps the base PMTiles extractor and downloads Finnish provider data for the
same route corridor or bbox. Current provider normalization targets the
LiteGPX style layers:

  Digiroad dr_tielinkki_tielinkin_tyyppi -> roads
  NLS tieviiva                           -> roads
  NLS rakennus                           -> buildings

Options:
  -g, --gpx <file-or-dir>      GPX route file or directory.
      --bbox <bbox>            Area as minLon,minLat,maxLon,maxLat.
      --name <name>            Output name prefix for bbox extracts.
  -s, --source <pmtiles|url>   Base PMTiles source passed to extract-route-map.
  -o, --out <file>             Provider overlay PMTiles output path.
      --buffer-meters <n>      Route buffer passed to extract-route-map.
      --coverage <mode>        bbox, route-bboxes, or corridor.
      --minzoom <n>            Minimum zoom passed to extract-route-map.
      --maxzoom <n>            Maximum zoom passed to extract-route-map.
      --providers <list>       Comma-separated providers: digiroad,nls.
                               Default: digiroad, or digiroad,nls when NLS_API_KEY is set.
      --nls-api-key <key>      NLS API key. Defaults to NLS_API_KEY env var.
      --nls-geojson-dir <dir>  Local NLS GeoJSON directory containing tieviiva.geojson
                               and rakennus.geojson. Useful for tests or exported NLS data.
      --download-only          Write provider GeoJSON and metadata only.
      --force                  Replace cached/generated files.
      --dry-run                Print plan only.
  -h, --help                   Show this help.
`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
