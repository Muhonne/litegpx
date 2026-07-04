package com.example.traillite

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
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

    fun copyMapPackage(uri: Uri): File {
        return copyDocument(uri, mapsDir, fallbackName = "map-${System.currentTimeMillis()}.pmtiles")
    }

    fun preferredMapPackage(): File? {
        val importedMap = mapsDir
            .listFiles { file ->
                file.isFile &&
                    file.name != BUNDLED_MAP_NAME &&
                    file.extension.lowercase(Locale.US) in setOf("pmtiles", "mbtiles")
            }
            ?.maxByOrNull { it.lastModified() }
        return importedMap ?: ensureBundledMapPackage()
    }

    fun ensureBundledMapPackage(): File? {
        val target = mapsDir.resolve(BUNDLED_MAP_NAME)
        if (target.exists() && target.length() > 0L) return target
        return runCatching {
            context.assets.open("maps/$BUNDLED_MAP_NAME").use { input ->
                FileOutputStream(target).use { output -> input.copyTo(output) }
            }
            target
        }.getOrNull()
    }

    fun writeLocalStyle(mapPackage: File): File {
        val tileUrl = when (mapPackage.extension.lowercase(Locale.US)) {
            "pmtiles" -> "pmtiles://${Uri.fromFile(mapPackage)}"
            "mbtiles" -> "mbtiles://${mapPackage.absolutePath}"
            else -> error("Unsupported map package: ${mapPackage.name}")
        }
        val template = context.assets
            .open("styles/style_template.json")
            .use { it.readBytes().toString(Charsets.UTF_8) }
        val style = template.replace("TRAILLITE_TILE_URL", tileUrl)
        return context.filesDir.resolve("style-local.json").also { file ->
            file.writeText(style, Charsets.UTF_8)
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
    }
}
