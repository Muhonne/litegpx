package com.example.traillite

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

class TrailStorage(private val context: Context) {
    private val root: File =
        context.getExternalFilesDir(null)?.resolve("TrailLite")
            ?: context.filesDir.resolve("TrailLite")

    val mapsDir: File = root.resolve("maps").apply { mkdirs() }
    val tracksDir: File = root.resolve("tracks").apply { mkdirs() }

    fun copyTrack(uri: Uri): File {
        return copyDocument(uri, tracksDir, fallbackName = "track-${System.currentTimeMillis()}.gpx")
    }

    fun importRoute(uri: Uri): BundledRoute {
        val file = copyTrack(uri)
        return runCatching {
            routeFromTrackFile(file)
        }.onFailure {
            file.delete()
        }.getOrThrow()
    }

    fun importedRoutes(): List<BundledRoute> {
        return tracksDir
            .listFiles { file -> file.isFile && file.extension.equals("gpx", ignoreCase = true) }
            ?.sortedBy { it.name.lowercase(Locale.US) }
            ?.mapNotNull { file -> runCatching { routeFromTrackFile(file) }.getOrNull() }
            ?: emptyList()
    }

    fun copyMapPackage(uri: Uri): File {
        return copyDocument(uri, mapsDir, fallbackName = "map-${System.currentTimeMillis()}.pmtiles")
    }

    fun preferredMapPackage(): File? {
        val importedMap = mapsDir
            .listFiles { file ->
                file.isFile &&
                    file.name != BUNDLED_MAP_NAME &&
                    !file.isProviderOverlayPackage() &&
                    file.extension.lowercase(Locale.US) in setOf("pmtiles", "mbtiles")
            }
            ?.maxByOrNull { it.lastModified() }
        return importedMap ?: ensureBundledMapPackage()
    }

    fun ensureBundledMapPackage(): File? {
        val target = mapsDir.resolve(BUNDLED_MAP_NAME)
        val providerTarget = mapsDir.resolve(BUNDLED_PROVIDER_MAP_NAME)
        return if (target.exists() && target.length() > 0L) {
            copyBundledProviderMapIfAvailable(providerTarget)
            target
        } else {
            runCatching {
                context.assets.open("maps/$BUNDLED_MAP_NAME").use { input ->
                    FileOutputStream(target).use { output -> input.copyTo(output) }
                }
                copyBundledProviderMapIfAvailable(providerTarget)
                target
            }.getOrNull()
        }
    }

    fun writeLocalStyle(mapPackage: File, darkTheme: Boolean): File {
        val tileUrl = when (mapPackage.extension.lowercase(Locale.US)) {
            "pmtiles" -> "pmtiles://${Uri.fromFile(mapPackage)}"
            "mbtiles" -> "mbtiles://${mapPackage.absolutePath}"
            else -> error("Unsupported map package: ${mapPackage.name}")
        }
        val template = context.assets
            .open("styles/style_template.json")
            .use { it.readBytes().toString(Charsets.UTF_8) }
        val baseStyle = providerOverlayPackage(mapPackage)
            ?.let { provider -> addProviderOverlay(template.replace("TRAILLITE_TILE_URL", tileUrl), mapTileUrl(provider)) }
            ?: template.replace("TRAILLITE_TILE_URL", tileUrl)
        val style = if (darkTheme) applyDarkMapStyle(baseStyle) else baseStyle
        return context.filesDir.resolve("style-local.json").also { file ->
            file.writeText(style, Charsets.UTF_8)
        }
    }

    private fun mapTileUrl(mapPackage: File): String {
        return when (mapPackage.extension.lowercase(Locale.US)) {
            "pmtiles" -> "pmtiles://${Uri.fromFile(mapPackage)}"
            "mbtiles" -> "mbtiles://${mapPackage.absolutePath}"
            else -> error("Unsupported map package: ${mapPackage.name}")
        }
    }

    private fun providerOverlayPackage(mapPackage: File): File? {
        val baseName = mapPackage.nameWithoutExtension
        val candidates = listOf(
            mapPackage.parentFile?.resolve("$baseName.providers.pmtiles"),
            mapPackage.parentFile?.resolve("$baseName-finnish.pmtiles"),
            if (mapPackage.name == BUNDLED_MAP_NAME) mapsDir.resolve(BUNDLED_PROVIDER_MAP_NAME) else null,
        )
        return candidates.filterNotNull().firstOrNull { it.exists() && it.length() > 0L }
    }

    private fun File.isProviderOverlayPackage(): Boolean {
        return name == BUNDLED_PROVIDER_MAP_NAME ||
            name.endsWith(".providers.pmtiles", ignoreCase = true) ||
            name.endsWith("-finnish.pmtiles", ignoreCase = true)
    }

    private fun addProviderOverlay(styleText: String, providerTileUrl: String): String {
        val style = JSONObject(styleText)
        val sources = style.getJSONObject("sources")
        sources.put(
            PROVIDER_SOURCE_ID,
            JSONObject()
                .put("type", "vector")
                .put("url", providerTileUrl),
        )

        val layers = style.getJSONArray("layers")
        val providerLayers = JSONArray()
        for (index in 0 until layers.length()) {
            val layer = layers.getJSONObject(index)
            if (layer.optString("source") != BASE_SOURCE_ID) continue
            val copy = JSONObject(layer.toString())
            copy.put("id", "$PROVIDER_LAYER_PREFIX${layer.getString("id")}")
            copy.put("source", PROVIDER_SOURCE_ID)
            providerLayers.put(copy)
        }
        for (index in 0 until providerLayers.length()) {
            layers.put(providerLayers.getJSONObject(index))
        }
        return style.toString()
    }

    private fun applyDarkMapStyle(styleText: String): String {
        val style = JSONObject(styleText)
        val layers = style.getJSONArray("layers")
        for (index in 0 until layers.length()) {
            val layer = layers.getJSONObject(index)
            val paint = layer.optJSONObject("paint") ?: continue
            val id = layer.getString("id").removePrefix(PROVIDER_LAYER_PREFIX)
            when (id) {
                "background" -> paint.put("background-color", "#101417")
                "landcover-park" -> {
                    paint.put("fill-color", "#28452D")
                    paint.put("fill-opacity", 0.78)
                }
                "water" -> paint.put("fill-color", "#155A75")
                "buildings" -> paint.put("fill-color", "#4E4A43")
                "waterway" -> paint.put("line-color", "#2D8DB9")
                "roads-minor-casing" -> paint.put("line-color", "#253136")
                "roads-minor" -> paint.put("line-color", "#8D9A9D")
                "roads-major-casing" -> paint.put("line-color", "#202A2E")
                "roads-major" -> paint.put("line-color", "#C3CDD0")
                "paths-highlight-casing" -> paint.put("line-color", "#182218")
                "paths-highlight" -> paint.put("line-color", "#8EAF67")
                "street-names" -> {
                    paint.put("text-color", "#D8E1E8")
                    paint.put("text-halo-color", "#101417")
                }
                "poi-dots" -> {
                    paint.put("circle-color", "#8BB8C8")
                    paint.put("circle-stroke-color", "#101417")
                }
                "poi-names" -> {
                    paint.put("text-color", "#D8E1E8")
                    paint.put("text-halo-color", "#101417")
                }
            }
        }
        return style.toString()
    }

    private fun copyBundledProviderMapIfAvailable(target: File) {
        if (target.exists() && target.length() > 0L) return
        runCatching {
            context.assets.open("maps/$BUNDLED_PROVIDER_MAP_NAME").use { input ->
                FileOutputStream(target).use { output -> input.copyTo(output) }
            }
        }
    }

    private fun copyDocument(uri: Uri, directory: File, fallbackName: String): File {
        val displayName = context.contentResolver.displayName(uri) ?: fallbackName
        val target = uniqueFile(directory, sanitizeFileName(displayName))
        context.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Unable to open selected document" }
            FileOutputStream(target).use { output -> input.copyTo(output) }
        }
        return target
    }

    private fun routeFromTrackFile(file: File): BundledRoute {
        val points = file.inputStream().use { input -> GpxParser.parseTrackPoints(input) }
        if (points.size < 2) error("GPX has fewer than 2 track points")
        return BundledRoute(
            id = "imported-${file.nameWithoutExtension.toRouteId()}",
            title = file.nameWithoutExtension.toRouteTitle(),
            lengthKm = points.totalDistanceMeters() / 1000.0,
            durationText = "--",
            gpxAsset = null,
            gpxFile = file,
            bikelandId = null,
            bounds = points.routeBounds(),
        )
    }

    private fun List<GeoPoint>.totalDistanceMeters(): Double {
        var total = 0.0
        for (index in 1 until size) {
            total += this[index - 1].distanceTo(this[index])
        }
        return total
    }

    private fun List<GeoPoint>.routeBounds(): RouteBounds {
        return RouteBounds(
            minLon = minOf { it.longitude },
            minLat = minOf { it.latitude },
            maxLon = maxOf { it.longitude },
            maxLat = maxOf { it.latitude },
        )
    }

    private fun String.toRouteId(): String {
        return lowercase(Locale.US)
            .replace(Regex("""[^a-z0-9]+"""), "-")
            .trim('-')
            .ifBlank { "route-${System.currentTimeMillis()}" }
    }

    private fun String.toRouteTitle(): String {
        return replace('-', ' ')
            .replace('_', ' ')
            .split(Regex("""\s+"""))
            .filter { it.isNotBlank() }
            .joinToString(" ") { word -> word.replaceFirstChar { char -> char.titlecase(Locale.getDefault()) } }
            .ifBlank { "Route" }
    }

    private fun uniqueFile(directory: File, name: String): File {
        val baseName = name.substringBeforeLast('.', name)
        val extension = name.substringAfterLast('.', "")
        var candidate = directory.resolve(name)
        var index = 2
        while (candidate.exists()) {
            val suffix = if (extension.isBlank()) "" else ".$extension"
            candidate = directory.resolve("$baseName-$index$suffix")
            index++
        }
        return candidate
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("""[^\w.\- ]"""), "_").ifBlank { "trail-${System.currentTimeMillis()}.gpx" }
    }

    private fun android.content.ContentResolver.displayName(uri: Uri): String? {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) return cursor.getString(index)
            }
        }
        return null
    }

    private companion object {
        const val BUNDLED_MAP_NAME = "finland.pmtiles"
        const val BUNDLED_PROVIDER_MAP_NAME = "finland.providers.pmtiles"
        const val BASE_SOURCE_ID = "osm"
        const val PROVIDER_SOURCE_ID = "finnish"
        const val PROVIDER_LAYER_PREFIX = "finnish-"
    }
}
