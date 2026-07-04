#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EARTH_RADIUS_METERS = 6371000;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");
const localSource = resolve(workspaceRoot, "shared/maps/finland.pmtiles");
const protomapsSource = "https://build.protomaps.com/20260703.pmtiles";

const defaults = {
  bufferMeters: 10000,
  coverage: "corridor",
  maxzoom: "15",
  source: protomapsSource,
  outputDir: resolve(workspaceRoot, "mapdataservice/output"),
};

main();

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const source = resolveSource(options.source || defaults.source);
  if (!isRemoteSource(source) && !existsSync(source)) {
    fail(`Source PMTiles file not found: ${source}`);
  }
  const commandOptions = { ...options, maxzoom: options.maxzoom ?? defaults.maxzoom };

  if (options.bbox) {
    extractBbox(options, source, commandOptions);
    return;
  }

  if (!options.gpx) fail("Missing required --gpx <file-or-directory> or --bbox <minLon,minLat,maxLon,maxLat>.");

  const gpxInputPath = resolve(options.gpx);
  const gpxFiles = resolveGpxFiles(gpxInputPath);
  if (gpxFiles.length === 0) fail(`No GPX files found: ${gpxInputPath}`);

  const routes = gpxFiles.map((file) => {
    const text = readFileSync(file, "utf8");
    const points = parseGpxPoints(text);
    return {
      file,
      contentHash: hashText(text),
      pointCount: points.length,
      rawBounds: points.length > 0 ? rawBounds(points) : null,
      points,
    };
  });
  const points = routes.flatMap((route) => route.points);
  if (points.length < 2) fail(`Expected at least 2 GPX points, found ${points.length}.`);

  const bufferMeters = Number(options.bufferMeters ?? defaults.bufferMeters);
  if (!Number.isFinite(bufferMeters) || bufferMeters < 0) {
    fail("--buffer-meters must be a non-negative number.");
  }

  const bounds = bufferedBounds(points, bufferMeters);
  const bbox = formatBbox(bounds);
  const coverage = options.coverage || defaults.coverage;
  const cacheKey = hashJson({
    kind: "gpx",
    source,
    bbox,
    bufferMeters,
    coverage,
    minzoom: commandOptions.minzoom || null,
    maxzoom: commandOptions.maxzoom || null,
    files: routes.map((route) => ({ file: route.file, hash: route.contentHash })),
  });
  const outPath = resolveOutputPath(options.output, gpxInputPath, cacheKey);
  const metadataPath = `${outPath}.json`;
  const regionPath = coverage === "bbox" ? null : `${outPath}.region.geojson`;
  const region = buildRegion(coverage, routes, bufferMeters);
  const command = buildPmtilesCommand(source, outPath, bbox, regionPath, commandOptions);

  const metadata = {
    generatedAt: new Date().toISOString(),
    cacheKey,
    route: {
      input: gpxInputPath,
      files: routes.map((route) => ({
        gpx: route.file,
        contentHash: route.contentHash,
        pointCount: route.pointCount,
        rawBounds: route.rawBounds,
      })),
      fileCount: routes.length,
      pointCount: points.length,
      rawBounds: rawBounds(points),
      bufferMeters,
      bufferedBounds: bounds,
      bbox,
      coverage,
      region: regionPath,
    },
    source: {
      pmtiles: source,
      profile: "traillite-v1",
      note: "Source PMTiles must use the layer schema expected by shared/styles/style_template.json.",
    },
    output: {
      pmtiles: outPath,
      metadata: metadataPath,
    },
    command,
  };

  if (options.dryRun) {
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  if (useCachedOutput(outPath, metadataPath, cacheKey, options.force)) return;

  mkdirSync(dirname(outPath), { recursive: true });
  if (options.force && existsSync(outPath)) rmSync(outPath);
  if (regionPath) writeRegion(regionPath, region);
  runPmtiles(command);
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${metadataPath}`);
}

function extractBbox(options, source, commandOptions) {
  const bounds = parseBbox(options.bbox);
  const bbox = formatBbox(bounds);
  const cacheKey = hashJson({
    kind: "bbox",
    source,
    bbox,
    minzoom: commandOptions.minzoom || null,
    maxzoom: commandOptions.maxzoom || null,
  });
  const outPath = resolveBboxOutputPath(options.output, options.name, cacheKey);
  const metadataPath = `${outPath}.json`;
  const command = buildPmtilesCommand(source, outPath, bbox, null, commandOptions);
  const metadata = {
    generatedAt: new Date().toISOString(),
    cacheKey,
    area: {
      name: options.name || "selected-area",
      bounds,
      bbox,
    },
    source: {
      pmtiles: source,
      profile: "traillite-v1",
      note: "Source PMTiles must use the layer schema expected by shared/styles/style_template.json.",
    },
    output: {
      pmtiles: outPath,
      metadata: metadataPath,
    },
    command,
  };

  if (options.dryRun) {
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  if (useCachedOutput(outPath, metadataPath, cacheKey, options.force)) return;

  mkdirSync(dirname(outPath), { recursive: true });
  if (options.force && existsSync(outPath)) rmSync(outPath);
  runPmtiles(command);
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${metadataPath}`);
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

function resolveGpxFiles(inputPath) {
  if (!existsSync(inputPath)) fail(`GPX input not found: ${inputPath}`);
  const stats = statSync(inputPath);
  if (stats.isFile()) return [inputPath];
  if (!stats.isDirectory()) fail(`GPX input is not a file or directory: ${inputPath}`);
  return readdirSync(inputPath)
    .filter((name) => name.toLowerCase().endsWith(".gpx"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => resolve(inputPath, name));
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

function buildRegion(coverage, routes, bufferMeters) {
  if (coverage === "bbox") return null;
  if (coverage === "route-bboxes") {
    return {
      type: "FeatureCollection",
      features: routes
        .filter((route) => route.rawBounds)
        .map((route) => ({
          type: "Feature",
          properties: { source: basename(route.file), coverage },
          geometry: {
            type: "Polygon",
            coordinates: [boundsRing(bufferedBounds(boundsPoints(route.rawBounds), bufferMeters))],
          },
        })),
    };
  }
  if (coverage === "corridor") {
    const features = [];
    for (const route of routes) {
      for (const polygon of corridorPolygons(route.points, bufferMeters)) {
        features.push({
          type: "Feature",
          properties: { source: basename(route.file), coverage },
          geometry: { type: "Polygon", coordinates: [polygon] },
        });
      }
    }
    return { type: "FeatureCollection", features };
  }
  fail(`Unsupported coverage: ${coverage}. Use bbox, route-bboxes, or corridor.`);
}

function corridorPolygons(points, bufferMeters) {
  if (points.length === 1) return [pointSquare(points[0], bufferMeters)];
  const polygons = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    polygons.push(segmentRectangle(start, end, bufferMeters));
  }
  return polygons;
}

function segmentRectangle(start, end, bufferMeters) {
  const center = {
    lat: (start.lat + end.lat) / 2,
    lon: (start.lon + end.lon) / 2,
  };
  const metersPerLat = 111320;
  const metersPerLon = Math.max(Math.cos(toRadians(center.lat)) * metersPerLat, 1);
  const sx = (start.lon - center.lon) * metersPerLon;
  const sy = (start.lat - center.lat) * metersPerLat;
  const ex = (end.lon - center.lon) * metersPerLon;
  const ey = (end.lat - center.lat) * metersPerLat;
  const dx = ex - sx;
  const dy = ey - sy;
  const length = Math.hypot(dx, dy);
  if (length === 0) return pointSquare(start, bufferMeters);

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const corners = [
    [sx - ux * bufferMeters + px * bufferMeters, sy - uy * bufferMeters + py * bufferMeters],
    [ex + ux * bufferMeters + px * bufferMeters, ey + uy * bufferMeters + py * bufferMeters],
    [ex + ux * bufferMeters - px * bufferMeters, ey + uy * bufferMeters - py * bufferMeters],
    [sx - ux * bufferMeters - px * bufferMeters, sy - uy * bufferMeters - py * bufferMeters],
  ].map(([x, y]) => [
    clamp(center.lon + x / metersPerLon, -180, 180),
    clamp(center.lat + y / metersPerLat, -90, 90),
  ]);
  corners.push(corners[0]);
  return corners;
}

function pointSquare(point, bufferMeters) {
  const bounds = bufferedBounds([point], bufferMeters);
  return boundsRing(bounds);
}

function boundsPoints(bounds) {
  return [
    { lon: bounds.minLon, lat: bounds.minLat },
    { lon: bounds.maxLon, lat: bounds.maxLat },
  ];
}

function boundsRing(bounds) {
  return [
    [bounds.minLon, bounds.minLat],
    [bounds.maxLon, bounds.minLat],
    [bounds.maxLon, bounds.maxLat],
    [bounds.minLon, bounds.maxLat],
    [bounds.minLon, bounds.minLat],
  ];
}

function writeRegion(path, region) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(region)}\n`);
}

function parseAttributes(text) {
  const attrs = {};
  const attrPattern = /\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/g;
  let match;
  while ((match = attrPattern.exec(text))) attrs[match[1]] = match[2];
  return attrs;
}

function rawBounds(points) {
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

function bufferedBounds(points, bufferMeters) {
  const bounds = rawBounds(points);
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

function buildPmtilesCommand(source, outPath, bbox, regionPath, options) {
  const args = ["extract", source, outPath, regionPath ? `--region=${regionPath}` : `--bbox=${bbox}`];
  if (options.minzoom) args.push(`--minzoom=${options.minzoom}`);
  if (options.maxzoom) args.push(`--maxzoom=${options.maxzoom}`);
  return { executable: "pmtiles", args };
}

function runPmtiles(command) {
  const result = spawnSync(command.executable, command.args, { stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    fail("pmtiles CLI not found. Install it first, for example: brew install pmtiles");
  }
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`pmtiles exited with status ${result.status}.`);
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

function resolveOutputPath(output, gpxInputPath, cacheKey) {
  if (output) return resolve(output);
  const stats = statSync(gpxInputPath);
  const routeName = stats.isDirectory()
    ? basename(gpxInputPath)
    : basename(gpxInputPath, extname(gpxInputPath));
  return resolve(defaults.outputDir, `${slugify(routeName)}-${cacheKey.slice(0, 10)}.pmtiles`);
}

function resolveBboxOutputPath(output, name, cacheKey) {
  if (output) return resolve(output);
  return resolve(defaults.outputDir, `${slugify(name || "selected-area")}-${cacheKey.slice(0, 10)}.pmtiles`);
}

function parseBbox(value) {
  const parts = value.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    fail("--bbox must be minLon,minLat,maxLon,maxLat.");
  }
  const [leftLon, bottomLat, rightLon, topLat] = parts;
  const bounds = {
    minLon: Math.min(leftLon, rightLon),
    minLat: Math.min(bottomLat, topLat),
    maxLon: Math.max(leftLon, rightLon),
    maxLat: Math.max(bottomLat, topLat),
  };
  if (bounds.minLon < -180 || bounds.maxLon > 180 || bounds.minLat < -90 || bounds.maxLat > 90) {
    fail("--bbox is outside valid lon/lat ranges.");
  }
  if (bounds.minLon === bounds.maxLon || bounds.minLat === bounds.maxLat) {
    fail("--bbox must cover a non-zero area.");
  }
  return bounds;
}

function formatBbox(bounds) {
  return [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat]
    .map((value) => value.toFixed(6))
    .join(",");
}

function isRemoteSource(source) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(source);
}

function resolveSource(source) {
  if (source === "local") return localSource;
  if (source === "protomaps" || source === "protomaps-latest") return protomapsSource;
  if (isRemoteSource(source)) return source;
  return resolve(source);
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value) {
  return hashText(JSON.stringify(value));
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "route-map";
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
  console.log(`TrailLite route map extractor

Usage:
  node mapdataservice/extract-route-map.mjs --gpx route.gpx [options]
  node mapdataservice/extract-route-map.mjs --gpx routes-directory [options]
  node mapdataservice/extract-route-map.mjs --bbox minLon,minLat,maxLon,maxLat [options]

Options:
  -g, --gpx <file-or-dir>      GPX route file or directory of .gpx files.
      --bbox <bbox>            Extract a selected map rectangle as minLon,minLat,maxLon,maxLat.
      --name <name>            Output name prefix for bbox extracts.
  -s, --source <pmtiles|url>   Source PMTiles archive.
                               Use "local" for shared/maps/finland.pmtiles.
                               Use "protomaps" for the bundled full z15 source URL.
                               Default: ${protomapsSource}
  -o, --out <file>             Output PMTiles path.
                               Default: mapdataservice/output/<gpx-name>.pmtiles
      --buffer-meters <n>      Padding around route bounds. Default: 10000
      --coverage <mode>        bbox, route-bboxes, or corridor. Default: corridor
      --minzoom <n>            Optional pmtiles extract minimum zoom.
      --maxzoom <n>            Optional pmtiles extract maximum zoom. Default: 15
      --force                  Overwrite existing output.
      --dry-run                Print computed bbox and command without extracting.
  -h, --help                   Show this help.

Generated files are written under mapdataservice/output by default. Outputs use a
content-based cache key and are reused unless --force is passed.
`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
