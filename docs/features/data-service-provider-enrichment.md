# Data Service Provider Enrichment

## Description

The map data service owns external map-data work. It extracts base PMTiles packages, downloads or reads Finnish provider data, normalizes provider features into LiteGPX-compatible layers, and emits provider overlay PMTiles for web and Android.

## Code

- `mapdataservice/server.mjs` exposes local APIs, chooses provider settings, runs extract/build commands, and returns generated dataset metadata.
- `mapdataservice/extract-route-map.mjs` extracts base PMTiles for route corridors or selected bboxes.
- `mapdataservice/build-finnish-map.mjs` downloads Digiroad and NLS provider data, normalizes it, caches raw inputs, and writes provider PMTiles overlays.
- `mapdataservice/protomaps-source.mjs` resolves current Protomaps source metadata with a documented fallback.
- `mapdataservice/tests/fixtures/nls/tieviiva.geojson` and `mapdataservice/tests/fixtures/nls/rakennus.geojson` provide local NLS fixture data for smoke checks.
- `shared/styles/style_template.json` defines the source-layer names the generated provider overlays must match.

## Scenario

```gherkin
Feature: Data service provider enrichment
  Scenario: Build a Finnish provider overlay for a route or bbox
    Given the data service receives a route corridor or bbox request
    When Digiroad or NLS provider enrichment is enabled
    Then the service obtains provider data for the requested area
    And it normalizes roads, paths, and buildings into LiteGPX-compatible layers
    And it writes a provider PMTiles overlay under mapdataservice/output
    And web or Android can render that overlay above the base PMTiles map
```
