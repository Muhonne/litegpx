import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const workspace = join(root, "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const item of ["index.html", "src", "vendor"]) {
  await cp(join(root, item), join(dist, item), { recursive: true });
}

await mkdir(join(dist, "shared"), { recursive: true });
for (const item of ["maps", "styles", "glyphs"]) {
  await cp(join(workspace, "shared", item), join(dist, "shared", item), { recursive: true });
}
