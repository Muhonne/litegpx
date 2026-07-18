export const EARTH_RADIUS_METERS = 6371000;

export function bboxFromPoints(first, second) {
  return [
    Math.min(first[0], second[0]),
    Math.min(first[1], second[1]),
    Math.max(first[0], second[0]),
    Math.max(first[1], second[1]),
  ];
}

export function bboxAreaIsUsable(bbox) {
  return Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every(Number.isFinite) &&
    Math.abs(bbox[2] - bbox[0]) > 0.00005 &&
    Math.abs(bbox[3] - bbox[1]) > 0.00005;
}

export function pointToSegmentDistanceMeters(point, start, end) {
  const origin = start;
  const meanLat = toRadians((point[1] + start[1] + end[1]) / 3);
  const project = ([lon, lat]) => [
    toRadians(lon - origin[0]) * EARTH_RADIUS_METERS * Math.cos(meanLat),
    toRadians(lat - origin[1]) * EARTH_RADIUS_METERS,
  ];
  return pointToSegmentDistance(project(point), project(start), project(end));
}

export function nearestScreenPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return {
      x: start.x,
      y: start.y,
      distance: Math.hypot(point.x - start.x, point.y - start.y),
    };
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return {
    x,
    y,
    distance: Math.hypot(point.x - x, point.y - y),
  };
}

export function isScreenPointInsideCanvas(point, canvas) {
  return point.x >= 0 && point.y >= 0 && point.x <= canvas.clientWidth && point.y <= canvas.clientHeight;
}

export function nearestSegmentIndex(point, routePoints) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < routePoints.length - 1; index++) {
    const distance = pointToSegmentDistance(point, routePoints[index], routePoints[index + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function pointToSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    const pointDx = point[0] - start[0];
    const pointDy = point[1] - start[1];
    return Math.sqrt(pointDx * pointDx + pointDy * pointDy);
  }
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  const projection = [start[0] + t * dx, start[1] + t * dy];
  const projectionDx = point[0] - projection[0];
  const projectionDy = point[1] - projection[1];
  return Math.sqrt(projectionDx * projectionDx + projectionDy * projectionDy);
}

export function totalDistance(points) {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += distanceBetween(points[index - 1], points[index]);
  }
  return meters;
}

export function distanceBetween(left, right) {
  const lat1 = toRadians(left[1]);
  const lat2 = toRadians(right[1]);
  const deltaLat = toRadians(right[1] - left[1]);
  const deltaLon = toRadians(right[0] - left[0]);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function toRadians(value) {
  return value * Math.PI / 180;
}

export function clonePoints(points) {
  return points.map((point) => [...point]);
}
