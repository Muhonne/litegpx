import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const vendor = join(root, "vendor");

const files = [
  {
    from: join(root, "node_modules/maplibre-gl/dist/maplibre-gl.js"),
    to: join(vendor, "maplibre-gl/maplibre-gl.js"),
  },
  {
    from: join(root, "node_modules/maplibre-gl/dist/maplibre-gl.css"),
    to: join(vendor, "maplibre-gl/maplibre-gl.css"),
  },
  {
    from: join(root, "node_modules/pmtiles/dist/pmtiles.js"),
    to: join(vendor, "pmtiles/pmtiles.js"),
  },
  {
    from: join(root, "node_modules/@mapbox/togeojson/togeojson.js"),
    to: join(vendor, "togeojson/togeojson.js"),
  },
];

await rm(vendor, { recursive: true, force: true });
for (const file of files) {
  await mkdir(dirname(file.to), { recursive: true });
  await copyFile(file.from, file.to);
}
