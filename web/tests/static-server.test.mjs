#!/usr/bin/env node

import assert from "node:assert/strict";
import { resolveByteRange } from "../scripts/serve.mjs";

assert.deepEqual(
  resolveByteRange("bytes=-16384", 4843),
  { start: 0, end: 4842 },
  "oversized suffix ranges should return the full small file",
);
assert.deepEqual(
  resolveByteRange("bytes=10-", 100),
  { start: 10, end: 99 },
  "open-ended ranges should end at the last byte",
);
assert.deepEqual(
  resolveByteRange("bytes=10-999", 100),
  { start: 10, end: 99 },
  "overlong explicit ranges should clamp to the last byte",
);
assert.equal(resolveByteRange("bytes=100-101", 100), null, "ranges past EOF are unsatisfiable");
assert.equal(resolveByteRange("bytes=-0", 100), null, "empty suffix ranges are invalid");
