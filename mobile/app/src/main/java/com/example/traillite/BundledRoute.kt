package com.example.traillite

import android.content.Context
import org.json.JSONArray
import java.io.File

data class BundledRoute(
    val id: String,
    val title: String,
    val lengthKm: Double,
    val durationText: String,
    val gpxAsset: String?,
    val gpxFile: File?,
    val bikelandId: Int?,
    val bounds: RouteBounds?,
)

data class RouteBounds(
    val minLon: Double,
    val minLat: Double,
    val maxLon: Double,
    val maxLat: Double,
)

object BundledRouteCatalog {
    fun load(context: Context): List<BundledRoute> {
        val json = context.assets
            .open("routes/routes.json")
            .use { it.readBytes().toString(Charsets.UTF_8) }
        val array = JSONArray(json)
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                val gpxAsset = item.optString("gpxAsset")
                if (gpxAsset.isBlank()) continue
                val bounds = item.optJSONObject("bounds")?.let { routeBounds ->
                    RouteBounds(
                        minLon = routeBounds.getDouble("minLon"),
                        minLat = routeBounds.getDouble("minLat"),
                        maxLon = routeBounds.getDouble("maxLon"),
                        maxLat = routeBounds.getDouble("maxLat"),
                    )
                }
                add(
                    BundledRoute(
                        id = item.getString("id"),
                        title = item.getString("title"),
                        lengthKm = item.getDouble("lengthKm"),
                        durationText = item.optString("durationText", "--"),
                        gpxAsset = gpxAsset,
                        gpxFile = null,
                        bikelandId = if (item.isNull("bikelandId")) null else item.getInt("bikelandId"),
                        bounds = bounds,
                    ),
                )
            }
        }
    }
}
