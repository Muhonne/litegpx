package com.example.traillite

import android.content.Context

data class MapLayerSettings(
    val streetNames: Boolean = true,
    val pois: Boolean = true,
    val buildings: Boolean = true,
    val minorPaths: Boolean = true,
    val locationIntervalSeconds: Int = 5,
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
        const val KEY_DARK_THEME = "darkTheme"
        const val KEY_SHOW_BOTTOM_INFO = "showBottomInfo"
        const val KEY_SHOW_MAP_INFO = "showMapInfo"
        const val KEY_SHOW_ROUTE_INFO = "showRouteInfo"
    }
}
