package com.example.traillite

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream

object GpxParser {
    fun parseTrackPoints(input: InputStream): List<GeoPoint> {
        val points = ArrayList<GeoPoint>(2048)
        input.use { stream ->
            val parser = Xml.newPullParser()
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            parser.setInput(stream, null)

            var event = parser.eventType
            while (event != XmlPullParser.END_DOCUMENT) {
                if (event == XmlPullParser.START_TAG && parser.name == "trkpt") {
                    val lat = parser.getAttributeValue(null, "lat")?.toDoubleOrNull()
                    val lon = parser.getAttributeValue(null, "lon")?.toDoubleOrNull()
                    if (lat != null && lon != null && isValidPoint(lat, lon)) {
                        points += GeoPoint(latitude = lat, longitude = lon)
                    }
                }
                event = parser.next()
            }
        }
        return points
    }

    private fun isValidPoint(latitude: Double, longitude: Double): Boolean {
        return latitude in -90.0..90.0 && longitude in -180.0..180.0
    }
}
