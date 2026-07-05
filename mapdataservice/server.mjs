#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");
loadDotEnv(resolve(workspaceRoot, ".env"));

const extractor = resolve(scriptDir, "extract-route-map.mjs");
const finnishBuilder = resolve(scriptDir, "build-finnish-map.mjs");
const outputDir = resolve(scriptDir, "output");
const mobileRoutesDir = resolve(process.env.MOBILE_ROUTES_DIR || resolve(workspaceRoot, "mobile/app/src/main/assets/routes"));
const mobileRouteCatalogPath = resolve(process.env.MOBILE_ROUTE_CATALOG_PATH || resolve(mobileRoutesDir, "routes.json"));
const bundledMapPath = resolve(process.env.MOBILE_BUNDLED_MAP_PATH || resolve(workspaceRoot, "shared/maps/finland.pmtiles"));
const bundledProviderMapPath = resolve(
  process.env.MOBILE_BUNDLED_PROVIDER_MAP_PATH || resolve(workspaceRoot, "shared/maps/finland.providers.pmtiles"),
);
const bundledMapManifestPath = resolve(
  process.env.MOBILE_BUNDLED_MAP_MANIFEST_PATH || resolve(workspaceRoot, "shared/maps/manifest.json"),
);
const port = Number.parseInt(process.env.PORT || "5174", 10);
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";

if (isMainModule()) {
  createServer(handleRequest).listen(port, "::", () => {
    console.log(`TrailLite map data service at http://localhost:${port}/api/health`);
  });
}

async function handleRequest(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://localhost:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/datasets") {
      sendJson(response, 200, { datasets: await listDatasets() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/mobile-routes") {
      sendJson(response, 200, { routes: await readMobileRouteCatalog({ catalogPath: mobileRouteCatalogPath, routesDir: mobileRoutesDir }) });
      return;
    }
    const mobileRouteMatch = url.pathname.match(/^\/api\/mobile-routes\/([^/]+)$/);
    if (request.method === "GET" && mobileRouteMatch) {
      const route = await readMobileRouteGpx({
        id: decodeURIComponent(mobileRouteMatch[1]),
        catalogPath: mobileRouteCatalogPath,
        routesDir: mobileRoutesDir,
      });
      sendJson(response, 200, route);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/extract-bbox") {
      const body = await readJson(request);
      const result = await extractBbox(body);
      sendJson(response, 200, result);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/save-mobile-route") {
      const body = await readJson(request);
      const result = await saveMobileRoute(body);
      sendJson(response, 200, result);
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Request failed" });
  }
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function listDatasets() {
  if (!existsSync(outputDir)) return [];
  const names = await readdir(outputDir);
  return Promise.all(names
    .filter((name) => name.toLowerCase().endsWith(".pmtiles"))
    .sort((left, right) => left.localeCompare(right))
    .map(async (name) => {
      const pmtiles = resolve(outputDir, name);
      const info = await stat(pmtiles);
      const metadataPath = `${pmtiles}.json`;
      const metadata = await readMetadata(metadataPath);
      const relativePath = relative(workspaceRoot, pmtiles).replaceAll("\\", "/");
      return {
        name: metadata?.area?.name || (metadata?.route?.input ? basename(metadata.route.input) : name.replace(/\.pmtiles$/i, "")),
        file: name,
        sizeBytes: info.size,
        cacheKey: metadata?.cacheKey || null,
        bbox: metadata?.area?.bbox || metadata?.route?.bbox || null,
        pmtiles,
        metadata: existsSync(metadataPath) ? metadataPath : null,
        url: `${webOrigin}/${relativePath}`,
      };
    }));
}

async function readMobileRouteCatalog({ catalogPath, routesDir }) {
  const catalog = await readRouteCatalog(catalogPath);
  return Promise.all(catalog.map(async (route) => {
    const gpxPath = route.gpxAsset ? resolveRouteAsset(routesDir, route.gpxAsset) : null;
    const fileInfo = gpxPath && existsSync(gpxPath) ? await stat(gpxPath) : null;
    return {
      id: route.id,
      title: route.title,
      lengthKm: route.lengthKm,
      durationText: route.durationText,
      source: route.source,
      gpxAsset: route.gpxAsset,
      bounds: route.bounds,
      trackPointCount: route.trackPointCount,
      sizeBytes: fileInfo?.size ?? null,
      updatedAt: fileInfo?.mtime?.toISOString() ?? null,
    };
  }));
}

async function readMobileRouteGpx({ id, catalogPath, routesDir }) {
  const catalog = await readRouteCatalog(catalogPath);
  const route = catalog.find((entry) => entry.id === id);
  if (!route) throw new Error(`Unknown mobile route: ${id}`);
  if (!route.gpxAsset) throw new Error(`Mobile route has no GPX asset: ${id}`);
  const gpxPath = resolveRouteAsset(routesDir, route.gpxAsset);
  return {
    route,
    gpx: await readFile(gpxPath, "utf8"),
  };
}

async function mobileRouteSaveTarget({ routeId, routeName, catalogPath, routesDir }) {
  const title = cleanName(routeName || "Untitled route");
  const requestedId = cleanRouteId(routeId);
  const catalog = await readRouteCatalog(catalogPath);
  const existingRoute = requestedId ? catalog.find((entry) => entry.id === requestedId) : null;
  if (existingRoute?.gpxAsset) {
    const gpxPath = resolveRouteAsset(routesDir, existingRoute.gpxAsset);
    return {
      id: existingRoute.id,
      title,
      gpxFile: basename(gpxPath),
      gpxAsset: existingRoute.gpxAsset,
    };
  }

  const id = slugify(title);
  const gpxFile = `${id}.gpx`;
  return {
    id,
    title,
    gpxFile,
    gpxAsset: `routes/${gpxFile}`,
  };
}

async function readRouteCatalog(catalogPath) {
  if (!existsSync(catalogPath)) return [];
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (!Array.isArray(catalog)) throw new Error("Route catalog must be a JSON array");
  return catalog;
}

function cleanRouteId(value) {
  if (value == null || value === "") return "";
  const id = String(value);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error(`Invalid mobile route id: ${value}`);
  return id;
}

function resolveRouteAsset(routesDir, gpxAsset) {
  const normalizedAsset = String(gpxAsset).replace(/^routes\//, "");
  const resolved = resolve(routesDir, normalizedAsset);
  const normalizedRoutesDir = resolve(routesDir);
  if (resolved !== normalizedRoutesDir && !resolved.startsWith(`${normalizedRoutesDir}/`)) {
    throw new Error(`Route asset escapes route directory: ${gpxAsset}`);
  }
  return resolved;
}

async function readMetadata(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function extractBbox(body) {
  const bbox = normalizeBbox(body.bbox);
  const name = cleanName(body.name || "web-selected-area");
  const source = body.source || "protomaps";
  const maxzoom = String(body.maxzoom || 15);
  const baseArgs = [
    extractor,
    "--bbox",
    bbox.join(","),
    "--name",
    name,
    "--source",
    source,
    "--maxzoom",
    maxzoom,
  ];
  if (body.minzoom != null) baseArgs.push("--minzoom", String(body.minzoom));

  const dryRun = await runNode([...baseArgs, "--dry-run"]);
  const metadata = JSON.parse(dryRun.stdout);
  const run = await runNode(baseArgs);
  const provider = await buildProviderOverlay({
    body,
    source,
    maxzoom,
    minzoom: body.minzoom,
    bbox: bbox.join(","),
    name,
  });
  const relativePath = relative(workspaceRoot, metadata.output.pmtiles).replaceAll("\\", "/");
  return {
    cached: run.stdout.includes("Using cached"),
    bbox: metadata.area.bbox,
    cacheKey: metadata.cacheKey,
    name: metadata.area.name,
    sizeBytes: await stat(metadata.output.pmtiles).then((info) => info.size),
    pmtiles: metadata.output.pmtiles,
    metadata: metadata.output.metadata,
    url: `${webOrigin}/${relativePath}`,
    provider,
    stdout: [run.stdout.trim(), provider.stdout].filter(Boolean).join("\n"),
  };
}

async function saveMobileRoute(body) {
  const routeName = cleanName(body.routeName || "Untitled route");
  const gpx = String(body.gpx || "");
  const routePoints = parseGpxPoints(gpx);
  if (routePoints.length < 2) throw new Error("route GPX must contain at least two track points");

  const target = await mobileRouteSaveTarget({
    routeId: body.routeId,
    routeName,
    catalogPath: mobileRouteCatalogPath,
    routesDir: mobileRoutesDir,
  });
  const gpxPath = resolve(mobileRoutesDir, target.gpxFile);
  await mkdir(mobileRoutesDir, { recursive: true });
  await writeFile(gpxPath, gpx, "utf8");

  const routeEntry = buildRouteCatalogEntry({
    id: target.id,
    title: target.title,
    gpxAsset: target.gpxAsset,
    points: routePoints,
  });
  await upsertRouteCatalog(routeEntry);

  const source = body.source || "protomaps";
  const bufferMeters = String(body.bufferMeters ?? 1000);
  const coverage = body.coverage || "corridor";
  const maxzoom = String(body.maxzoom || 15);
  const mapGpxInput = mobileMapGpxInput({ body, savedRoutePath: gpxPath, routesDir: mobileRoutesDir });
  const baseArgs = [
    extractor,
    "--gpx",
    mapGpxInput,
    "--source",
    source,
    "--buffer-meters",
    bufferMeters,
    "--coverage",
    coverage,
    "--maxzoom",
    maxzoom,
  ];
  if (body.minzoom != null) baseArgs.push("--minzoom", String(body.minzoom));

  const dryRun = await runNode([...baseArgs, "--dry-run"]);
  const metadata = JSON.parse(dryRun.stdout);
  const run = await runNode(baseArgs);
  await mkdir(dirname(bundledMapPath), { recursive: true });
  await copyFile(metadata.output.pmtiles, bundledMapPath);

  const provider = await buildProviderOverlay({
    body,
    source,
    maxzoom,
    minzoom: body.minzoom,
    gpx: mapGpxInput,
    bufferMeters,
    coverage,
  });
  await mkdir(dirname(bundledProviderMapPath), { recursive: true });
  await copyFile(provider.pmtiles, bundledProviderMapPath);
  const mapManifest = await writeBundledMapManifest(bundledMapManifestPath, [
    { name: basename(bundledMapPath), path: bundledMapPath },
    { name: basename(bundledProviderMapPath), path: bundledProviderMapPath },
  ]);

  return {
    route: {
      id: routeEntry.id,
      title: routeEntry.title,
      file: relative(workspaceRoot, gpxPath).replaceAll("\\", "/"),
      catalog: relative(workspaceRoot, mobileRouteCatalogPath).replaceAll("\\", "/"),
      pointCount: routeEntry.trackPointCount,
      lengthKm: routeEntry.lengthKm,
      bounds: routeEntry.bounds,
    },
    map: {
      cached: run.stdout.includes("Using cached"),
      generatedFile: relative(workspaceRoot, metadata.output.pmtiles).replaceAll("\\", "/"),
      mobileFile: relative(workspaceRoot, bundledMapPath).replaceAll("\\", "/"),
      providerGeneratedFile: relative(workspaceRoot, provider.pmtiles).replaceAll("\\", "/"),
      providerMobileFile: relative(workspaceRoot, bundledProviderMapPath).replaceAll("\\", "/"),
      metadata: relative(workspaceRoot, metadata.output.metadata).replaceAll("\\", "/"),
      providerMetadata: relative(workspaceRoot, provider.metadata).replaceAll("\\", "/"),
      manifest: relative(workspaceRoot, bundledMapManifestPath).replaceAll("\\", "/"),
      manifestFiles: mapManifest.files,
      bufferMeters: Number(bufferMeters),
      coverage,
      maxzoom: Number(maxzoom),
      scope: body.mapScope === "route" ? "route" : "all-routes",
      sizeBytes: await stat(bundledMapPath).then((info) => info.size),
      providerSizeBytes: await stat(bundledProviderMapPath).then((info) => info.size),
    },
    stdout: [run.stdout.trim(), provider.stdout].filter(Boolean).join("\n"),
  };
}

function mobileMapGpxInput({ body, savedRoutePath, routesDir }) {
  return body.mapScope === "route" ? savedRoutePath : routesDir;
}

async function writeBundledMapManifest(path, files) {
  const manifest = await buildBundledMapManifest(files);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function buildBundledMapManifest(files) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: await Promise.all(files.map(async (file) => {
      const info = await stat(file.path);
      return {
        name: file.name,
        sizeBytes: info.size,
        sha256: await sha256File(file.path),
      };
    })),
  };
}

async function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

async function buildProviderOverlay({ body, source, maxzoom, minzoom, bbox, name, gpx, bufferMeters, coverage }) {
  const providerArgs = [finnishBuilder, "--source", source, "--maxzoom", maxzoom, "--providers", providerList(body)];
  if (bbox) providerArgs.push("--bbox", bbox);
  if (name) providerArgs.push("--name", name);
  if (gpx) providerArgs.push("--gpx", gpx);
  if (bufferMeters != null) providerArgs.push("--buffer-meters", String(bufferMeters));
  if (coverage) providerArgs.push("--coverage", coverage);
  if (minzoom != null) providerArgs.push("--minzoom", String(minzoom));
  const nlsGeojsonDir = body.nlsGeojsonDir || process.env.TRAILLITE_NLS_GEOJSON_DIR;
  if (nlsGeojsonDir) providerArgs.push("--nls-geojson-dir", resolve(nlsGeojsonDir));
  if (body.nlsApiKey) providerArgs.push("--nls-api-key", String(body.nlsApiKey));

  const dryRun = await runNode([...providerArgs, "--dry-run"]);
  const metadata = JSON.parse(dryRun.stdout);
  const run = await runNode(providerArgs);
  const relativePath = relative(workspaceRoot, metadata.output.providerPmtiles).replaceAll("\\", "/");
  return {
    cached: run.stdout.includes("Using cached"),
    providers: metadata.providers,
    bbox: metadata.bbox,
    cacheKey: metadata.cacheKey,
    sizeBytes: await stat(metadata.output.providerPmtiles).then((info) => info.size),
    pmtiles: metadata.output.providerPmtiles,
    metadata: metadata.output.metadata,
    url: `${webOrigin}/${relativePath}`,
    stdout: run.stdout.trim(),
  };
}

function providerList(body) {
  return body.providers || process.env.TRAILLITE_FINNISH_PROVIDERS || (process.env.NLS_API_KEY ? "digiroad,nls" : "digiroad");
}

function normalizeBbox(value) {
  const bbox = Array.isArray(value) ? value : String(value || "").split(",");
  const parts = bbox.map((part) => Number.parseFloat(String(part).trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error("bbox must be [minLon,minLat,maxLon,maxLat]");
  }
  const normalized = [
    Math.min(parts[0], parts[2]),
    Math.min(parts[1], parts[3]),
    Math.max(parts[0], parts[2]),
    Math.max(parts[1], parts[3]),
  ];
  if (normalized[0] < -180 || normalized[2] > 180 || normalized[1] < -90 || normalized[3] > 90) {
    throw new Error("bbox is outside valid lon/lat ranges");
  }
  if (normalized[0] === normalized[2] || normalized[1] === normalized[3]) {
    throw new Error("bbox must cover a non-zero area");
  }
  return normalized.map((part) => Number(part.toFixed(6)));
}

function cleanName(value) {
  return String(value).trim().slice(0, 80) || "web-selected-area";
}

function parseGpxPoints(xml) {
  const points = [];
  const pointTagPattern = /<(?:trkpt|rtept|wpt)\b([^>]*)>/gi;
  let tagMatch;
  while ((tagMatch = pointTagPattern.exec(xml))) {
    const attrs = parseAttributes(tagMatch[1]);
    const lat = Number.parseFloat(attrs.lat);
    const lon = Number.parseFloat(attrs.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    points.push({ lat, lon });
  }
  return points;
}

function parseAttributes(text) {
  const attrs = {};
  const attrPattern = /\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/g;
  let match;
  while ((match = attrPattern.exec(text))) attrs[match[1]] = match[2];
  return attrs;
}

function buildRouteCatalogEntry({ id, title, gpxAsset, points }) {
  const bounds = routeBounds(points);
  return {
    id,
    title,
    lengthKm: Number((routeDistanceMeters(points) / 1000).toFixed(1)),
    durationText: "--",
    source: "TrailLite GPX Builder",
    matchScore: 1,
    bikelandId: null,
    matchedTitle: title,
    detailUrl: null,
    gpxDownloadUrl: null,
    gpxAsset,
    bounds,
    trackPointCount: points.length,
  };
}

async function upsertRouteCatalog(entry) {
  let catalog = [];
  if (existsSync(mobileRouteCatalogPath)) {
    catalog = JSON.parse(await readFile(mobileRouteCatalogPath, "utf8"));
  }
  const withoutExisting = Array.isArray(catalog)
    ? catalog.filter((item) => item.id !== entry.id)
    : [];
  withoutExisting.push(entry);
  withoutExisting.sort((left, right) => left.title.localeCompare(right.title, "fi"));
  await writeFile(mobileRouteCatalogPath, `${JSON.stringify(withoutExisting, null, 2)}\n`, "utf8");
}

function routeBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minLon: Math.min(bounds.minLon, point.lon),
      minLat: Math.min(bounds.minLat, point.lat),
      maxLon: Math.max(bounds.maxLon, point.lon),
      maxLat: Math.max(bounds.maxLat, point.lat),
    }),
    { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity },
  );
}

function routeDistanceMeters(points) {
  let meters = 0;
  for (let index = 1; index < points.length; index++) {
    meters += distanceMeters(points[index - 1], points[index]);
  }
  return meters;
}

function distanceMeters(left, right) {
  const earthRadiusMeters = 6371000;
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLon = toRadians(right.lon - left.lon);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function slugify(value) {
  return String(value || "route")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "route";
}

function runNode(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, { cwd: workspaceRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(stderr.trim() || stdout.trim() || `extractor exited with ${code}`));
    });
  });
}

function readJson(request) {
  return new Promise((resolveRead, rejectRead) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) rejectRead(new Error("request body too large"));
    });
    request.on("end", () => {
      try {
        resolveRead(raw ? JSON.parse(raw) : {});
      } catch {
        rejectRead(new Error("invalid JSON"));
      }
    });
    request.on("error", rejectRead);
  });
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(response, status, body) {
  const text = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  response.end(text);
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

export {
  buildBundledMapManifest,
  mobileRouteSaveTarget,
  mobileMapGpxInput,
  readMobileRouteCatalog,
  readMobileRouteGpx,
};
