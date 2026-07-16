#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  fallbackProtomapsSourceUrl,
  latestProtomapsSourceFromBuilds,
  latestProtomapsSourceUrl,
} from "../protomaps-source.mjs";

assert.equal(
  latestProtomapsSourceFromBuilds([
    { key: "20260715.pmtiles" },
    { key: "not-a-build.txt" },
    { key: "20260716.pmtiles" },
  ]),
  "https://build.protomaps.com/20260716.pmtiles",
);

assert.equal(
  latestProtomapsSourceFromBuilds([], { fallbackUrl: "https://example.test/fallback.pmtiles" }),
  "https://example.test/fallback.pmtiles",
);

assert.equal(
  await latestProtomapsSourceUrl({
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ key: "20260714.pmtiles" }, { key: "20260716.pmtiles" }],
    }),
  }),
  "https://build.protomaps.com/20260716.pmtiles",
);

assert.equal(
  await latestProtomapsSourceUrl({
    fetchImpl: async () => ({ ok: false }),
    fallbackUrl: "https://example.test/fallback.pmtiles",
  }),
  "https://example.test/fallback.pmtiles",
);

assert.equal(fallbackProtomapsSourceUrl(), "https://build.protomaps.com/20260716.pmtiles");
