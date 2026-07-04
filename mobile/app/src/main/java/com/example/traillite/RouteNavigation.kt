package com.example.traillite

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

data class RouteNavigationSnapshot(
    val distanceToRouteMeters: Double,
    val distanceFromStartMeters: Double,
    val remainingDistanceMeters: Double,
    val totalDistanceMeters: Double,
    val progressPercent: Int,
    val nearestPoint: GeoPoint,
) {
    val isOffRoute: Boolean = distanceToRouteMeters > OFF_ROUTE_THRESHOLD_METERS

    companion object {
        const val OFF_ROUTE_THRESHOLD_METERS = 75.0
    }
}

object RouteNavigation {
    fun analyze(location: GeoPoint, route: List<GeoPoint>): RouteNavigationSnapshot? {
        if (route.size < 2) return null

        val cumulative = DoubleArray(route.size)
        for (index in 1 until route.size) {
            cumulative[index] = cumulative[index - 1] + route[index - 1].distanceTo(route[index])
        }

        var bestDistance = Double.POSITIVE_INFINITY
        var bestFromStart = 0.0
        var bestPoint = route.first()

        for (index in 0 until route.lastIndex) {
            val start = route[index]
            val end = route[index + 1]
            val projection = projectOntoSegment(location, start, end)
            val distance = location.distanceTo(projection.point)
            if (distance < bestDistance) {
                bestDistance = distance
                bestFromStart = cumulative[index] + start.distanceTo(end) * projection.fraction
                bestPoint = projection.point
            }
        }

        val total = cumulative.last()
        val progress = if (total > 0.0) {
            ((bestFromStart / total) * 100.0).toInt().coerceIn(0, 100)
        } else {
            0
        }
        return RouteNavigationSnapshot(
            distanceToRouteMeters = bestDistance,
            distanceFromStartMeters = bestFromStart,
            remainingDistanceMeters = max(0.0, total - bestFromStart),
            totalDistanceMeters = total,
            progressPercent = progress,
            nearestPoint = bestPoint,
        )
    }

    private fun projectOntoSegment(point: GeoPoint, start: GeoPoint, end: GeoPoint): SegmentProjection {
        val originLat = point.latitude.toRadians()
        val metersPerLat = EARTH_RADIUS_METERS * PI / 180.0
        val metersPerLon = metersPerLat * cos(originLat)

        val startX = (start.longitude - point.longitude) * metersPerLon
        val startY = (start.latitude - point.latitude) * metersPerLat
        val endX = (end.longitude - point.longitude) * metersPerLon
        val endY = (end.latitude - point.latitude) * metersPerLat
        val segmentX = endX - startX
        val segmentY = endY - startY
        val segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
        if (segmentLengthSquared == 0.0) return SegmentProjection(start, 0.0)

        val fraction = (-(startX * segmentX + startY * segmentY) / segmentLengthSquared).coerceIn(0.0, 1.0)
        val projectedX = startX + segmentX * fraction
        val projectedY = startY + segmentY * fraction

        val projected = GeoPoint(
            latitude = point.latitude + projectedY / metersPerLat,
            longitude = point.longitude + projectedX / metersPerLon,
        )
        return SegmentProjection(projected, fraction)
    }

    private data class SegmentProjection(
        val point: GeoPoint,
        val fraction: Double,
    )
}

fun GeoPoint.distanceTo(other: GeoPoint): Double {
    val lat1 = latitude.toRadians()
    val lat2 = other.latitude.toRadians()
    val deltaLat = (other.latitude - latitude).toRadians()
    val deltaLon = (other.longitude - longitude).toRadians()
    val a = sin(deltaLat / 2.0).pow(2.0) +
        cos(lat1) * cos(lat2) * sin(deltaLon / 2.0).pow(2.0)
    val c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c
}

private fun Double.toRadians(): Double = this * PI / 180.0

private const val EARTH_RADIUS_METERS = 6_371_000.0
