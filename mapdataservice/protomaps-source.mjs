const DEFAULT_PROTOMAPS_BUILD_METADATA_URL = "https://build-metadata.protomaps.dev/builds.json";
const DEFAULT_PROTOMAPS_BUILD_BASE_URL = "https://build.protomaps.com";
const FALLBACK_PROTOMAPS_BUILD_KEY = "20260716.pmtiles";

function fallbackProtomapsSourceUrl(baseUrl = DEFAULT_PROTOMAPS_BUILD_BASE_URL) {
  return `${baseUrl.replace(/\/$/, "")}/${FALLBACK_PROTOMAPS_BUILD_KEY}`;
}

function latestProtomapsSourceFromBuilds(builds, { baseUrl = DEFAULT_PROTOMAPS_BUILD_BASE_URL, fallbackUrl } = {}) {
  if (!Array.isArray(builds)) return fallbackUrl || fallbackProtomapsSourceUrl(baseUrl);
  const latest = builds
    .map((build) => String(build?.key || ""))
    .filter((key) => /^\d{8}\.pmtiles$/.test(key))
    .sort((left, right) => right.localeCompare(left))[0];
  return latest ? `${baseUrl.replace(/\/$/, "")}/${latest}` : fallbackUrl || fallbackProtomapsSourceUrl(baseUrl);
}

async function latestProtomapsSourceUrl({
  fetchImpl = globalThis.fetch,
  metadataUrl = process.env.PROTOMAPS_BUILDS_URL || DEFAULT_PROTOMAPS_BUILD_METADATA_URL,
  baseUrl = process.env.PROTOMAPS_BUILD_BASE_URL || DEFAULT_PROTOMAPS_BUILD_BASE_URL,
  fallbackUrl = process.env.PROTOMAPS_FALLBACK_SOURCE || fallbackProtomapsSourceUrl(baseUrl),
} = {}) {
  if (process.env.PROTOMAPS_SOURCE) return process.env.PROTOMAPS_SOURCE;
  if (typeof fetchImpl !== "function") return fallbackUrl;
  try {
    const response = await fetchImpl(metadataUrl, { cache: "no-store" });
    if (!response.ok) return fallbackUrl;
    return latestProtomapsSourceFromBuilds(await response.json(), { baseUrl, fallbackUrl });
  } catch {
    return fallbackUrl;
  }
}

export {
  DEFAULT_PROTOMAPS_BUILD_METADATA_URL,
  FALLBACK_PROTOMAPS_BUILD_KEY,
  fallbackProtomapsSourceUrl,
  latestProtomapsSourceFromBuilds,
  latestProtomapsSourceUrl,
};
