package com.example.traillite

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
        uiState = uiState.copy(
            mapName = initialMap?.name,
            bundledRoutes = BundledRouteCatalog.load(this),
            mapLayerSettings = layerSettingsStore.load(),
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
            )
        }

        setContent {
            TrailLiteTheme {
                TrailLiteScreen(
                    state = uiState,
                    onMapReady = { mapView, map ->
                        val controller = TrailMapController(this, mapView, map, storage)
                        mapController = controller
                        controller.applyLayerSettings(uiState.mapLayerSettings)
                        controller.loadInitialStyle(storage.preferredMapPackage())
                    },
                    onImportMap = { importMapLauncher.launch(MAP_MIME_TYPES) },
                    onImportTrack = { importTrackLauncher.launch(TRACK_MIME_TYPES) },
                    onShowRoutes = { uiState = uiState.copy(showRoutePicker = true) },
                    onDismissRoutes = { uiState = uiState.copy(showRoutePicker = false) },
                    onRouteSearchChange = { query -> uiState = uiState.copy(routeSearchQuery = query) },
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
            locationClient.start()
        }
    }

    override fun onStop() {
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
        if (uri != null) importTrack(uri)
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

    private fun importTrack(uri: Uri) {
        uiState = uiState.copy(busy = true, status = "Importing GPX")
        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val file = storage.copyTrack(uri)
                    val points = GpxParser.parseTrackPoints(file.inputStream())
                    file to points
                }
            }.onSuccess { (file, points) ->
                activeTrackPoints = points
                mapController?.setTrack(points)
                uiState = uiState.copy(
                    busy = false,
                    trackName = file.name,
                    trackPointCount = points.size,
                    navigation = latestLocationPoint?.let { RouteNavigation.analyze(it, points) },
                    status = if (points.size >= 2) "GPX loaded" else "GPX has fewer than 2 track points",
                )
            }.onFailure { error ->
                uiState = uiState.copy(busy = false, status = error.message ?: "GPX import failed")
            }
        }
    }

    private fun loadBundledRoute(route: BundledRoute) {
        uiState = uiState.copy(busy = true, showRoutePicker = false, status = "Loading ${route.title}")
        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val points = assets.open(route.gpxAsset).use { GpxParser.parseTrackPoints(it) }
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
            importTrack(intent.data!!)
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
        locationClient.start()
        uiState = uiState.copy(tracking = true, status = "GPS tracking every 10s")
    }

    private fun updateLayerSettings(settings: MapLayerSettings) {
        layerSettingsStore.save(settings)
        mapController?.applyLayerSettings(settings)
        uiState = uiState.copy(mapLayerSettings = settings)
    }

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
    val bundledRoutes: List<BundledRoute> = emptyList(),
    val showRoutePicker: Boolean = false,
    val routeSearchQuery: String = "",
    val showMapSettings: Boolean = false,
    val mapLayerSettings: MapLayerSettings = MapLayerSettings(),
)

@Composable
private fun TrailLiteTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFF17324D),
            secondary = Color(0xFFFF5733),
            surface = Color.White,
            background = Color(0xFFEEF2F3),
        ),
        content = content,
    )
}

@Composable
private fun TrailLiteScreen(
    state: TrailLiteUiState,
    onMapReady: (MapView, MapLibreMap) -> Unit,
    onImportMap: () -> Unit,
    onImportTrack: () -> Unit,
    onShowRoutes: () -> Unit,
    onDismissRoutes: () -> Unit,
    onRouteSearchChange: (String) -> Unit,
    onSelectRoute: (BundledRoute) -> Unit,
    onShowMapSettings: () -> Unit,
    onDismissMapSettings: () -> Unit,
    onLayerSettingsChange: (MapLayerSettings) -> Unit,
    onToggleTracking: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        TrailMap(onMapReady = onMapReady)
        TopControls(
            state = state,
            onImportMap = onImportMap,
            onImportTrack = onImportTrack,
            onShowRoutes = onShowRoutes,
            onShowMapSettings = onShowMapSettings,
            onToggleTracking = onToggleTracking,
            modifier = Modifier.align(Alignment.TopCenter),
        )
        BottomStatus(
            state = state,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
        if (state.showRoutePicker) {
            RoutePickerDialog(
                routes = state.bundledRoutes,
                query = state.routeSearchQuery,
                onDismiss = onDismissRoutes,
                onQueryChange = onRouteSearchChange,
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
private fun TopControls(
    state: TrailLiteUiState,
    onImportMap: () -> Unit,
    onImportTrack: () -> Unit,
    onShowRoutes: () -> Unit,
    onShowMapSettings: () -> Unit,
    onToggleTracking: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .background(Color.White.copy(alpha = 0.94f)),
    ) {
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "TrailLite",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
            )
            OutlinedButton(onClick = onImportMap) {
                Text("Map")
            }
            OutlinedButton(onClick = onShowRoutes) {
                Text("Routes")
            }
            OutlinedButton(onClick = onShowMapSettings) {
                Text("Layers")
            }
            Button(
                onClick = onImportTrack,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
            ) {
                Text("GPX")
            }
            TextButton(onClick = onToggleTracking) {
                Text(if (state.tracking) "Stop" else "Start")
            }
        }
        if (state.busy) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
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
        title = { Text("Map layers") },
        text = {
            Column(modifier = Modifier.widthIn(max = 420.dp)) {
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
            }
        },
    )
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
    onDismiss: () -> Unit,
    onQueryChange: (String) -> Unit,
    onSelectRoute: (BundledRoute) -> Unit,
) {
    val filteredRoutes = routes.filter { route ->
        query.isBlank() || route.title.contains(query, ignoreCase = true)
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
        title = { Text("Routes") },
        text = {
            Column(modifier = Modifier.widthIn(max = 520.dp)) {
                TextField(
                    value = query,
                    onValueChange = onQueryChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Search routes") },
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "${filteredRoutes.size} routes",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(4.dp))
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
                                text = "${route.lengthLabel()} | ${route.durationText}",
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

private fun BundledRoute.lengthLabel(): String {
    val km = if (lengthKm % 1.0 == 0.0) {
        lengthKm.toInt().toString()
    } else {
        "%.1f".format(Locale.US, lengthKm)
    }
    return "$km km"
}

@Composable
private fun BottomStatus(
    state: TrailLiteUiState,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding(),
        color = Color.White.copy(alpha = 0.94f),
        shadowElevation = 2.dp,
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(
                text = state.status,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "Map: ${state.mapName ?: "none"}",
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "Track: ${state.trackName ?: "none"} (${state.trackPointCount} pts)",
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = state.locationText,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            state.navigation?.let { navigation ->
                Spacer(modifier = Modifier.height(6.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(6.dp))
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
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
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
