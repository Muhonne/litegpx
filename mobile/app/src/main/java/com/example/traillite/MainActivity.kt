package com.example.traillite

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.maplibre.android.MapLibre
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    private lateinit var storage: TrailStorage
    private lateinit var locationClient: BatteryLocationClient
    private lateinit var layerSettingsStore: MapLayerSettingsStore
    private var mapController: TrailMapController? = null
    private var activeTrackPoints: List<GeoPoint> = emptyList()
    private var latestLocationPoint: GeoPoint? = null
    private var uiState by mutableStateOf(TrailLiteUiState())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MapLibre.getInstance(applicationContext)
        MapLibre.setConnected(false)

        storage = TrailStorage(this)
        layerSettingsStore = MapLayerSettingsStore(this)
        val initialMap = storage.preferredMapPackage()
        val initialSettings = layerSettingsStore.load()
        applyDisplaySettings(initialSettings)
        uiState = uiState.copy(
            mapName = initialMap?.name,
            bundledRoutes = routeCatalog(),
            mapLayerSettings = initialSettings,
            status = if (initialMap == null) {
                "No offline map package loaded"
            } else {
                "Offline map loaded"
            },
        )

        locationClient = BatteryLocationClient(this) { location ->
            val currentLocationPoint = GeoPoint(latitude = location.latitude, longitude = location.longitude)
            latestLocationPoint = currentLocationPoint
            mapController?.onLocation(location)
            val navigation = RouteNavigation.analyze(
                location = currentLocationPoint,
                route = activeTrackPoints,
            )
            val locationText = buildString {
                append("%.5f, %.5f".format(Locale.US, location.latitude, location.longitude))
                if (location.hasAccuracy()) append(" +/- ${location.accuracy.toInt()} m")
                append(" @ ${LOCATION_TIME_FORMAT.format(Date(location.time))}")
            }
            uiState = uiState.copy(
                locationText = "GPS $locationText",
                navigation = navigation,
                currentLocation = currentLocationPoint,
            )
        }

        setContent {
            TrailLiteTheme(darkTheme = uiState.mapLayerSettings.darkTheme) {
                TrailLiteScreen(
                    state = uiState,
                    onMapReady = { mapView, map ->
                        val controller = TrailMapController(this, mapView, map, storage) { zoom ->
                            uiState = uiState.copy(mapZoom = zoom)
                        }
                        mapController = controller
                        controller.setTrackingActive(uiState.tracking)
                        controller.applyLayerSettings(uiState.mapLayerSettings)
                        controller.loadInitialStyle(storage.preferredMapPackage())
                    },
                    onShowRoutes = { uiState = uiState.copy(showRoutePicker = true) },
                    onDismissRoutes = { uiState = uiState.copy(showRoutePicker = false) },
                    onAddRoute = { importTrackLauncher.launch(TRACK_MIME_TYPES) },
                    onRouteSearchChange = { query -> uiState = uiState.copy(routeSearchQuery = query) },
                    onRouteSortChange = { sortMode -> uiState = uiState.copy(routeSortMode = sortMode) },
                    onSelectRoute = ::loadBundledRoute,
                    onShowMapSettings = { uiState = uiState.copy(showMapSettings = true) },
                    onDismissMapSettings = { uiState = uiState.copy(showMapSettings = false) },
                    onLayerSettingsChange = ::updateLayerSettings,
                    onToggleTracking = ::toggleTracking,
                )
            }
        }

        handleViewIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleViewIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        if (::locationClient.isInitialized && uiState.tracking && locationClient.hasPermission()) {
            mapController?.setTrackingActive(true)
            locationClient.start()
        }
    }

    override fun onStop() {
        mapController?.setTrackingActive(false)
        if (::locationClient.isInitialized) locationClient.stop()
        super.onStop()
    }

    override fun onLowMemory() {
        super.onLowMemory()
        mapController?.onLowMemory()
    }

    private val importTrackLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) addRouteFromGpx(uri)
    }

    private val importMapLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) importMapPackage(uri)
    }

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) startTracking() else uiState = uiState.copy(status = "Location permission denied")
    }

    private fun addRouteFromGpx(uri: Uri) {
        uiState = uiState.copy(busy = true, status = "Adding route")
        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val route = storage.importRoute(uri)
                    val points = route.openGpx().use { GpxParser.parseTrackPoints(it) }
                    route to points
                }
            }.onSuccess { (route, points) ->
                activeTrackPoints = points
                mapController?.setTrack(points)
                uiState = uiState.copy(
                    busy = false,
                    bundledRoutes = routeCatalog(),
                    showRoutePicker = false,
                    trackName = route.title,
                    trackPointCount = points.size,
                    navigation = latestLocationPoint?.let { RouteNavigation.analyze(it, points) },
                    status = "Route added",
                )
            }.onFailure { error ->
                uiState = uiState.copy(busy = false, status = error.message ?: "Route import failed")
            }
        }
    }

    private fun loadBundledRoute(route: BundledRoute) {
        uiState = uiState.copy(busy = true, showRoutePicker = false, status = "Loading ${route.title}")
        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val points = route.openGpx().use { GpxParser.parseTrackPoints(it) }
                    route to points
                }
            }.onSuccess { (loadedRoute, points) ->
                activeTrackPoints = points
                mapController?.setTrack(points)
                uiState = uiState.copy(
                    busy = false,
                    trackName = loadedRoute.title,
                    trackPointCount = points.size,
                    navigation = latestLocationPoint?.let { RouteNavigation.analyze(it, points) },
                    status = "Route loaded",
                )
            }.onFailure { error ->
                uiState = uiState.copy(busy = false, status = error.message ?: "Route load failed")
            }
        }
    }

    private fun handleViewIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW && intent.data != null) {
            addRouteFromGpx(intent.data!!)
        }
    }

    private fun importMapPackage(uri: Uri) {
        uiState = uiState.copy(busy = true, status = "Importing map package")
        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val file = storage.copyMapPackage(uri)
                    if (!file.isSupportedMapPackage()) {
                        file.delete()
                        error("Select a .pmtiles or .mbtiles file")
                    }
                    file
                }
            }.onSuccess { file ->
                mapController?.loadStyle(file)
                uiState = uiState.copy(
                    busy = false,
                    mapName = file.name,
                    status = "Offline map loaded",
                )
            }.onFailure { error ->
                uiState = uiState.copy(busy = false, status = error.message ?: "Map import failed")
            }
        }
    }

    private fun toggleTracking() {
        if (uiState.tracking) {
            locationClient.stop()
            mapController?.setTrackingActive(false)
            uiState = uiState.copy(tracking = false, locationText = "GPS idle", status = "GPS stopped")
            return
        }

        if (!locationClient.hasPermission()) {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
            return
        }
        startTracking()
    }

    private fun startTracking() {
        mapController?.setTrackingActive(true)
        locationClient.setIntervalSeconds(uiState.mapLayerSettings.locationIntervalSeconds)
        locationClient.start()
        uiState = uiState.copy(
            tracking = true,
            status = "GPS tracking every ${uiState.mapLayerSettings.locationIntervalSeconds}s",
        )
    }

    private fun updateLayerSettings(settings: MapLayerSettings) {
        val previousInterval = uiState.mapLayerSettings.locationIntervalSeconds
        layerSettingsStore.save(settings)
        applyDisplaySettings(settings)
        mapController?.applyLayerSettings(settings)
        locationClient.setIntervalSeconds(settings.locationIntervalSeconds)
        uiState = uiState.copy(
            mapLayerSettings = settings,
            status = if (uiState.tracking && settings.locationIntervalSeconds != previousInterval) {
                "GPS tracking every ${settings.locationIntervalSeconds}s"
            } else {
                uiState.status
            },
        )
    }

    private fun applyDisplaySettings(settings: MapLayerSettings) {
        if (settings.keepScreenOn) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        val attributes = window.attributes
        attributes.screenBrightness = if (settings.overrideSystemBrightness) {
            settings.screenBrightnessPercent.coerceIn(MIN_SCREEN_BRIGHTNESS_PERCENT, MAX_SCREEN_BRIGHTNESS_PERCENT) / 100f
        } else {
            WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        }
        window.attributes = attributes
    }

    private fun routeCatalog(): List<BundledRoute> {
        return BundledRouteCatalog.load(this) + storage.importedRoutes()
    }

    private fun BundledRoute.openGpx() =
        gpxFile?.inputStream() ?: assets.open(requireNotNull(gpxAsset) { "Route has no GPX source" })

    private fun File.isSupportedMapPackage(): Boolean {
        return extension.lowercase(Locale.US) in setOf("pmtiles", "mbtiles")
    }

    private companion object {
        val TRACK_MIME_TYPES = arrayOf("application/gpx+xml", "application/xml", "text/xml", "*/*")
        val MAP_MIME_TYPES = arrayOf("application/octet-stream", "application/vnd.pmtiles", "*/*")
        val LOCATION_TIME_FORMAT = SimpleDateFormat("HH:mm:ss", Locale.US)
    }
}

data class TrailLiteUiState(
    val mapName: String? = null,
    val trackName: String? = null,
    val trackPointCount: Int = 0,
    val tracking: Boolean = false,
    val status: String = "Ready",
    val locationText: String = "GPS idle",
    val navigation: RouteNavigationSnapshot? = null,
    val busy: Boolean = false,
    val mapZoom: Double? = null,
    val bundledRoutes: List<BundledRoute> = emptyList(),
    val showRoutePicker: Boolean = false,
    val routeSearchQuery: String = "",
    val routeSortMode: RouteSortMode = RouteSortMode.Nearby,
    val currentLocation: GeoPoint? = null,
    val showMapSettings: Boolean = false,
    val mapLayerSettings: MapLayerSettings = MapLayerSettings(),
)

enum class RouteSortMode {
    Nearby,
    Name,
    Length,
}

private const val MIN_GPS_INTERVAL_SECONDS = 1
private const val MAX_GPS_INTERVAL_SECONDS = 30
private const val MIN_SCREEN_BRIGHTNESS_PERCENT = 1
private const val MAX_SCREEN_BRIGHTNESS_PERCENT = 100
private const val MIN_TRACKING_ZOOM_LEVEL = 8.0
private const val MAX_TRACKING_ZOOM_LEVEL = 17.0
private val SETTINGS_STEPPER_BUTTON_WIDTH = 88.dp
private val SETTINGS_INPUT_WIDTH = 112.dp

@Composable
private fun TrailLiteTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) {
            darkColorScheme(
                primary = Color(0xFFA8C7E8),
                secondary = Color(0xFFFFB4A4),
                surface = Color(0xFF171C20),
                background = Color(0xFF101417),
            )
        } else {
            lightColorScheme(
                primary = Color(0xFF17324D),
                secondary = Color(0xFFFF5733),
                surface = Color.White,
                background = Color(0xFFEEF2F3),
            )
        },
        content = content,
    )
}

@Composable
private fun TrailLiteScreen(
    state: TrailLiteUiState,
    onMapReady: (MapView, MapLibreMap) -> Unit,
    onShowRoutes: () -> Unit,
    onDismissRoutes: () -> Unit,
    onAddRoute: () -> Unit,
    onRouteSearchChange: (String) -> Unit,
    onRouteSortChange: (RouteSortMode) -> Unit,
    onSelectRoute: (BundledRoute) -> Unit,
    onShowMapSettings: () -> Unit,
    onDismissMapSettings: () -> Unit,
    onLayerSettingsChange: (MapLayerSettings) -> Unit,
    onToggleTracking: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        TrailMap(onMapReady = onMapReady)
        if (state.mapLayerSettings.showMapInfo || state.mapLayerSettings.showRouteInfo) {
            TopInfoCards(
                state = state,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
        BottomControls(
            state = state,
            onShowRoutes = onShowRoutes,
            onShowMapSettings = onShowMapSettings,
            onToggleTracking = onToggleTracking,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
        if (state.showRoutePicker) {
            RoutePickerDialog(
                routes = state.bundledRoutes,
                query = state.routeSearchQuery,
                sortMode = state.routeSortMode,
                currentLocation = state.currentLocation,
                onDismiss = onDismissRoutes,
                onAddRoute = onAddRoute,
                onQueryChange = onRouteSearchChange,
                onSortChange = onRouteSortChange,
                onSelectRoute = onSelectRoute,
            )
        }
        if (state.showMapSettings) {
            MapSettingsDialog(
                settings = state.mapLayerSettings,
                onDismiss = onDismissMapSettings,
                onChange = onLayerSettingsChange,
            )
        }
    }
}

@Composable
private fun BottomControls(
    state: TrailLiteUiState,
    onShowRoutes: () -> Unit,
    onShowMapSettings: () -> Unit,
    onToggleTracking: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding(),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        shadowElevation = 6.dp,
    ) {
        Column {
            if (state.busy) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "TrailLite",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    modifier = Modifier.widthIn(max = 82.dp),
                    overflow = TextOverflow.Ellipsis,
                )
                CommandButton(
                    icon = if (state.tracking) "■" else "▶",
                    label = if (state.tracking) "Stop" else "Start",
                    onClick = onToggleTracking,
                    primary = true,
                    modifier = Modifier.weight(1f),
                )
                CommandButton(
                    icon = "◇",
                    label = "Routes",
                    onClick = onShowRoutes,
                    modifier = Modifier.weight(1f),
                )
                CommandButton(
                    icon = "≡",
                    label = "Settings",
                    onClick = onShowMapSettings,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun CommandButton(
    icon: String,
    label: String,
    onClick: () -> Unit,
    primary: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val buttonContent: @Composable () -> Unit = {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(icon, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Spacer(modifier = Modifier.width(5.dp))
            Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
    if (primary) {
        Button(
            onClick = onClick,
            shape = RoundedCornerShape(8.dp),
            modifier = modifier,
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp),
        ) {
            buttonContent()
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            shape = RoundedCornerShape(8.dp),
            modifier = modifier,
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp),
        ) {
            buttonContent()
        }
    }
}

@Composable
private fun MapSettingsDialog(
    settings: MapLayerSettings,
    onDismiss: () -> Unit,
    onChange: (MapLayerSettings) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
        title = { Text("Settings") },
        text = {
            Column(
                modifier = Modifier
                    .widthIn(max = 420.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(
                    text = "Map layers",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                LayerSwitchRow(
                    label = "Street names",
                    checked = settings.streetNames,
                    onCheckedChange = { onChange(settings.copy(streetNames = it)) },
                )
                LayerSwitchRow(
                    label = "POIs",
                    checked = settings.pois,
                    onCheckedChange = { onChange(settings.copy(pois = it)) },
                )
                LayerSwitchRow(
                    label = "Buildings",
                    checked = settings.buildings,
                    onCheckedChange = { onChange(settings.copy(buildings = it)) },
                )
                LayerSwitchRow(
                    label = "Paths and tracks",
                    checked = settings.minorPaths,
                    onCheckedChange = { onChange(settings.copy(minorPaths = it)) },
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "GPS refresh",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(6.dp))
                GpsIntervalStepper(
                    seconds = settings.locationIntervalSeconds,
                    onChange = { seconds -> onChange(settings.copy(locationIntervalSeconds = seconds)) },
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Tracking camera",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                LayerSwitchRow(
                    label = "Automatic tracking zoom",
                    checked = settings.automaticTrackingZoom,
                    onCheckedChange = { onChange(settings.copy(automaticTrackingZoom = it)) },
                )
                DecimalStepper(
                    value = settings.trackingZoomLevel,
                    inputLabel = "Zoom",
                    step = 0.5,
                    range = MIN_TRACKING_ZOOM_LEVEL..MAX_TRACKING_ZOOM_LEVEL,
                    onChange = { zoom -> onChange(settings.copy(trackingZoomLevel = zoom)) },
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Display",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                LayerSwitchRow(
                    label = "Keep screen on",
                    checked = settings.keepScreenOn,
                    onCheckedChange = { onChange(settings.copy(keepScreenOn = it)) },
                )
                LayerSwitchRow(
                    label = "App brightness",
                    checked = settings.overrideSystemBrightness,
                    onCheckedChange = { onChange(settings.copy(overrideSystemBrightness = it)) },
                )
                PercentStepper(
                    percent = settings.screenBrightnessPercent,
                    onChange = { percent -> onChange(settings.copy(screenBrightnessPercent = percent)) },
                )
                LayerSwitchRow(
                    label = "Dark theme",
                    checked = settings.darkTheme,
                    onCheckedChange = { onChange(settings.copy(darkTheme = it)) },
                )
                LayerSwitchRow(
                    label = "Map info card",
                    checked = settings.showMapInfo,
                    onCheckedChange = { onChange(settings.copy(showMapInfo = it)) },
                )
                LayerSwitchRow(
                    label = "Route info card",
                    checked = settings.showRouteInfo,
                    onCheckedChange = { onChange(settings.copy(showRouteInfo = it)) },
                )
            }
        },
    )
}

@Composable
private fun DecimalStepper(
    value: Double,
    inputLabel: String,
    step: Double,
    range: ClosedFloatingPointRange<Double>,
    onChange: (Double) -> Unit,
) {
    SettingsStepperRow(
        decreaseLabel = "-${step.formatStepperValue()}",
        increaseLabel = "+${step.formatStepperValue()}",
        decreaseEnabled = value > range.start,
        increaseEnabled = value < range.endInclusive,
        onDecrease = { onChange((value - step).coerceIn(range.start, range.endInclusive)) },
        onIncrease = { onChange((value + step).coerceIn(range.start, range.endInclusive)) },
    ) {
        TextField(
            value = "%.1f".format(Locale.US, value),
            onValueChange = { text ->
                val parsed = text.replace(',', '.').toDoubleOrNull() ?: return@TextField
                onChange(parsed.coerceIn(range.start, range.endInclusive))
            },
            modifier = Modifier.width(SETTINGS_INPUT_WIDTH),
            singleLine = true,
            label = { Text(inputLabel) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            textStyle = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.Center),
        )
    }
}

@Composable
private fun PercentStepper(
    percent: Int,
    onChange: (Int) -> Unit,
) {
    SettingsStepperRow(
        decreaseLabel = "-5",
        increaseLabel = "+5",
        decreaseEnabled = percent > MIN_SCREEN_BRIGHTNESS_PERCENT,
        increaseEnabled = percent < MAX_SCREEN_BRIGHTNESS_PERCENT,
        onDecrease = { onChange((percent - 5).coerceIn(MIN_SCREEN_BRIGHTNESS_PERCENT, MAX_SCREEN_BRIGHTNESS_PERCENT)) },
        onIncrease = { onChange((percent + 5).coerceIn(MIN_SCREEN_BRIGHTNESS_PERCENT, MAX_SCREEN_BRIGHTNESS_PERCENT)) },
    ) {
        TextField(
            value = percent.toString(),
            onValueChange = { value ->
                val parsed = value.filter { it.isDigit() }.toIntOrNull() ?: return@TextField
                onChange(parsed.coerceIn(MIN_SCREEN_BRIGHTNESS_PERCENT, MAX_SCREEN_BRIGHTNESS_PERCENT))
            },
            modifier = Modifier.width(SETTINGS_INPUT_WIDTH),
            singleLine = true,
            label = { Text("%") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.Center),
        )
    }
}

private fun Double.formatStepperValue(): String {
    return if (this % 1.0 == 0.0) toInt().toString() else "%.1f".format(Locale.US, this)
}

@Composable
private fun GpsIntervalStepper(
    seconds: Int,
    onChange: (Int) -> Unit,
) {
    SettingsStepperRow(
        decreaseLabel = "-1",
        increaseLabel = "+1",
        decreaseEnabled = seconds > MIN_GPS_INTERVAL_SECONDS,
        increaseEnabled = seconds < MAX_GPS_INTERVAL_SECONDS,
        onDecrease = { onChange((seconds - 1).coerceIn(MIN_GPS_INTERVAL_SECONDS, MAX_GPS_INTERVAL_SECONDS)) },
        onIncrease = { onChange((seconds + 1).coerceIn(MIN_GPS_INTERVAL_SECONDS, MAX_GPS_INTERVAL_SECONDS)) },
    ) {
        TextField(
            value = seconds.toString(),
            onValueChange = { value ->
                val parsed = value.filter { it.isDigit() }.toIntOrNull() ?: return@TextField
                onChange(parsed.coerceIn(MIN_GPS_INTERVAL_SECONDS, MAX_GPS_INTERVAL_SECONDS))
            },
            modifier = Modifier.width(SETTINGS_INPUT_WIDTH),
            singleLine = true,
            label = { Text("sec") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.Center),
        )
    }
}

@Composable
private fun SettingsStepperRow(
    decreaseLabel: String,
    increaseLabel: String,
    decreaseEnabled: Boolean,
    increaseEnabled: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    input: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedButton(
            onClick = onDecrease,
            enabled = decreaseEnabled,
            modifier = Modifier.width(SETTINGS_STEPPER_BUTTON_WIDTH),
            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp),
        ) {
            Text(decreaseLabel, maxLines = 1, textAlign = TextAlign.Center)
        }
        input()
        OutlinedButton(
            onClick = onIncrease,
            enabled = increaseEnabled,
            modifier = Modifier.width(SETTINGS_STEPPER_BUTTON_WIDTH),
            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp),
        ) {
            Text(increaseLabel, maxLines = 1, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun LayerSwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
}

@Composable
private fun RoutePickerDialog(
    routes: List<BundledRoute>,
    query: String,
    sortMode: RouteSortMode,
    currentLocation: GeoPoint?,
    onDismiss: () -> Unit,
    onAddRoute: () -> Unit,
    onQueryChange: (String) -> Unit,
    onSortChange: (RouteSortMode) -> Unit,
    onSelectRoute: (BundledRoute) -> Unit,
) {
    val filteredRoutes = routes
        .filter { route -> query.isBlank() || route.title.contains(query, ignoreCase = true) }
        .sortedWith(routeComparator(sortMode, currentLocation))
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
        title = { Text("${filteredRoutes.size} Routes") },
        text = {
            Column(modifier = Modifier.widthIn(max = 520.dp)) {
                Button(onClick = onAddRoute, modifier = Modifier.fillMaxWidth()) {
                    Text("Add route")
                }
                Spacer(modifier = Modifier.height(8.dp))
                TextField(
                    value = query,
                    onValueChange = onQueryChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Search routes") },
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    RouteSortButton(
                        label = "Nearby",
                        selected = sortMode == RouteSortMode.Nearby,
                        onClick = { onSortChange(RouteSortMode.Nearby) },
                    )
                    RouteSortButton(
                        label = "A-Z",
                        selected = sortMode == RouteSortMode.Name,
                        onClick = { onSortChange(RouteSortMode.Name) },
                    )
                    RouteSortButton(
                        label = "Length",
                        selected = sortMode == RouteSortMode.Length,
                        onClick = { onSortChange(RouteSortMode.Length) },
                    )
                }
                LazyColumn {
                    items(filteredRoutes, key = { it.id }) { route ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelectRoute(route) }
                                .padding(vertical = 10.dp),
                        ) {
                            Text(
                                text = route.title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = route.subtitle(sortMode, currentLocation),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        HorizontalDivider()
                    }
                }
            }
        },
    )
}

@Composable
private fun RouteSortButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    if (selected) {
        Button(onClick = onClick) {
            Text(label)
        }
    } else {
        OutlinedButton(onClick = onClick) {
            Text(label)
        }
    }
}

private fun routeComparator(sortMode: RouteSortMode, currentLocation: GeoPoint?): Comparator<BundledRoute> {
    return when (sortMode) {
        RouteSortMode.Nearby -> compareBy<BundledRoute>(
            { route -> route.distanceFrom(currentLocation) ?: Double.POSITIVE_INFINITY },
            { route -> route.title.lowercase(Locale.getDefault()) },
        )
        RouteSortMode.Name -> compareBy { route -> route.title.lowercase(Locale.getDefault()) }
        RouteSortMode.Length -> compareBy<BundledRoute>(
            { route -> route.lengthKm },
            { route -> route.title.lowercase(Locale.getDefault()) },
        )
    }
}

private fun BundledRoute.subtitle(sortMode: RouteSortMode, currentLocation: GeoPoint?): String {
    val base = "${lengthLabel()} | $durationText"
    if (sortMode != RouteSortMode.Nearby) return base
    val distance = distanceFrom(currentLocation)?.formatDistance() ?: "--"
    return "$distance away | $base"
}

private fun BundledRoute.distanceFrom(location: GeoPoint?): Double? {
    val routeBounds = bounds ?: return null
    val current = location ?: return null
    val nearest = GeoPoint(
        latitude = current.latitude.coerceIn(routeBounds.minLat, routeBounds.maxLat),
        longitude = current.longitude.coerceIn(routeBounds.minLon, routeBounds.maxLon),
    )
    return current.distanceTo(nearest)
}

private fun BundledRoute.lengthLabel(): String {
    val km = if (lengthKm % 1.0 == 0.0) {
        lengthKm.toInt().toString()
    } else {
        "%.1f".format(Locale.US, lengthKm)
    }
    return "$km km"
}

@Composable
private fun TopInfoCards(
    state: TrailLiteUiState,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (state.mapLayerSettings.showMapInfo) {
            FloatingInfoCard {
                Text(
                    text = "Map",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${state.status} | ${state.mapName ?: "none"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "Zoom: ${state.mapZoom?.let { "%.1f".format(Locale.US, it) } ?: "--"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (state.mapLayerSettings.showRouteInfo) {
            FloatingInfoCard {
                Text(
                    text = "Route",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${state.trackName ?: "none"} (${state.trackPointCount} pts)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = state.locationText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                state.navigation?.let { navigation ->
                    Text(
                        text = if (navigation.isOffRoute) {
                            "Off route by ${navigation.distanceToRouteMeters.formatDistance()}"
                        } else {
                            "On route (${navigation.distanceToRouteMeters.formatDistance()} from line)"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (navigation.isOffRoute) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "Progress ${navigation.progressPercent}% | remaining ${navigation.remainingDistanceMeters.formatDistance()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun FloatingInfoCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.88f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        shadowElevation = 4.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            content = content,
        )
    }
}

private fun Double.formatDistance(): String {
    return if (this < 1000.0) {
        "${toInt()} m"
    } else {
        "%.1f km".format(Locale.US, this / 1000.0)
    }
}

@Composable
private fun TrailMap(onMapReady: (MapView, MapLibreMap) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnMapReady by rememberUpdatedState(onMapReady)
    val mapView = remember {
        MapLibre.getInstance(context.applicationContext)
        MapView(context).apply { onCreate(null) }
    }

    DisposableEffect(lifecycleOwner, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onDestroy()
        }
    }

    LaunchedEffect(mapView) {
        mapView.getMapAsync { map -> currentOnMapReady(mapView, map) }
    }

    AndroidView(
        factory = { mapView },
        modifier = Modifier.fillMaxSize(),
    )
}
