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
  const breakSpots = Array.from(doc.getElementsByTagName("wpt"))
    .map((element) => {
      const lat = Number.parseFloat(element.getAttribute("lat") || "");
      const lon = Number.parseFloat(element.getAttribute("lon") || "");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return {
        point: [lon, lat],
        name: element.querySelector("name")?.textContent?.trim() || "Break spot",
        description: element.querySelector("desc")?.textContent?.trim() || "",
      };
    })
    .filter(Boolean);
  const name = doc.querySelector("metadata > name")?.textContent?.trim() ||
    doc.querySelector("trk > name")?.textContent?.trim() ||
    "";
  return { name, points, breakSpots };
}

export function exportGpx(routeName, points, breakSpots = []) {
  const safeName = escapeXml(routeName || "Untitled route");
  const waypoints = breakSpots
    .map((spot) => {
      const [lon, lat] = spot.point;
      const name = escapeXml(spot.name || "Break spot");
      const description = spot.description ? `\n    <desc>${escapeXml(spot.description)}</desc>` : "";
      return `  <wpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">\n    <name>${name}</name>${description}\n  </wpt>`;
    })
    .join("\n");
  const trkpts = points
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}" />`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LiteGPX Web" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
${waypoints ? `${waypoints}\n` : ""}
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}
