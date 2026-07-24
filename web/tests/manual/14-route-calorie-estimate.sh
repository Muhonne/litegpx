#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

rg -q "formatEstimatedCyclingCalories" web/src/lib/format.js
rg -q "calorieValue" web/index.html
rg -q "calorieValue: document\\.getElementById\\(\"calorieValue\"\\)" web/src/app.js
rg -q "elements\\.calorieValue\\.textContent = formatEstimatedCyclingCalories" web/src/app.js
rg -q "estimatedCyclingCalories" web/src/app.js

node --input-type=module - <<'NODE'
import assert from "node:assert/strict";
import {
  estimatedCyclingCalories,
  formatEstimatedCyclingCalories,
} from "./web/src/lib/format.js";

assert.equal(estimatedCyclingCalories(52_600), 1683);
assert.equal(formatEstimatedCyclingCalories(52_600), "~ 1,680");
assert.equal(formatEstimatedCyclingCalories(0), "0");
NODE

echo "Web route calorie estimate support is wired."
