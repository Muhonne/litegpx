package com.example.traillite

import android.content.Context

data class MapLayerSettings(
    val streetNames: Boolean = true,
    val pois: Boolean = true,
    val buildings: Boolean = false,
    val minorPaths: Boolean = true,
)

class MapLayerSettingsStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): MapLayerSettings {
        return MapLayerSettings(
            streetNames = preferences.getBoolean(KEY_STREET_NAMES, true),
            pois = preferences.getBoolean(KEY_POIS, true),
            buildings = preferences.getBoolean(KEY_BUILDINGS, false),
            minorPaths = preferences.getBoolean(KEY_MINOR_PATHS, true),
        )
    }

    fun save(settings: MapLayerSettings) {
        preferences.edit()
            .putBoolean(KEY_STREET_NAMES, settings.streetNames)
            .putBoolean(KEY_POIS, settings.pois)
            .putBoolean(KEY_BUILDINGS, settings.buildings)
            .putBoolean(KEY_MINOR_PATHS, settings.minorPaths)
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "map-layer-settings"
        const val KEY_STREET_NAMES = "streetNames"
        const val KEY_POIS = "pois"
        const val KEY_BUILDINGS = "buildings"
        const val KEY_MINOR_PATHS = "minorPaths"
    }
}
