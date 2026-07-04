import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

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

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/web/";
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
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        response.end();
        return;
      }
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Number.parseInt(match[2], 10) : info.size - 1;
      if (start >= info.size || end >= info.size || start > end) {
        response.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        response.end();
        return;
      }
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
}).listen(port, "::", () => {
  console.log(`Serving ${root} at http://localhost:${port}/web/`);
});
