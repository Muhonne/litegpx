package com.example.traillite

import android.content.Context
import android.graphics.Color
import android.location.Location
import android.net.Uri
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
import org.maplibre.android.style.layers.PropertyFactory.visibility
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import java.io.File

class TrailMapController(
    private val context: Context,
    private val mapView: MapView,
    private val map: MapLibreMap,
    private val storage: TrailStorage,
) {
    private var currentStyle: Style? = null
    private var trackPoints: List<GeoPoint> = emptyList()
    private var latestLocation: LatLng? = null
    private var lastRenderedLocation: LatLng? = null
    private var layerSettings = MapLayerSettings()

    init {
        mapView.setMaximumFps(12)
        map.uiSettings.isCompassEnabled = true
        map.uiSettings.isRotateGesturesEnabled = false
    }

    fun loadInitialStyle(mapPackage: File?) {
        loadStyle(mapPackage)
    }

    fun loadStyle(mapPackage: File?) {
        val styleUri = if (mapPackage == null) {
            "asset://styles/style_empty.json"
        } else {
            Uri.fromFile(storage.writeLocalStyle(mapPackage)).toString()
        }
        map.setStyle(styleUri) { style ->
            currentStyle = style
            applyLayerSettings(layerSettings)
            ensureOverlaySources(style)
            renderTrack()
            lastRenderedLocation = null
            latestLocation?.let { updateLocationDot(it) }
        }
    }

    fun applyLayerSettings(settings: MapLayerSettings) {
        layerSettings = settings
        val style = currentStyle ?: return
        setLayerVisible(style, STREET_NAMES_LAYER_ID, settings.streetNames)
        setLayerVisible(style, POI_DOTS_LAYER_ID, settings.pois)
        setLayerVisible(style, POI_NAMES_LAYER_ID, settings.pois)
        setLayerVisible(style, BUILDINGS_LAYER_ID, settings.buildings)
        setLayerVisible(style, PATHS_HIGHLIGHT_LAYER_ID, settings.minorPaths)
        setLayerVisible(style, ROADS_MINOR_LAYER_ID, settings.minorPaths)
    }

    fun setTrack(points: List<GeoPoint>) {
        trackPoints = points
        renderTrack()
        fitTrackIfUseful(points)
    }

    fun onLocation(location: Location): Boolean {
        val latLng = LatLng(location.latitude, location.longitude)
        latestLocation = latLng
        if (currentStyle == null) return false
        val visibleBounds = map.projection.visibleRegion.latLngBounds

        updateLocationDot(latLng)
        if (!visibleBounds.contains(latLng)) {
            val zoom = map.cameraPosition.zoom.coerceAtLeast(DEFAULT_FOLLOW_ZOOM)
            map.animateCamera(CameraUpdateFactory.newLatLngZoom(latLng, zoom), LOCATION_CAMERA_ANIMATION_MS)
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

    private fun updateLocationDot(latLng: LatLng) {
        val style = currentStyle ?: return
        ensureOverlaySources(style)
        val source = style.getSource(LOCATION_SOURCE_ID) as? GeoJsonSource ?: return
        val point = Point.fromLngLat(latLng.longitude, latLng.latitude)
        source.setGeoJson(FeatureCollection.fromFeatures(listOf(Feature.fromGeometry(point))))
    }

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
        if (style.getLayer(TRACK_LAYER_ID) == null) {
            style.addLayer(
                LineLayer(TRACK_LAYER_ID, TRACK_SOURCE_ID).withProperties(
                    lineColor(Color.parseColor("#FF5733")),
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
        val layer = style.getLayer(layerId) ?: return
        layer.setProperties(visibility(if (visible) Property.VISIBLE else Property.NONE))
    }

    private companion object {
        const val BUILDINGS_LAYER_ID = "buildings"
        const val ROADS_MINOR_LAYER_ID = "roads-minor"
        const val PATHS_HIGHLIGHT_LAYER_ID = "paths-highlight"
        const val STREET_NAMES_LAYER_ID = "street-names"
        const val POI_DOTS_LAYER_ID = "poi-dots"
        const val POI_NAMES_LAYER_ID = "poi-names"
        const val TRACK_SOURCE_ID = "trail-gpx-source"
        const val TRACK_LAYER_ID = "trail-gpx-line"
        const val LOCATION_SOURCE_ID = "trail-location-source"
        const val LOCATION_LAYER_ID = "trail-location-dot"
        const val TRACK_BOUNDS_PADDING_PX = 90
        const val TRACK_CAMERA_ANIMATION_MS = 650
        const val LOCATION_CAMERA_ANIMATION_MS = 350
        const val DEFAULT_TRAIL_ZOOM = 14.0
        const val DEFAULT_FOLLOW_ZOOM = 13.0
    }
}
