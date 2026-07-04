package com.example.traillite

import android.content.Context
import org.json.JSONArray

data class BundledRoute(
    val id: String,
    val title: String,
    val lengthKm: Double,
    val durationText: String,
    val gpxAsset: String,
    val bikelandId: Int?,
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
                add(
                    BundledRoute(
                        id = item.getString("id"),
                        title = item.getString("title"),
                        lengthKm = item.getDouble("lengthKm"),
                        durationText = item.optString("durationText", "--"),
                        gpxAsset = gpxAsset,
                        bikelandId = if (item.isNull("bikelandId")) null else item.getInt("bikelandId"),
                    ),
                )
            }
        }
    }
}
