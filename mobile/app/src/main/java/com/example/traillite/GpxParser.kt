package com.example.traillite

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream

object GpxParser {
    fun parseRoute(input: InputStream): GpxRoute {
        val points = ArrayList<GeoPoint>(2048)
        val breakSpots = ArrayList<RouteBreakSpot>()
        input.use { stream ->
            val parser = Xml.newPullParser()
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            parser.setInput(stream, null)

            var waypoint: PendingWaypoint? = null
            var event = parser.eventType
            while (event != XmlPullParser.END_DOCUMENT) {
                if (event == XmlPullParser.START_TAG && parser.name == "trkpt") {
                    readPoint(parser)?.let { points += it }
                } else if (event == XmlPullParser.START_TAG && parser.name == "wpt") {
                    val point = readPoint(parser)
                    waypoint = point?.let { PendingWaypoint(point = it) }
                } else if (event == XmlPullParser.START_TAG && parser.name == "name" && waypoint != null) {
                    waypoint = waypoint.copy(name = parser.nextText().trim())
                } else if (event == XmlPullParser.START_TAG && parser.name == "desc" && waypoint != null) {
                    waypoint = waypoint.copy(description = parser.nextText().trim())
                } else if (event == XmlPullParser.END_TAG && parser.name == "wpt") {
                    waypoint?.toBreakSpot()?.let { breakSpots += it }
                    waypoint = null
                }
                event = parser.next()
            }
        }
        return GpxRoute(trackPoints = points, breakSpots = breakSpots)
    }

    fun parseTrackPoints(input: InputStream): List<GeoPoint> {
        return parseRoute(input).trackPoints
    }

    private fun readPoint(parser: XmlPullParser): GeoPoint? {
        val lat = parser.getAttributeValue(null, "lat")?.toDoubleOrNull()
        val lon = parser.getAttributeValue(null, "lon")?.toDoubleOrNull()
        return if (lat != null && lon != null && isValidPoint(lat, lon)) {
            GeoPoint(latitude = lat, longitude = lon)
        } else {
            null
        }
    }

    private fun isValidPoint(latitude: Double, longitude: Double): Boolean {
        return latitude in -90.0..90.0 && longitude in -180.0..180.0
    }

    private data class PendingWaypoint(
        val point: GeoPoint,
        val name: String = "",
        val description: String = "",
    ) {
        fun toBreakSpot(): RouteBreakSpot {
            return RouteBreakSpot(
                point = point,
                name = name.ifBlank { "Break spot" },
                description = description.ifBlank { null },
            )
        }
    }
}

data class GpxRoute(
    val trackPoints: List<GeoPoint>,
    val breakSpots: List<RouteBreakSpot> = emptyList(),
)

data class RouteBreakSpot(
    val point: GeoPoint,
    val name: String,
    val description: String? = null,
)
