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

const useCasesIndex = await readFile(join(workspace, "docs/USE_CASES.md"), "utf8");
assert.match(useCasesIndex, /docs\/features|features\//, "USE_CASES.md should point readers to split feature docs");
assert.doesNotMatch(useCasesIndex, /```gherkin/, "USE_CASES.md should be an index, not the feature scenario source");

for (const featureDoc of featureDocs) {
  const path = join(workspace, "docs/features", featureDoc);
  await fileExists(path);
  const text = await readFile(path, "utf8");
  assert.match(text, /^# /m, `${featureDoc} should have a title`);
  assert.match(text, /^## Description/m, `${featureDoc} should have a Description section`);
  assert.match(text, /^## Code/m, `${featureDoc} should have a Code section`);
  assert.match(text, /```gherkin[\s\S]*Feature:/, `${featureDoc} should contain a Gherkin feature`);
  assert.equal((text.match(/^\s*Scenario:/gm) || []).length, 1, `${featureDoc} should keep one simple scenario`);

  const codeRefs = [...text.matchAll(/`((?:web|mobile|mapdataservice|shared)\/[^`]+)`/g)]
    .map((match) => match[1].split(/\s+/)[0]);
  assert.ok(codeRefs.length > 0, `${featureDoc} should cite concrete code paths`);
  for (const codeRef of codeRefs) {
    await fileExists(join(workspace, codeRef));
  }

  assert.ok(
    useCasesIndex.includes(`features/${featureDoc}`),
    `USE_CASES.md should link to ${featureDoc}`,
  );
}

const appJs = await readFile(join(workspace, "web/src/app.js"), "utf8");
for (const modulePath of appModules) {
  await fileExists(join(workspace, "web/src", modulePath));
  assert.ok(
    appJs.includes(`from "./${modulePath}"`),
    `app.js should import ${modulePath}`,
  );
}
