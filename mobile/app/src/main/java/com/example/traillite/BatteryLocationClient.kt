package com.example.traillite

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
    private val mainHandler = Handler(Looper.getMainLooper())
    private var baseIntervalMs: Long = DEFAULT_LOCATION_INTERVAL_MS
    private var activeIntervalMs: Long = DEFAULT_LOCATION_INTERVAL_MS
    private var lastFusedFixElapsedMs: Long = 0L
    private var lastAcceptedLocationElapsedMs: Long = 0L
    private var gpsFallbackActive = false
    private var running = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(::handleFusedLocation)
        }
    }

    private val gpsListener = LocationListener { location ->
        handleGpsFallbackLocation(location)
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (!hasPermission()) return
        stop()
        running = true
        activeIntervalMs = baseIntervalMs
        lastFusedFixElapsedMs = SystemClock.elapsedRealtime()
        lastAcceptedLocationElapsedMs = 0L
        client.lastLocation.addOnSuccessListener { location ->
            if (location != null) handleFusedLocation(location)
        }
        currentFixToken = CancellationTokenSource().also { token ->
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, token.token)
                .addOnSuccessListener { location ->
                    if (location != null) handleFusedLocation(location)
                }
        }
        requestFusedLocationUpdates()
        scheduleGpsFallbackCheck()
    }

    @SuppressLint("MissingPermission")
    private fun requestFusedLocationUpdates() {
        if (!running || !hasPermission()) return
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            activeIntervalMs,
        )
            .setMinUpdateIntervalMillis((activeIntervalMs / 2).coerceAtLeast(MIN_LOCATION_INTERVAL_MS))
            .setMaxUpdateDelayMillis(activeIntervalMs)
            .setMinUpdateDistanceMeters(MIN_LOCATION_DISTANCE_METERS)
            .setWaitForAccurateLocation(false)
            .build()
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    fun stop() {
        running = false
        currentFixToken?.cancel()
        currentFixToken = null
        client.removeLocationUpdates(callback)
        stopGpsFallback()
        mainHandler.removeCallbacksAndMessages(null)
    }

    fun setIntervalSeconds(seconds: Int) {
        val nextIntervalMs = seconds.coerceIn(MIN_LOCATION_INTERVAL_SECONDS, MAX_LOCATION_INTERVAL_SECONDS) * 1000L
        if (baseIntervalMs == nextIntervalMs) return
        val wasRunning = running
        if (wasRunning) stop()
        baseIntervalMs = nextIntervalMs
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

    private fun handleFusedLocation(location: Location) {
        if (!running) return
        lastFusedFixElapsedMs = SystemClock.elapsedRealtime()
        stopGpsFallback()
        handleLocation(location)
    }

    private fun handleGpsFallbackLocation(location: Location) {
        if (!running) return
        handleLocation(location)
    }

    private fun handleLocation(location: Location) {
        if (!shouldAcceptLocation(location)) return
        lastAcceptedLocationElapsedMs = SystemClock.elapsedRealtime()
        onLocation(location)
        updateAdaptiveInterval(location)
    }

    private fun shouldAcceptLocation(location: Location): Boolean {
        if (!location.hasAccuracy()) return true
        if (location.accuracy <= MAX_ACCEPTED_ACCURACY_METERS) return true
        return acceptedFixIsStale()
    }

    private fun acceptedFixIsStale(): Boolean {
        if (lastAcceptedLocationElapsedMs == 0L) return true
        return SystemClock.elapsedRealtime() - lastAcceptedLocationElapsedMs >= STALE_ACCEPTED_FIX_TIMEOUT_MS
    }

    private fun updateAdaptiveInterval(location: Location) {
        val nextIntervalMs = adaptiveIntervalMs(location)
        if (!running || activeIntervalMs == nextIntervalMs) return
        activeIntervalMs = nextIntervalMs
        client.removeLocationUpdates(callback)
        requestFusedLocationUpdates()
        if (gpsFallbackActive) {
            stopGpsFallback()
            startGpsFallback()
        }
    }

    private fun adaptiveIntervalMs(location: Location): Long {
        val speed = if (location.hasSpeed()) location.speed else return baseIntervalMs
        val multiplier = when {
            speed < STOPPED_SPEED_METERS_PER_SECOND -> STOPPED_INTERVAL_MULTIPLIER
            speed < SLOW_SPEED_METERS_PER_SECOND -> SLOW_INTERVAL_MULTIPLIER
            else -> 1
        }
        return (baseIntervalMs * multiplier).coerceAtMost(MAX_LOCATION_INTERVAL_MS)
    }

    private fun scheduleGpsFallbackCheck() {
        mainHandler.postDelayed(
            {
                if (!running) return@postDelayed
                val fusedFixAgeMs = if (lastFusedFixElapsedMs == 0L) {
                    Long.MAX_VALUE
                } else {
                    SystemClock.elapsedRealtime() - lastFusedFixElapsedMs
                }
                if (fusedFixAgeMs >= STALE_FUSED_FIX_TIMEOUT_MS) startGpsFallback()
                scheduleGpsFallbackCheck()
            },
            GPS_FALLBACK_CHECK_INTERVAL_MS,
        )
    }

    @SuppressLint("MissingPermission")
    private fun startGpsFallback() {
        if (!hasFinePermission() || gpsFallbackActive) return
        runCatching {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                activeIntervalMs,
                MIN_LOCATION_DISTANCE_METERS,
                gpsListener,
                Looper.getMainLooper(),
            )
            gpsFallbackActive = true
        }
    }

    private fun stopGpsFallback() {
        if (!gpsFallbackActive) return
        locationManager.removeUpdates(gpsListener)
        gpsFallbackActive = false
    }

    private companion object {
        const val MIN_LOCATION_INTERVAL_MS = 2_500L
        const val DEFAULT_LOCATION_INTERVAL_MS = 5_000L
        const val MIN_LOCATION_INTERVAL_SECONDS = 1
        const val MAX_LOCATION_INTERVAL_SECONDS = 30
        const val MAX_LOCATION_INTERVAL_MS = MAX_LOCATION_INTERVAL_SECONDS * 1000L
        const val MIN_LOCATION_DISTANCE_METERS = 5f
        const val MAX_ACCEPTED_ACCURACY_METERS = 30f
        const val STALE_FUSED_FIX_TIMEOUT_MS = 12_000L
        const val STALE_ACCEPTED_FIX_TIMEOUT_MS = 20_000L
        const val GPS_FALLBACK_CHECK_INTERVAL_MS = 5_000L
        const val STOPPED_SPEED_METERS_PER_SECOND = 0.8f
        const val SLOW_SPEED_METERS_PER_SECOND = 2.5f
        const val STOPPED_INTERVAL_MULTIPLIER = 4
        const val SLOW_INTERVAL_MULTIPLIER = 2
    }
}
