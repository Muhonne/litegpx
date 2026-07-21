package com.example.traillite

import android.content.Context
import android.graphics.Color
import android.location.Location
import android.net.Uri
import android.os.SystemClock
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleOpacity
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.lineCap
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineJoin
import org.maplibre.android.style.layers.PropertyFactory.lineOpacity
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.PropertyFactory.textAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.textAnchor
import org.maplibre.android.style.layers.PropertyFactory.textColor
import org.maplibre.android.style.layers.PropertyFactory.textField
import org.maplibre.android.style.layers.PropertyFactory.textHaloColor
import org.maplibre.android.style.layers.PropertyFactory.textHaloWidth
import org.maplibre.android.style.layers.PropertyFactory.textOffset
import org.maplibre.android.style.layers.PropertyFactory.textSize
import org.maplibre.android.style.layers.PropertyFactory.visibility
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import java.io.File
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

class TrailMapController(
    private val context: Context,
    private val mapView: MapView,
    private val map: MapLibreMap,
    private val storage: TrailStorage,
    private val onZoomChanged: (Double) -> Unit,
) {
    private var currentStyle: Style? = null
    private var trackPoints: List<GeoPoint> = emptyList()
    private var breakSpots: List<RouteBreakSpot> = emptyList()
    private var latestLocation: LatLng? = null
    private var latestLocationFix: Location? = null
    private var lastRenderedLocation: LatLng? = null
    private var currentMapPackage: File? = null
    private var followPausedUntilMs: Long = 0L
    private var lastNavigationBearing: Double? = null
    private var locationUpdateCount = 0
    private var trackingActive = false
    private var layerSettings = MapLayerSettings()

    init {
        mapView.setMaximumFps(12)
        map.uiSettings.isCompassEnabled = true
        map.uiSettings.isRotateGesturesEnabled = true
        map.addOnCameraMoveStartedListener { reason ->
            if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) {
                pauseNavigationFollow()
            }
        }
        map.addOnCameraIdleListener {
            onZoomChanged(map.cameraPosition.zoom)
        }
    }

    fun loadInitialStyle(mapPackage: File?) {
        loadStyle(mapPackage)
    }

    fun loadStyle(mapPackage: File?) {
        currentMapPackage = mapPackage
        val styleUri = if (mapPackage == null) {
            "asset://styles/style_empty.json"
        } else {
            Uri.fromFile(storage.writeLocalStyle(mapPackage, layerSettings.darkTheme)).toString()
        }
        map.setStyle(styleUri) { style ->
            currentStyle = style
            applyLayerSettings(layerSettings)
            ensureOverlaySources(style)
            renderTrack()
            renderBreakSpots()
            lastRenderedLocation = null
            onZoomChanged(map.cameraPosition.zoom)
            latestLocation?.let { updateLocationDot(it) }
        }
    }

    fun applyLayerSettings(settings: MapLayerSettings) {
        val previousSettings = layerSettings
        val reloadStyle = settings.darkTheme != layerSettings.darkTheme
        layerSettings = settings
        if (settings.moveMapEveryLocationUpdates != previousSettings.moveMapEveryLocationUpdates) {
            locationUpdateCount = 0
        }
        if (reloadStyle && currentMapPackage != null) {
            loadStyle(currentMapPackage)
            return
        }
        val style = currentStyle ?: return
        setLayerVisible(style, STREET_NAMES_LAYER_ID, settings.streetNames)
        setLayerVisible(style, POI_DOTS_LAYER_ID, settings.pois)
        setLayerVisible(style, POI_NAMES_LAYER_ID, settings.pois)
        setLayerVisible(style, BUILDINGS_LAYER_ID, settings.buildings)
        setLayerVisible(style, PATHS_HIGHLIGHT_CASING_LAYER_ID, settings.minorPaths)
        setLayerVisible(style, PATHS_HIGHLIGHT_LAYER_ID, settings.minorPaths)
        setLayerVisible(style, ROADS_MINOR_CASING_LAYER_ID, settings.minorPaths)
        setLayerVisible(style, ROADS_MINOR_LAYER_ID, settings.minorPaths)
        val trackingZoomChanged = settings.automaticTrackingZoom != previousSettings.automaticTrackingZoom ||
            settings.trackingZoomLevel != previousSettings.trackingZoomLevel
        if (trackingActive && trackingZoomChanged) {
            latestLocationFix?.let { location ->
                updateNavigationCamera(location, LatLng(location.latitude, location.longitude), force = true)
            }
        }
    }

    fun setTrack(points: List<GeoPoint>) {
        setRoute(GpxRoute(trackPoints = points))
    }

    fun setRoute(route: GpxRoute) {
        val points = route.trackPoints
        trackPoints = points
        breakSpots = route.breakSpots
        lastNavigationBearing = null
        locationUpdateCount = 0
        renderTrack()
        renderBreakSpots()
        fitTrackIfUseful(points)
    }

    fun setTrackingActive(active: Boolean) {
        if (trackingActive != active) locationUpdateCount = 0
        trackingActive = active
        if (!active) return
        latestLocationFix?.let { location ->
            updateNavigationCamera(location, LatLng(location.latitude, location.longitude), force = true)
        }
    }

    fun onLocation(location: Location): Boolean {
        val latLng = LatLng(location.latitude, location.longitude)
        latestLocation = latLng
        latestLocationFix = Location(location)
        if (currentStyle == null) return false

        updateLocationDot(latLng)
        if (shouldMoveCameraForLocationUpdate()) {
            updateNavigationCamera(location, latLng)
        }
        lastRenderedLocation = latLng
        return true
    }

    fun onLowMemory() {
        mapView.onLowMemory()
    }

    private fun renderTrack() {
        val style = currentStyle ?: return
        ensureOverlaySources(style)
        val source = style.getSource(TRACK_SOURCE_ID) as? GeoJsonSource ?: return
        if (trackPoints.size < 2) {
            source.setGeoJson(emptyFeatures())
            return
        }

        val line = LineString.fromLngLats(
            trackPoints.map { point -> Point.fromLngLat(point.longitude, point.latitude) },
        )
        source.setGeoJson(FeatureCollection.fromFeatures(listOf(Feature.fromGeometry(line))))
    }

    private fun renderBreakSpots() {
        val style = currentStyle ?: return
        ensureOverlaySources(style)
        val source = style.getSource(BREAK_SPOTS_SOURCE_ID) as? GeoJsonSource ?: return
        if (breakSpots.isEmpty()) {
            source.setGeoJson(emptyFeatures())
            return
        }

        source.setGeoJson(
            FeatureCollection.fromFeatures(
                breakSpots.map { spot ->
                    Feature.fromGeometry(
                        Point.fromLngLat(spot.point.longitude, spot.point.latitude),
                    ).also { feature ->
                        feature.addStringProperty("name", spot.name)
                        spot.description?.let { feature.addStringProperty("description", it) }
                    }
                },
            ),
        )
    }

    private fun updateLocationDot(latLng: LatLng) {
        val style = currentStyle ?: return
        ensureOverlaySources(style)
        val source = style.getSource(LOCATION_SOURCE_ID) as? GeoJsonSource ?: return
        val point = Point.fromLngLat(latLng.longitude, latLng.latitude)
        source.setGeoJson(FeatureCollection.fromFeatures(listOf(Feature.fromGeometry(point))))
    }

    private fun pauseNavigationFollow() {
        followPausedUntilMs = SystemClock.elapsedRealtime() + FOLLOW_PAUSE_AFTER_GESTURE_MS
    }

    private fun updateNavigationCamera(location: Location, latLng: LatLng, force: Boolean = false) {
        if (!trackingActive && !force) return
        if (!force && SystemClock.elapsedRealtime() < followPausedUntilMs) return
        val bearing = navigationBearing(location)
        val automaticTrackingZoom = layerSettings.automaticTrackingZoom && trackPoints.size >= 2
        val cameraBuilder = CameraPosition.Builder(map.cameraPosition)
            .target(latLng)
            .bearing(bearing)
            .padding(0.0, navigationTopPaddingPx().toDouble(), 0.0, 0.0)
        if (automaticTrackingZoom) {
            cameraBuilder.zoom(layerSettings.trackingZoomLevel)
        }
        val camera = cameraBuilder.build()
        map.moveCamera(CameraUpdateFactory.newCameraPosition(camera))
        onZoomChanged(camera.zoom)
    }

    private fun shouldMoveCameraForLocationUpdate(): Boolean {
        if (!trackingActive) return false
        locationUpdateCount += 1
        return locationUpdateCount % layerSettings.moveMapEveryLocationUpdates == 0
    }

    private fun routeLookaheadBearing(location: Location): Double? {
        if (trackPoints.size < 2) return null
        val projection = projectOnRoute(GeoPoint(location.latitude, location.longitude)) ?: return null
        val lookahead = pointAtDistance(projection.distanceFromStartMeters + ROUTE_LOOKAHEAD_METERS) ?: return null
        if (projection.point.distanceTo(lookahead) < MIN_BEARING_DISTANCE_METERS) {
            val lookbehind = pointAtDistance(max(0.0, projection.distanceFromStartMeters - ROUTE_LOOKAHEAD_METERS))
                ?: return null
            return lookbehind.bearingTo(projection.point)
        }
        return projection.point.bearingTo(lookahead)
    }

    private fun navigationBearing(location: Location): Double {
        if (trackPoints.size < 2) {
            lastNavigationBearing = NORTH_UP_BEARING
            return NORTH_UP_BEARING
        }
        return smoothedBearing(movingGpsBearing(location) ?: routeLookaheadBearing(location) ?: map.cameraPosition.bearing)
    }

    private fun movingGpsBearing(location: Location): Double? {
        if (!location.hasBearing()) return null
        if (location.hasSpeed() && location.speed < MIN_GPS_BEARING_SPEED_METERS_PER_SECOND) return null
        return location.bearing.toDouble()
    }

    private fun smoothedBearing(nextBearing: Double): Double {
        val previous = lastNavigationBearing
        if (previous == null) {
            lastNavigationBearing = nextBearing
            return nextBearing
        }
        val difference = bearingDelta(previous, nextBearing)
        if (abs(difference) < MIN_BEARING_CHANGE_DEGREES) return previous
        val smoothed = normalizeBearing(previous + difference * BEARING_SMOOTHING_FACTOR)
        lastNavigationBearing = smoothed
        return smoothed
    }

    private fun navigationTopPaddingPx(): Float {
        return (mapView.height * NAVIGATION_TOP_PADDING_RATIO).coerceAtLeast(0f)
    }

    private fun projectOnRoute(location: GeoPoint): RouteProjection? {
        var cumulativeDistance = 0.0
        var best: RouteProjection? = null

        for (index in 0 until trackPoints.lastIndex) {
            val start = trackPoints[index]
            val end = trackPoints[index + 1]
            val segmentDistance = start.distanceTo(end)
            val projection = projectOntoSegment(location, start, end)
            val distanceToProjection = location.distanceTo(projection.point)
            if (best == null || distanceToProjection < best.distanceToRouteMeters) {
                best = RouteProjection(
                    point = projection.point,
                    distanceFromStartMeters = cumulativeDistance + segmentDistance * projection.fraction,
                    distanceToRouteMeters = distanceToProjection,
                )
            }
            cumulativeDistance += segmentDistance
        }

        return best
    }

    private fun pointAtDistance(distanceFromStartMeters: Double): GeoPoint? {
        if (trackPoints.isEmpty()) return null
        if (distanceFromStartMeters <= 0.0) return trackPoints.first()

        var cumulativeDistance = 0.0
        for (index in 0 until trackPoints.lastIndex) {
            val start = trackPoints[index]
            val end = trackPoints[index + 1]
            val segmentDistance = start.distanceTo(end)
            if (cumulativeDistance + segmentDistance >= distanceFromStartMeters) {
                val fraction = if (segmentDistance == 0.0) {
                    0.0
                } else {
                    ((distanceFromStartMeters - cumulativeDistance) / segmentDistance).coerceIn(0.0, 1.0)
                }
                return start.interpolateTo(end, fraction)
            }
            cumulativeDistance += segmentDistance
        }

        return trackPoints.last()
    }

    private fun projectOntoSegment(point: GeoPoint, start: GeoPoint, end: GeoPoint): SegmentProjection {
        val originLat = point.latitude.toRadians()
        val metersPerLat = EARTH_RADIUS_METERS * PI / 180.0
        val metersPerLon = metersPerLat * cos(originLat)

        val startX = (start.longitude - point.longitude) * metersPerLon
        val startY = (start.latitude - point.latitude) * metersPerLat
        val endX = (end.longitude - point.longitude) * metersPerLon
        val endY = (end.latitude - point.latitude) * metersPerLat
        val segmentX = endX - startX
        val segmentY = endY - startY
        val segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
        if (segmentLengthSquared == 0.0) return SegmentProjection(start, 0.0)

        val fraction = (-(startX * segmentX + startY * segmentY) / segmentLengthSquared).coerceIn(0.0, 1.0)
        val projected = GeoPoint(
            latitude = point.latitude + (startY + segmentY * fraction) / metersPerLat,
            longitude = point.longitude + (startX + segmentX * fraction) / metersPerLon,
        )
        return SegmentProjection(projected, fraction)
    }

    private fun GeoPoint.interpolateTo(other: GeoPoint, fraction: Double): GeoPoint {
        return GeoPoint(
            latitude = latitude + (other.latitude - latitude) * fraction,
            longitude = longitude + (other.longitude - longitude) * fraction,
        )
    }

    private fun GeoPoint.bearingTo(other: GeoPoint): Double {
        val startLat = latitude.toRadians()
        val endLat = other.latitude.toRadians()
        val deltaLon = (other.longitude - longitude).toRadians()
        val y = sin(deltaLon) * cos(endLat)
        val x = cos(startLat) * sin(endLat) - sin(startLat) * cos(endLat) * cos(deltaLon)
        return normalizeBearing(atan2(y, x).toDegrees())
    }

    private fun GeoPoint.distanceTo(other: GeoPoint): Double {
        val lat1 = latitude.toRadians()
        val lat2 = other.latitude.toRadians()
        val deltaLat = (other.latitude - latitude).toRadians()
        val deltaLon = (other.longitude - longitude).toRadians()
        val a = sin(deltaLat / 2.0).pow(2.0) +
            cos(lat1) * cos(lat2) * sin(deltaLon / 2.0).pow(2.0)
        val c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a))
        return EARTH_RADIUS_METERS * c
    }

    private fun bearingDelta(from: Double, to: Double): Double {
        return ((to - from + 540.0) % 360.0) - 180.0
    }

    private fun normalizeBearing(bearing: Double): Double {
        return ((bearing % 360.0) + 360.0) % 360.0
    }

    private fun Double.toRadians(): Double = this * PI / 180.0

    private fun Double.toDegrees(): Double = this * 180.0 / PI

    private fun fitTrackIfUseful(points: List<GeoPoint>) {
        if (points.isEmpty()) return
        if (points.size == 1) {
            val point = points.first()
            map.animateCamera(
                CameraUpdateFactory.newLatLngZoom(LatLng(point.latitude, point.longitude), DEFAULT_TRAIL_ZOOM),
                TRACK_CAMERA_ANIMATION_MS,
            )
            return
        }

        val boundsBuilder = LatLngBounds.Builder()
        points.forEach { point -> boundsBuilder.include(LatLng(point.latitude, point.longitude)) }
        map.animateCamera(
            CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), TRACK_BOUNDS_PADDING_PX),
            TRACK_CAMERA_ANIMATION_MS,
        )
    }

    private fun ensureOverlaySources(style: Style) {
        if (style.getSource(TRACK_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(TRACK_SOURCE_ID, emptyFeatures()))
        }
        if (style.getLayer(TRACK_CASING_LAYER_ID) == null) {
            style.addLayer(
                LineLayer(TRACK_CASING_LAYER_ID, TRACK_SOURCE_ID).withProperties(
                    lineColor(Color.WHITE),
                    lineWidth(7f),
                    lineOpacity(0.82f),
                    lineCap(Property.LINE_CAP_ROUND),
                    lineJoin(Property.LINE_JOIN_ROUND),
                ),
            )
        }
        if (style.getLayer(TRACK_LAYER_ID) == null) {
            style.addLayer(
                LineLayer(TRACK_LAYER_ID, TRACK_SOURCE_ID).withProperties(
                    lineColor(Color.parseColor("#D83A1D")),
                    lineWidth(4f),
                    lineOpacity(0.95f),
                    lineCap(Property.LINE_CAP_ROUND),
                    lineJoin(Property.LINE_JOIN_ROUND),
                ),
            )
        }

        if (style.getSource(LOCATION_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(LOCATION_SOURCE_ID, emptyFeatures()))
        }
        if (style.getSource(BREAK_SPOTS_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(BREAK_SPOTS_SOURCE_ID, emptyFeatures()))
        }
        if (style.getLayer(BREAK_SPOT_DOTS_LAYER_ID) == null) {
            style.addLayer(
                CircleLayer(BREAK_SPOT_DOTS_LAYER_ID, BREAK_SPOTS_SOURCE_ID).withProperties(
                    circleRadius(6f),
                    circleColor(Color.parseColor("#2E7D32")),
                    circleOpacity(0.95f),
                    circleStrokeColor(Color.WHITE),
                    circleStrokeWidth(2f),
                ),
            )
        }
        if (style.getLayer(BREAK_SPOT_LABELS_LAYER_ID) == null) {
            style.addLayer(
                SymbolLayer(BREAK_SPOT_LABELS_LAYER_ID, BREAK_SPOTS_SOURCE_ID).withProperties(
                    textField("{name}"),
                    textSize(13f),
                    textColor(Color.parseColor("#1B5E20")),
                    textHaloColor(Color.WHITE),
                    textHaloWidth(1.6f),
                    textAnchor(Property.TEXT_ANCHOR_TOP),
                    textOffset(arrayOf(0f, 0.9f)),
                    textAllowOverlap(false),
                ),
            )
        }
        if (style.getLayer(LOCATION_LAYER_ID) == null) {
            style.addLayer(
                CircleLayer(LOCATION_LAYER_ID, LOCATION_SOURCE_ID).withProperties(
                    circleRadius(7f),
                    circleColor(Color.parseColor("#1976D2")),
                    circleOpacity(0.95f),
                    circleStrokeColor(Color.WHITE),
                    circleStrokeWidth(2f),
                ),
            )
        }
    }

    private fun emptyFeatures(): FeatureCollection {
        return FeatureCollection.fromFeatures(emptyList<Feature>())
    }

    private fun setLayerVisible(style: Style, layerId: String, visible: Boolean) {
        val visibilityValue = visibility(if (visible) Property.VISIBLE else Property.NONE)
        style.getLayer(layerId)?.setProperties(visibilityValue)
        style.getLayer("$PROVIDER_LAYER_PREFIX$layerId")?.setProperties(visibilityValue)
    }

    private companion object {
        const val BUILDINGS_LAYER_ID = "buildings"
        const val ROADS_MINOR_CASING_LAYER_ID = "roads-minor-casing"
        const val ROADS_MINOR_LAYER_ID = "roads-minor"
        const val PATHS_HIGHLIGHT_CASING_LAYER_ID = "paths-highlight-casing"
        const val PATHS_HIGHLIGHT_LAYER_ID = "paths-highlight"
        const val STREET_NAMES_LAYER_ID = "street-names"
        const val POI_DOTS_LAYER_ID = "poi-dots"
        const val POI_NAMES_LAYER_ID = "poi-names"
        const val PROVIDER_LAYER_PREFIX = "finnish-"
        const val TRACK_SOURCE_ID = "trail-gpx-source"
        const val TRACK_CASING_LAYER_ID = "trail-gpx-casing"
        const val TRACK_LAYER_ID = "trail-gpx-line"
        const val LOCATION_SOURCE_ID = "trail-location-source"
        const val LOCATION_LAYER_ID = "trail-location-dot"
        const val BREAK_SPOTS_SOURCE_ID = "trail-break-spots-source"
        const val BREAK_SPOT_DOTS_LAYER_ID = "trail-break-spots-dots"
        const val BREAK_SPOT_LABELS_LAYER_ID = "trail-break-spots-labels"
        const val TRACK_BOUNDS_PADDING_PX = 90
        const val TRACK_CAMERA_ANIMATION_MS = 650
        const val DEFAULT_TRAIL_ZOOM = 14.0
        const val NAVIGATION_TOP_PADDING_RATIO = 0.2f
        const val NORTH_UP_BEARING = 0.0
        const val ROUTE_LOOKAHEAD_METERS = 50.0
        const val MIN_BEARING_DISTANCE_METERS = 1.0
        const val MIN_GPS_BEARING_SPEED_METERS_PER_SECOND = 1.0f
        const val FOLLOW_PAUSE_AFTER_GESTURE_MS = 10_000L
        const val MIN_BEARING_CHANGE_DEGREES = 5.0
        const val BEARING_SMOOTHING_FACTOR = 0.45
        const val EARTH_RADIUS_METERS = 6_371_000.0
    }

    private data class RouteProjection(
        val point: GeoPoint,
        val distanceFromStartMeters: Double,
        val distanceToRouteMeters: Double,
    )

    private data class SegmentProjection(
        val point: GeoPoint,
        val fraction: Double,
    )
}
