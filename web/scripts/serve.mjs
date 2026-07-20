import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const port = Number.parseInt(process.env.PORT || "5173", 10);
const root = resolve(new URL("../..", import.meta.url).pathname);

const types = {
  ".css": "text/css; charset=utf-8",
  ".gpx": "application/gpx+xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pbf": "application/x-protobuf",
  ".pmtiles": "application/octet-stream",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://localhost:${port}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        response.writeHead(302, { Location: "/web/" });
        response.end();
        return;
      }
      if (pathname.endsWith("/")) pathname += "index.html";

      const file = normalize(join(root, pathname));
      if (!file.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const info = await stat(file);
      if (!info.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      };

      const range = request.headers.range;
      if (range) {
        const byteRange = resolveByteRange(range, info.size);
        if (!byteRange) {
          response.writeHead(416, { "Content-Range": `bytes */${info.size}` });
          response.end();
          return;
        }
        const { start, end } = byteRange;
        response.writeHead(206, {
          ...headers,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
        });
        createReadStream(file, { start, end }).pipe(response);
        return;
      }

      response.writeHead(200, {
        ...headers,
        "Content-Length": info.size,
      });
      createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
  });
}

function resolveByteRange(range, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range || "");
  if (!match || size < 1) return null;
  if (!match[1] && !match[2]) return null;
  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= size ||
    start > end
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createStaticServer().listen(port, "::", () => {
    console.log(`Serving ${root} at http://localhost:${port}/web/`);
  });
}

export { createStaticServer, resolveByteRange };
