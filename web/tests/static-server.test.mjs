#!/usr/bin/env node

import assert from "node:assert/strict";
import { createStaticServer, resolveByteRange } from "../scripts/serve.mjs";

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

const server = createStaticServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const rootResponse = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert.equal(rootResponse.status, 302, "root should redirect to the web app base path");
  assert.equal(rootResponse.headers.get("location"), "/web/");

  const scriptResponse = await fetch(`${baseUrl}/web/src/app.js`);
  assert.equal(scriptResponse.status, 200, "web app script should be served under /web/");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
