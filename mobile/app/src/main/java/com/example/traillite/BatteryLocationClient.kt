package com.example.traillite

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource

class BatteryLocationClient(
    context: Context,
    private val onLocation: (Location) -> Unit,
) {
    private val appContext = context.applicationContext
    private val client: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(appContext)
    private val locationManager =
        appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var currentFixToken: CancellationTokenSource? = null
    private var intervalMs: Long = DEFAULT_LOCATION_INTERVAL_MS
    private var running = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(onLocation)
        }
    }

    private val gpsListener = LocationListener { location ->
        onLocation(location)
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (!hasPermission()) return
        stop()
        running = true
        client.lastLocation.addOnSuccessListener { location ->
            if (location != null) onLocation(location)
        }
        currentFixToken = CancellationTokenSource().also { token ->
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, token.token)
                .addOnSuccessListener { location ->
                    if (location != null) onLocation(location)
                }
        }
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            intervalMs,
        )
            .setMinUpdateIntervalMillis((intervalMs / 2).coerceAtLeast(MIN_LOCATION_INTERVAL_MS))
            .setMaxUpdateDelayMillis(intervalMs)
            .setMinUpdateDistanceMeters(MIN_LOCATION_DISTANCE_METERS)
            .setWaitForAccurateLocation(false)
            .build()
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
        startGpsFallback()
    }

    fun stop() {
        running = false
        currentFixToken?.cancel()
        currentFixToken = null
        client.removeLocationUpdates(callback)
        locationManager.removeUpdates(gpsListener)
    }

    fun setIntervalSeconds(seconds: Int) {
        val nextIntervalMs = seconds.coerceIn(MIN_LOCATION_INTERVAL_SECONDS, MAX_LOCATION_INTERVAL_SECONDS) * 1000L
        if (intervalMs == nextIntervalMs) return
        val wasRunning = running
        if (wasRunning) stop()
        intervalMs = nextIntervalMs
        if (wasRunning) start()
    }

    fun hasPermission(): Boolean {
        return hasFinePermission() ||
            ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasFinePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("MissingPermission")
    private fun startGpsFallback() {
        if (!hasFinePermission()) return
        runCatching {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                intervalMs,
                MIN_LOCATION_DISTANCE_METERS,
                gpsListener,
                Looper.getMainLooper(),
            )
        }
    }

    private companion object {
        const val MIN_LOCATION_INTERVAL_MS = 2_500L
        const val DEFAULT_LOCATION_INTERVAL_MS = 5_000L
        const val MIN_LOCATION_INTERVAL_SECONDS = 1
        const val MAX_LOCATION_INTERVAL_SECONDS = 30
        const val MIN_LOCATION_DISTANCE_METERS = 0f
    }
}
