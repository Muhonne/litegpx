package com.example.traillite

import android.content.Context

data class MapLayerSettings(
    val streetNames: Boolean = true,
    val pois: Boolean = true,
    val buildings: Boolean = true,
    val minorPaths: Boolean = true,
    val locationIntervalSeconds: Int = 5,
    val moveMapEveryLocationUpdates: Int = 1,
    val automaticTrackingZoom: Boolean = false,
    val trackingZoomLevel: Double = 15.0,
    val keepScreenOn: Boolean = false,
    val overrideSystemBrightness: Boolean = false,
    val screenBrightnessPercent: Int = 100,
    val darkTheme: Boolean = false,
    val showMapInfo: Boolean = true,
    val showRouteInfo: Boolean = true,
)

class MapLayerSettingsStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): MapLayerSettings {
        val legacyInfoVisible = preferences.getBoolean(KEY_SHOW_BOTTOM_INFO, true)
        return MapLayerSettings(
            streetNames = preferences.getBoolean(KEY_STREET_NAMES, true),
            pois = preferences.getBoolean(KEY_POIS, true),
            buildings = preferences.getBoolean(KEY_BUILDINGS, true),
            minorPaths = preferences.getBoolean(KEY_MINOR_PATHS, true),
            locationIntervalSeconds = preferences.getInt(KEY_LOCATION_INTERVAL_SECONDS, 5),
            moveMapEveryLocationUpdates = preferences.getInt(KEY_MOVE_MAP_EVERY_LOCATION_UPDATES, 1).coerceIn(1, 30),
            automaticTrackingZoom = preferences.getBoolean(KEY_AUTOMATIC_TRACKING_ZOOM, false),
            trackingZoomLevel = preferences.getFloat(KEY_TRACKING_ZOOM_LEVEL, 15f).toDouble().coerceIn(8.0, 17.0),
            keepScreenOn = preferences.getBoolean(KEY_KEEP_SCREEN_ON, false),
            overrideSystemBrightness = preferences.getBoolean(KEY_OVERRIDE_SYSTEM_BRIGHTNESS, false),
            screenBrightnessPercent = preferences.getInt(KEY_SCREEN_BRIGHTNESS_PERCENT, 100).coerceIn(1, 100),
            darkTheme = preferences.getBoolean(KEY_DARK_THEME, false),
            showMapInfo = preferences.getBoolean(KEY_SHOW_MAP_INFO, legacyInfoVisible),
            showRouteInfo = preferences.getBoolean(KEY_SHOW_ROUTE_INFO, legacyInfoVisible),
        )
    }

    fun save(settings: MapLayerSettings) {
        preferences.edit()
            .putBoolean(KEY_STREET_NAMES, settings.streetNames)
            .putBoolean(KEY_POIS, settings.pois)
            .putBoolean(KEY_BUILDINGS, settings.buildings)
            .putBoolean(KEY_MINOR_PATHS, settings.minorPaths)
            .putInt(KEY_LOCATION_INTERVAL_SECONDS, settings.locationIntervalSeconds)
            .putInt(KEY_MOVE_MAP_EVERY_LOCATION_UPDATES, settings.moveMapEveryLocationUpdates)
            .putBoolean(KEY_AUTOMATIC_TRACKING_ZOOM, settings.automaticTrackingZoom)
            .putFloat(KEY_TRACKING_ZOOM_LEVEL, settings.trackingZoomLevel.toFloat())
            .putBoolean(KEY_KEEP_SCREEN_ON, settings.keepScreenOn)
            .putBoolean(KEY_OVERRIDE_SYSTEM_BRIGHTNESS, settings.overrideSystemBrightness)
            .putInt(KEY_SCREEN_BRIGHTNESS_PERCENT, settings.screenBrightnessPercent)
            .putBoolean(KEY_DARK_THEME, settings.darkTheme)
            .putBoolean(KEY_SHOW_MAP_INFO, settings.showMapInfo)
            .putBoolean(KEY_SHOW_ROUTE_INFO, settings.showRouteInfo)
            .putBoolean(KEY_SHOW_BOTTOM_INFO, settings.showMapInfo || settings.showRouteInfo)
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "map-layer-settings"
        const val KEY_STREET_NAMES = "streetNames"
        const val KEY_POIS = "pois"
        const val KEY_BUILDINGS = "buildings"
        const val KEY_MINOR_PATHS = "minorPaths"
        const val KEY_LOCATION_INTERVAL_SECONDS = "locationIntervalSeconds"
        const val KEY_MOVE_MAP_EVERY_LOCATION_UPDATES = "moveMapEveryLocationUpdates"
        const val KEY_AUTOMATIC_TRACKING_ZOOM = "automaticTrackingZoom"
        const val KEY_TRACKING_ZOOM_LEVEL = "trackingZoomLevel"
        const val KEY_KEEP_SCREEN_ON = "keepScreenOn"
        const val KEY_OVERRIDE_SYSTEM_BRIGHTNESS = "overrideSystemBrightness"
        const val KEY_SCREEN_BRIGHTNESS_PERCENT = "screenBrightnessPercent"
        const val KEY_DARK_THEME = "darkTheme"
        const val KEY_SHOW_BOTTOM_INFO = "showBottomInfo"
        const val KEY_SHOW_MAP_INFO = "showMapInfo"
        const val KEY_SHOW_ROUTE_INFO = "showRouteInfo"
    }
}
