import { distanceBetween } from "../lib/geo.js";
import { normalizeSearchText } from "../lib/format.js";

export function routesPreservedForRefresh(routes, routeIds = []) {
  const ids = new Set(routeIds.filter(Boolean));
  if (ids.size === 0) return [];
  return routes.filter((route) => ids.has(route.id));
}

export function mergePreservedMobileRoutes(routes, preservedRoutes) {
  if (preservedRoutes.length === 0) return routes;
  const preservedById = new Map(preservedRoutes.map((route) => [route.id, route]));
  const routeIds = new Set(routes.map((route) => route.id));
  return [
    ...routes.map((route) => preservedById.get(route.id) || route),
    ...preservedRoutes.filter((route) => !routeIds.has(route.id)),
  ].sort((left, right) => (left.title || left.id).localeCompare(right.title || right.id, "fi"));
}

export function nextMobileRouteSelection(selectedId, filteredRoutes, loadedRouteId = null) {
  if (filteredRoutes.some((route) => route.id === selectedId)) return selectedId;
  if (loadedRouteId && filteredRoutes.some((route) => route.id === loadedRouteId)) {
    return loadedRouteId;
  }
  return filteredRoutes[0]?.id || "";
}

export function mobileRouteComparator(sortMode, mapCenter) {
  if (sortMode === "name") {
    return (left, right) => compareRouteTitle(left, right);
  }
  if (sortMode === "length") {
    return (left, right) =>
      compareNullableNumber(left.lengthKm, right.lengthKm) || compareRouteTitle(left, right);
  }
  return (left, right) =>
    compareNullableNumber(routeDistanceFromMapCenter(left, mapCenter), routeDistanceFromMapCenter(right, mapCenter)) ||
    compareRouteTitle(left, right);
}

export function mobileRouteDisplayTitle(route, loadedRouteId = null, unsavedRouteName = null) {
  return route.id === loadedRouteId && unsavedRouteName
    ? unsavedRouteName
    : (route.title || route.id);
}

export function mobileRouteStatusText(filteredRoutes, options) {
  const {
    allRouteCount,
    filter,
    selectedRouteId,
  } = options;
  if (allRouteCount === 0) return "No app routes found.";
  const selectedRoute = filteredRoutes.find((route) => route.id === selectedRouteId);
  const countText = filter
    ? `${filteredRoutes.length} of ${allRouteCount} app routes`
    : `${allRouteCount} app routes`;
  if (!selectedRoute) return `${countText}.`;
  const pointCount = Number.isFinite(selectedRoute.trackPointCount) ? `${selectedRoute.trackPointCount} pts` : "unknown points";
  const length = Number.isFinite(selectedRoute.lengthKm) ? `${selectedRoute.lengthKm.toFixed(1)} km` : "unknown length";
  return `${countText}. Selected ${length}, ${pointCount}.`;
}

export function mobileRouteLabel(route) {
  const pointCount = Number.isFinite(route.trackPointCount) ? `, ${route.trackPointCount} pts` : "";
  const length = Number.isFinite(route.lengthKm) ? ` (${route.lengthKm.toFixed(1)} km${pointCount})` : pointCount ? ` (${pointCount.slice(2)})` : "";
  return `${route.title || route.id}${length}`;
}

export function mobileRouteMeta(route) {
  const parts = [];
  if (Number.isFinite(route.lengthKm)) parts.push(`${route.lengthKm.toFixed(1)} km`);
  if (Number.isFinite(route.trackPointCount)) parts.push(`${route.trackPointCount} pts`);
  const source = mobileRouteSourceLabel(route.source);
  if (source) parts.push(source);
  return parts.join(" · ") || route.id || "Route";
}

export function routeMatchesMobileFilter(route, filterText, displayTitle = route.title || route.id) {
  const filter = normalizeSearchText(filterText);
  if (!filter) return true;
  return normalizeSearchText([
    route.id,
    displayTitle,
    route.title,
    mobileRouteMeta(route),
    route.source,
    Number.isFinite(route.lengthKm) ? `${route.lengthKm.toFixed(1)} km` : "",
  ].filter(Boolean).join(" ")).includes(filter);
}

export function mobileRouteSourceLabel(source) {
  return source === "TrailLite GPX Builder" ? "LiteGPX" : source;
}

function compareRouteTitle(left, right) {
  return (left.title || left.id || "").localeCompare(right.title || right.id || "", "fi", { sensitivity: "base" });
}

function compareNullableNumber(left, right) {
  const normalizedLeft = Number.isFinite(left) ? left : Number.POSITIVE_INFINITY;
  const normalizedRight = Number.isFinite(right) ? right : Number.POSITIVE_INFINITY;
  return normalizedLeft - normalizedRight;
}

function routeDistanceFromMapCenter(route, mapCenter) {
  if (!mapCenter || !routeBoundsAreUsable(route?.bounds)) return null;
  const nearest = {
    lng: clamp(mapCenter[0], route.bounds.minLon, route.bounds.maxLon),
    lat: clamp(mapCenter[1], route.bounds.minLat, route.bounds.maxLat),
  };
  return distanceBetween(mapCenter, [nearest.lng, nearest.lat]);
}

function routeBoundsAreUsable(bounds) {
  return Number.isFinite(bounds?.minLon) &&
    Number.isFinite(bounds?.minLat) &&
    Number.isFinite(bounds?.maxLon) &&
    Number.isFinite(bounds?.maxLat);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
