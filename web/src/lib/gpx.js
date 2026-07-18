import { escapeXml } from "./format.js";

export function parseGpx(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML");
  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  const points = trkpts
    .map((element) => {
      const lat = Number.parseFloat(element.getAttribute("lat") || "");
      const lon = Number.parseFloat(element.getAttribute("lon") || "");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return [lon, lat];
    })
    .filter(Boolean);
  const name = doc.querySelector("metadata > name")?.textContent?.trim() ||
    doc.querySelector("trk > name")?.textContent?.trim() ||
    "";
  return { name, points };
}

export function exportGpx(routeName, points) {
  const safeName = escapeXml(routeName || "Untitled route");
  const trkpts = points
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}" />`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LiteGPX Web" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}
