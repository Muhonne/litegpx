#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");
const extractor = resolve(scriptDir, "extract-route-map.mjs");
const outputDir = resolve(scriptDir, "output");
const port = Number.parseInt(process.env.PORT || "5174", 10);
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";

createServer(async (request, response) => {
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
    if (request.method === "POST" && url.pathname === "/api/extract-bbox") {
      const body = await readJson(request);
      const result = await extractBbox(body);
      sendJson(response, 200, result);
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Request failed" });
  }
}).listen(port, "::", () => {
  console.log(`TrailLite map data service at http://localhost:${port}/api/health`);
});

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
    stdout: run.stdout.trim(),
  };
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
      if (raw.length > 100_000) rejectRead(new Error("request body too large"));
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
