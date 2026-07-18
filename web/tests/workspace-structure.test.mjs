#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const workspace = resolve(new URL("../..", import.meta.url).pathname);

const featureDocs = [
  "mobile-offline-navigation.md",
  "data-service-provider-enrichment.md",
  "web-route-creation.md",
  "web-gpx-import-editing.md",
  "web-mobile-route-management.md",
  "web-map-data-management.md",
  "web-mobile-workspace-save.md",
  "web-planning-detail-download.md",
];

const appModules = [
  "features/map-style.js",
  "features/mobile-routes.js",
  "features/places.js",
  "features/route-layers.js",
  "lib/format.js",
  "lib/geo.js",
  "lib/gpx.js",
];

async function fileExists(path) {
  await access(path);
  return true;
}

async function readWorkspaceFile(path) {
  return readFile(join(workspace, path), "utf8");
}

function lineCount(text) {
  return text.trimEnd().split("\n").length;
}

async function assertWorkspaceCodeRefsExist(path) {
  const text = await readWorkspaceFile(path);
  const codeRefs = [...text.matchAll(/`((?:AGENTS\.md|docs|web|mobile|mapdataservice|shared)\/?[^`\s]*)`/g)]
    .map((match) => match[1])
    .filter((ref) => ref && !ref.includes("*"));
  for (const codeRef of codeRefs) {
    await fileExists(join(workspace, codeRef));
  }
}

const useCasesIndex = await readFile(join(workspace, "docs/USE_CASES.md"), "utf8");
const featuresIndex = await readFile(join(workspace, "docs/FEATURES.md"), "utf8");
const productDoc = await readFile(join(workspace, "docs/PRODUCT.md"), "utf8");
const dataDoc = await readFile(join(workspace, "docs/DATA.md"), "utf8");
const mapServiceAgentDoc = await readFile(join(workspace, "mapdataservice/AGENTS.md"), "utf8");

assert.match(useCasesIndex, /FEATURES\.md/, "USE_CASES.md should point readers to FEATURES.md");
assert.doesNotMatch(useCasesIndex, /```gherkin/, "USE_CASES.md should be an index, not the feature scenario source");
assert.ok(lineCount(useCasesIndex) <= 12, "USE_CASES.md should stay as a short compatibility pointer");
assert.ok(lineCount(productDoc) <= 220, "PRODUCT.md should stay short enough for agents to read");
assert.ok(lineCount(dataDoc) <= 240, "DATA.md should stay focused on data contracts and ownership");
assert.ok(lineCount(mapServiceAgentDoc) <= 90, "mapdataservice/AGENTS.md should avoid duplicating README command docs");
assert.doesNotMatch(productDoc, /\bplanned web app\b|v1 product plan|Candidate v1|Sprint \d|format is broken|format is fucked/i);
assert.doesNotMatch(dataDoc, /web\/src\/app\.js`\s+`(?:parseGpx|exportGpx|loadStyle|classifyDetailMapKind|detailLayerForMap|providerLayerPaintOverrides)/);

for (const featureDoc of featureDocs) {
  const path = join(workspace, "docs/features", featureDoc);
  await fileExists(path);
  const text = await readFile(path, "utf8");
  assert.match(text, /^# /m, `${featureDoc} should have a title`);
  assert.match(text, /^## Description/m, `${featureDoc} should have a Description section`);
  assert.match(text, /^## Code/m, `${featureDoc} should have a Code section`);
  assert.match(text, /^## Verification/m, `${featureDoc} should have a Verification section`);
  assert.match(text, /```gherkin[\s\S]*Feature:/, `${featureDoc} should contain a Gherkin feature`);
  assert.equal((text.match(/^\s*Scenario:/gm) || []).length, 1, `${featureDoc} should keep one simple scenario`);

  const codeRefs = [...text.matchAll(/`((?:web|mobile|mapdataservice|shared)\/[^`]+)`/g)]
    .map((match) => match[1].split(/\s+/)[0]);
  assert.ok(codeRefs.length > 0, `${featureDoc} should cite concrete code paths`);
  for (const codeRef of codeRefs) {
    await fileExists(join(workspace, codeRef));
  }

  assert.ok(
    featuresIndex.includes(`features/${featureDoc}`),
    `FEATURES.md should link to ${featureDoc}`,
  );
}

for (const docPath of [
  "AGENTS.md",
  "docs/PRODUCT.md",
  "docs/DATA.md",
  "docs/FEATURES.md",
  "docs/USE_CASES.md",
  ...featureDocs.map((featureDoc) => `docs/features/${featureDoc}`),
]) {
  await assertWorkspaceCodeRefsExist(docPath);
}

const appJs = await readFile(join(workspace, "web/src/app.js"), "utf8");
for (const modulePath of appModules) {
  await fileExists(join(workspace, "web/src", modulePath));
  assert.ok(
    appJs.includes(`from "./${modulePath}"`),
    `app.js should import ${modulePath}`,
  );
}
